import asyncio
import logging
from typing import Dict, Any, List

# Setup Gymnasium with alias for abides-gym
import sys
import gymnasium as gym
if 'gym' not in sys.modules or sys.modules['gym'] != gym:
    sys.modules['gym'] = gym
import abides_gym

logger = logging.getLogger(__name__)

class AbidesRunner:
    """
    The core financial simulation orchestrator.
    Hooks into ABIDES-Gym, runs the discrete event loop, and delegates
    reasoning to the LLMCoordinator.
    """
    
    def __init__(self, simulation_id: str, config: Dict[str, Any], coordinator, broadcaster=None):
        self.simulation_id = simulation_id
        self.config = config
        self.coordinator = coordinator
        self.broadcaster = broadcaster
        self.is_running = False
        self.env = None
        
        # Initialize the Gym environment
        # We use the markets-execution-v0 as our base which allows injecting external orders
        # into a background market ecology (Market Makers, Value, Momentum agents).
        env_config = {
            "background_config": "rmsc04", # Standard realistic market config in ABIDES
            "mkt_close": "16:00:00",
            "timestep_duration": "60s",    # Pause the simulator every 1 minute for LLM intervention
        }
        # Merge custom config
        env_config.update(config.get("env_config", {}))
        
        try:
            self.env = gym.make("markets-execution-v0", **env_config)
        except Exception as e:
            logger.error(f"Failed to initialize ABIDES-Gym: {str(e)}")
            raise e

    async def run(self):
        """
        Executes the main simulation loop.
        """
        logger.info(f"Starting ABIDES simulation {self.simulation_id}")
        self.is_running = True
        
        try:
            # 1. Reset environment to get initial state
            obs, info = self.env.reset()
            done = False
            truncated = False
            
            # The list of agent IDs representing our LLM personas 
            # In a real implementation, this comes from the Knowledge Graph setup
            llm_agent_ids = self.config.get("llm_agent_ids", [1, 2, 3])
            
            while not done and not truncated and self.is_running:
                current_time = self._extract_time_from_obs(obs)
                
                # 2. Broadcast live market data to React UI
                if self.broadcaster:
                    self.broadcaster.on_tick(current_time, obs.get("mkt_data", {}))
                
                # 3. Format state for LLMs
                states = self._format_agent_states(obs, llm_agent_ids)
                
                # 4. Get batched decisions from LLMs (concurrently)
                # The coordinator returns a list of ABIDES OrderMsg objects
                actions = await self.coordinator.get_batched_actions(llm_agent_ids, states, current_time)
                
                # 5. Step the discrete event simulator
                obs, reward, done, truncated, info = self.env.step(actions)
                
                # Optional: Add artificial delay if we need to throttle UI updates or API calls
                await asyncio.sleep(0.1)

            logger.info(f"Simulation {self.simulation_id} completed successfully.")
            
        except Exception as e:
            logger.error(f"Simulation {self.simulation_id} failed: {str(e)}")
            raise e
        finally:
            self.is_running = False
            if self.env:
                self.env.close()
                
    def stop(self):
        """Signals the loop to stop early."""
        self.is_running = False

    def _extract_time_from_obs(self, obs: dict) -> str:
        """Extracts human readable timestamp from ABIDES observation."""
        # ABIDES internal time is nanoseconds since midnight
        # Simplified for now, we will map this properly later
        return "10:00:00"

    def _format_agent_states(self, obs: dict, agent_ids: List[int]) -> Dict[int, dict]:
        """
        Takes the raw numerical observation from ABIDES and formats it 
        into discrete dictionaries for each LLM agent.
        """
        # In a real implementation, we parse the portfolio and L2 book 
        # and attach the specific persona from the Knowledge Graph.
        states = {}
        for aid in agent_ids:
            states[aid] = {
                "market_data": obs.get("mkt_data", {}),
                "portfolio": obs.get("portfolio", {})
            }
        return states
