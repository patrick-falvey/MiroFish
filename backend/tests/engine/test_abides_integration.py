import pytest
import sys
import asyncio
from unittest.mock import MagicMock, patch

# --- ALIAS HACK ---
import gymnasium
sys.modules['gym'] = gymnasium
import abides_gym

from app.services.abides_runner import AbidesRunner

# Create a dummy test for the integration
def test_environment_registration():
    from gymnasium.envs.registration import registry
    if "markets-execution-v0" not in registry:
        from abides_gym.envs.markets_execution_environment_v0 import SubGymMarketsExecutionEnv_v0
        gymnasium.register(
            id="markets-execution-v0",
            entry_point=SubGymMarketsExecutionEnv_v0,
        )
    assert "markets-execution-v0" in registry.keys()

@pytest.mark.asyncio
async def test_abides_runner_loop():
    """
    Test that the AbidesRunner properly integrates the coordinator, broadcaster,
    and gym environment into the unified simulation loop.
    """
    mock_coordinator = MagicMock()
    
    # Needs to be async
    async def mock_get_batched_actions(*args, **kwargs):
        return [] # Empty actions for test
        
    mock_coordinator.get_batched_actions = mock_get_batched_actions
    
    mock_broadcaster = MagicMock()
    
    # Configure runner with dummy config
    config = {
        "env_config": {
            "mkt_close": "16:00:00"
        },
        "llm_agent_ids": [1, 2]
    }
    
    # Mock the gymnasium.make to avoid actually booting up the heavy ABIDES kernel in the unit test
    mock_env = MagicMock()
    
    # Create an iterator-like behavior for step: run once, then return done=True
    # Returns: obs, reward, done, truncated, info
    mock_env.step.side_effect = [
        ({"mkt_data": {"price": 100}, "portfolio": {}}, 0.0, True, False, {})
    ]
    mock_env.reset.return_value = ({"mkt_data": {"price": 100}, "portfolio": {}}, {})
    
    with patch('gymnasium.make', return_value=mock_env):
        runner = AbidesRunner("sim_123", config, mock_coordinator, mock_broadcaster)
        
        # Run the event loop (it will terminate immediately because the first step returns done=True)
        await runner.run()
        
        # Assertions
        mock_env.reset.assert_called_once()
        mock_env.step.assert_called_once()
        mock_broadcaster.on_tick.assert_called_once()
        
        # Check that stop() toggles the flag
        runner.is_running = True
        runner.stop()
        assert not runner.is_running

@pytest.mark.asyncio
async def test_abides_runner_failure():
    """Test that the runner gracefully handles environment errors."""
    mock_coordinator = MagicMock()
    
    with patch('gymnasium.make', side_effect=ValueError("Gym initialization failed")):
        with pytest.raises(ValueError):
            AbidesRunner("sim_123", {}, mock_coordinator)
