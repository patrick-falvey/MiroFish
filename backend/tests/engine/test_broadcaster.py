import pytest
from unittest.mock import patch, MagicMock

# The Broadcaster Hook captures simulated ticks and prepares them for the UI
class MarketDataBroadcaster:
    """
    Listens to the ABIDES Gym environment state and broadcasts tick data.
    """
    def __init__(self, simulation_id: str, redis_client=None):
        self.simulation_id = simulation_id
        self.redis_client = redis_client

    def on_tick(self, current_time: str, l2_state: dict):
        """
        Receives L2 Order book state from ABIDES Gym observation and formats it.
        """
        if not l2_state:
            return None
            
        bids = l2_state.get('bids', [])
        asks = l2_state.get('asks', [])
        
        best_bid = bids[0][0] if bids else 0
        best_ask = asks[0][0] if asks else 0
        
        # In ABIDES, price is often represented in cents
        best_bid = best_bid / 100.0 if best_bid else 0
        best_ask = best_ask / 100.0 if best_ask else 0
        
        # Calculate mid price
        if best_bid and best_ask:
            price = (best_bid + best_ask) / 2
        else:
            price = best_bid or best_ask

        tick = {
            "symbol": l2_state.get('symbol', 'UNKNOWN'),
            "timestamp": current_time,
            "price": price,
            "bid": best_bid,
            "ask": best_ask,
            "volume": l2_state.get('volume', 0)
        }
        
        if self.redis_client:
            self.redis_client.publish(
                f"sim_{self.simulation_id}_market_data", 
                str(tick)
            )
            
        return tick

def test_broadcaster_formats_data_correctly():
    mock_redis = MagicMock()
    broadcaster = MarketDataBroadcaster("sim_123", redis_client=mock_redis)
    
    # Mocking ABIDES Gym observation L2 state format
    # Prices are in cents
    l2_state = {
        "symbol": "NVDA",
        "bids": [[14550, 100], [14540, 500]],
        "asks": [[14560, 200], [14570, 800]],
        "volume": 15000
    }
    
    tick = broadcaster.on_tick("10:05:00", l2_state)
    
    assert tick["symbol"] == "NVDA"
    assert tick["timestamp"] == "10:05:00"
    assert tick["bid"] == 145.50
    assert tick["ask"] == 145.60
    assert tick["price"] == 145.55 # Mid price
    assert tick["volume"] == 15000
    
    mock_redis.publish.assert_called_once()
    args = mock_redis.publish.call_args[0]
    assert args[0] == "sim_sim_123_market_data"
    assert "145.55" in args[1]

def test_broadcaster_handles_empty_book():
    broadcaster = MarketDataBroadcaster("sim_123")
    
    l2_state = {
        "symbol": "TSMC",
        "bids": [],
        "asks": [],
        "volume": 0
    }
    
    tick = broadcaster.on_tick("10:06:00", l2_state)
    
    assert tick["bid"] == 0
    assert tick["ask"] == 0
    assert tick["price"] == 0