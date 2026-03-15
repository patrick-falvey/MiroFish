import asyncio
import json
import logging
from typing import List, Dict, Any
import boto3

from .action_translator import translate_llm_intent_to_abides

logger = logging.getLogger(__name__)

class LLMCoordinator:
    """
    Coordinates concurrent LLM calls for multiple agents and translates
    their reasoning into ABIDES-compatible order messages.
    
    Implements Rate Limit Defenses (Cross-Region Inference & Attention Wake-Up).
    """
    def __init__(self, llm_client_mock=None):
        # Allow injecting a mock client for testing, otherwise use AWS Bedrock
        self.llm_client = llm_client_mock
        
        # Bedrock Client with Cross-Region Inference support
        # By providing inference profiles instead of base model ARNs, AWS automatically
        # routes traffic across us-east-1, us-east-2, us-west-2, pooling the rate limits.
        if not self.llm_client:
            self.bedrock = boto3.client(
                service_name='bedrock-runtime',
                region_name='us-east-1' # Entry region for cross-region routing
            )
            # Default to fast/cheap model with high limits for mass simulation
            self.model_id = 'us.anthropic.claude-3-haiku-20240307-v1:0' 

        # State tracking for Attention Mechanism
        self.previous_portfolio_values = {}

    def _should_wake_up_agent(self, agent_id: int, state: dict) -> bool:
        """
        Attention Wake-Up Mechanism:
        Decides if an agent actually needs to spend an API call this tick.
        """
        # If there's a major news event flagged in the state, always wake up
        if state.get("breaking_news"):
            return True
            
        current_portfolio_value = state.get("portfolio", {}).get("total_value", 0)
        previous_value = self.previous_portfolio_values.get(agent_id)
        
        # If we have no history, wake up to establish initial positions
        if previous_value is None:
            self.previous_portfolio_values[agent_id] = current_portfolio_value
            return True
            
        # Only wake up if portfolio value changed by more than 1% (heuristic)
        # In a real environment, this might check if an order was filled.
        if previous_value > 0:
            change_pct = abs(current_portfolio_value - previous_value) / previous_value
            if change_pct > 0.01:
                self.previous_portfolio_values[agent_id] = current_portfolio_value
                return True
                
        return False

    async def get_agent_decision(self, agent_id: int, state: dict) -> str:
        """Single asynchronous LLM call for one agent."""
        if self.llm_client:
            return await self.llm_client(agent_id, state)
            
        # Actually call Bedrock if no mock is provided
        try:
            # We use a thread pool to wrap the synchronous boto3 call
            # A fully native asyncboto3 client (aioboto3) is better for strict production
            prompt = f"You are a financial agent. Current state: {json.dumps(state)}. Reply with JSON only."
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 512,
                "temperature": 0.1,
                "messages": [{"role": "user", "content": prompt}]
            })
            
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, 
                lambda: self.bedrock.invoke_model(
                    body=body,
                    modelId=self.model_id,
                    accept='application/json',
                    contentType='application/json'
                )
            )
            
            response_body = json.loads(response.get('body').read())
            return response_body.get('content', [{}])[0].get('text', "{}")
            
        except Exception as e:
            logger.error(f"Bedrock invocation failed for agent {agent_id}: {str(e)}")
            return "{}"

    async def get_batched_actions(self, agent_ids: list, states: dict, current_time: int) -> list:
        """
        Gathers decisions from all agents concurrently and translates them into ABIDES messages.
        """
        tasks = []
        active_agent_ids = []
        
        # Apply Attention Wake-Up Filter
        for aid in agent_ids:
            agent_state = states.get(aid, {})
            if self._should_wake_up_agent(aid, agent_state):
                tasks.append(self.get_agent_decision(aid, agent_state))
                active_agent_ids.append(aid)
            else:
                # Agent skips this turn to save AWS rate limits
                pass
                
        # Fan out network calls concurrently
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        all_messages = []
        for agent_id, response in zip(active_agent_ids, responses):
            if isinstance(response, Exception):
                # Log error and skip if an LLM call failed (e.g. ThrottlingException)
                logger.warning(f"Skipping agent {agent_id} due to API error: {str(response)}")
                continue
            
            # Translate JSON string to ABIDES order messages
            msgs = translate_llm_intent_to_abides(agent_id, current_time, response)
            all_messages.extend(msgs)
            
        return all_messages
