import pytest
import asyncio
import json
from unittest.mock import AsyncMock, patch
from abides_markets.messages.order import MarketOrderMsg, LimitOrderMsg

# Import the translator we built
from .test_action_translator import translate_llm_intent_to_abides

class LLMCoordinator:
    """
    Coordinates concurrent LLM calls for multiple agents and translates
    their reasoning into ABIDES-compatible order messages.
    """
    def __init__(self, llm_client_mock=None):
        self.llm_client = llm_client_mock

    async def get_agent_decision(self, agent_id: int, state: dict) -> str:
        """Single asynchronous LLM call for one agent."""
        if self.llm_client:
            return await self.llm_client(agent_id, state)
        return "{}"

    async def get_batched_actions(self, agent_ids: list, states: dict, current_time: int) -> list:
        """
        Gathers decisions from all agents concurrently and translates them into ABIDES messages.
        """
        # Fan out network calls concurrently
        tasks = [self.get_agent_decision(aid, states.get(aid, {})) for aid in agent_ids]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        all_messages = []
        for agent_id, response in zip(agent_ids, responses):
            if isinstance(response, Exception):
                # Log error and skip if an LLM call failed
                continue
            
            # Translate JSON string to ABIDES order messages
            msgs = translate_llm_intent_to_abides(agent_id, current_time, response)
            all_messages.extend(msgs)
            
        return all_messages

@pytest.mark.asyncio
async def test_coordinator_batching():
    # Mock network function that simulates network delay and returns valid intents
    async def mock_network_call(agent_id, state):
        await asyncio.sleep(0.01) # Simulate network IO
        if agent_id % 2 == 0:
            return '{"action": "BUY", "symbol": "NVDA", "quantity": 100, "order_type": "MARKET"}'
        else:
            return '{"action": "SELL", "symbol": "TSMC", "quantity": 50, "order_type": "LIMIT", "limit_price": 150.0}'

    coordinator = LLMCoordinator(llm_client_mock=mock_network_call)
    
    agent_ids = list(range(50)) # 50 concurrent agents
    states = {aid: {"cash": 100000} for aid in agent_ids}
    current_time = 1000
    
    # Run the batch
    actions = await coordinator.get_batched_actions(agent_ids, states, current_time)
    
    # 50 agents should produce 50 ABIDES messages
    assert len(actions) == 50
    
    market_orders = [a for a in actions if isinstance(a, MarketOrderMsg)]
    limit_orders = [a for a in actions if isinstance(a, LimitOrderMsg)]
    
    assert len(market_orders) == 25
    assert len(limit_orders) == 25

@pytest.mark.asyncio
async def test_coordinator_handles_failures_gracefully():
    # Simulates an API failure for agent 2
    async def flaky_network_call(agent_id, state):
        if agent_id == 2:
            raise ValueError("Bedrock ThrottlingException")
        return '{"action": "BUY", "symbol": "AAPL", "quantity": 10, "order_type": "MARKET"}'

    coordinator = LLMCoordinator(llm_client_mock=flaky_network_call)
    
    agent_ids = [1, 2, 3]
    states = {}
    
    actions = await coordinator.get_batched_actions(agent_ids, states, 1000)
    
    # Should safely return actions for agent 1 and 3, skipping the failed agent 2
    assert len(actions) == 2
    assert all(a.order.agent_id in [1, 3] for a in actions)
