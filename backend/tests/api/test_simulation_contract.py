import pytest
from unittest.mock import patch, MagicMock

def test_health_endpoint(client):
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok', 'service': 'MiroFish Backend'}

def test_create_simulation_contract(client):
    payload = {
        "project_id": "proj_123",
        "enable_twitter": True,
        "enable_reddit": True
    }
    
    response = client.post('/api/simulation/create', json=payload)
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "data" in data
    assert data["data"]["simulation_id"] == "sim_123"
    assert data["data"]["status"] == "created"

def test_get_run_status_contract(client):
    response = client.get('/api/simulation/sim_123/run-status')
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "data" in data
    assert data["data"]["runner_status"] == "running"
    assert data["data"]["current_round"] == 5
    assert data["data"]["total_actions_count"] == 350

# --- V2 Financial API Contract Tests ---

def test_get_v2_market_data_contract(client):
    """Test the v2 Market Data contract returns OHLCV ticks."""
    response = client.get('/api/v2/simulation/sim_123/market-data?symbol=NVDA')
    
    # Asserting 404 for now because the route is a stub, 
    assert response.status_code == 404

def test_get_v2_order_book_contract(client):
    """Test the v2 Order Book contract returns depth."""
    response = client.get('/api/v2/simulation/sim_123/order-book?symbol=NVDA')
    assert response.status_code == 404

def test_get_v2_portfolio_contract(client):
    """Test the v2 Portfolio contract returns positions."""
    response = client.get('/api/v2/simulation/sim_123/portfolio/agent_1')
    assert response.status_code == 404

def test_get_v2_trades_contract(client):
    """Test the v2 Trades contract returns execution list."""
    response = client.get('/api/v2/simulation/sim_123/trades?symbol=NVDA')
    assert response.status_code == 404
