import pytest
from unittest.mock import patch, MagicMock
from app.services.data.market_store import MarketDataStore

@pytest.fixture
def store():
    # Use an in-memory database for testing so it's wiped after every run
    db = MarketDataStore(":memory:")
    yield db
    db.close()

def test_insert_and_retrieve_tick(store):
    sim_id = "sim_123"
    symbol = "NVDA"
    
    tick = {
        "symbol": symbol,
        "timestamp": "10:05:00",
        "price": 145.55,
        "volume": 15000,
        "bid": 145.50,
        "ask": 145.60
    }
    
    # Insert
    store.insert_tick(sim_id, tick)
    
    # Retrieve
    data = store.get_market_data(sim_id, symbol)
    
    assert len(data) == 1
    assert data[0]["price"] == 145.55
    assert data[0]["volume"] == 15000

def test_retrieve_filters_by_simulation_and_symbol(store):
    store.insert_tick("sim_A", {"symbol": "NVDA", "price": 100.0})
    store.insert_tick("sim_A", {"symbol": "TSMC", "price": 150.0})
    store.insert_tick("sim_B", {"symbol": "NVDA", "price": 200.0})
    
    # Should only get sim_A NVDA
    data = store.get_market_data("sim_A", "NVDA")
    
    assert len(data) == 1
    assert data[0]["price"] == 100.0

def test_retrieve_orders_by_timestamp(store):
    store.insert_tick("sim_1", {"symbol": "NVDA", "timestamp": "10:06:00", "price": 102.0})
    store.insert_tick("sim_1", {"symbol": "NVDA", "timestamp": "10:05:00", "price": 101.0})
    store.insert_tick("sim_1", {"symbol": "NVDA", "timestamp": "10:04:00", "price": 100.0})
    
    data = store.get_market_data("sim_1", "NVDA")
    
    assert len(data) == 3
    # Check ascending order
    assert data[0]["price"] == 100.0
    assert data[2]["price"] == 102.0

def test_insert_tick_exception_handling(store):
    # Force an exception by breaking the connection
    store.conn.close()
    
    # This shouldn't raise an exception, it should be caught and logged
    store.insert_tick("sim_X", {"symbol": "NVDA", "price": 100.0})

def test_get_market_data_exception_handling(store):
    # Force an exception by breaking the connection
    store.conn.close()
    
    # This shouldn't raise an exception, it should return an empty list
    data = store.get_market_data("sim_X", "NVDA")
    assert data == []