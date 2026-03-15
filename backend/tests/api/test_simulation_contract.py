import pytest
from unittest.mock import patch, MagicMock

def test_health_endpoint(client):
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json == {'status': 'ok', 'service': 'MiroFish Backend'}

@patch('app.api.simulation.ProjectManager')
@patch('app.api.simulation.SimulationManager')
def test_create_simulation_contract(mock_sim_manager_class, mock_project_manager, client):
    # Mock project
    mock_project = MagicMock()
    mock_project.graph_id = "test_graph_id"
    mock_project_manager.get_project.return_value = mock_project
    
    # Mock simulation state
    mock_state = MagicMock()
    mock_state.to_dict.return_value = {
        "simulation_id": "sim_123",
        "project_id": "proj_123",
        "graph_id": "test_graph_id",
        "status": "created",
        "enable_twitter": True,
        "enable_reddit": True,
        "created_at": "2025-12-01T10:00:00"
    }
    
    mock_sim_manager_instance = MagicMock()
    mock_sim_manager_instance.create_simulation.return_value = mock_state
    mock_sim_manager_class.return_value = mock_sim_manager_instance

    payload = {
        "project_id": "proj_123",
        "enable_twitter": True,
        "enable_reddit": True
    }
    
    response = client.post('/api/simulation/create', json=payload)
    
    assert response.status_code == 200
    data = response.json
    assert data["success"] is True
    assert "data" in data
    assert data["data"]["simulation_id"] == "sim_123"
    assert data["data"]["status"] == "created"

@patch('app.api.simulation.SimulationRunner')
def test_get_run_status_contract(mock_simulation_runner, client):
    mock_run_state = MagicMock()
    mock_run_state.to_dict.return_value = {
        "simulation_id": "sim_123",
        "runner_status": "running",
        "current_round": 5,
        "total_rounds": 100,
        "progress_percent": 5.0,
        "simulated_hours": 2,
        "total_simulation_hours": 72,
        "twitter_running": True,
        "reddit_running": True,
        "twitter_actions_count": 150,
        "reddit_actions_count": 200,
        "total_actions_count": 350,
        "started_at": "2025-12-01T10:00:00",
        "updated_at": "2025-12-01T10:30:00"
    }
    mock_simulation_runner.get_run_state.return_value = mock_run_state

    response = client.get('/api/simulation/sim_123/run-status')
    
    assert response.status_code == 200
    data = response.json
    assert data["success"] is True
    assert "data" in data
    assert data["data"]["runner_status"] == "running"
    assert data["data"]["current_round"] == 5
    assert data["data"]["total_actions_count"] == 350
