import pytest
from unittest.mock import patch, MagicMock

@patch('app.api.report.ProjectManager')
@patch('app.api.report.ReportManager')
def test_generate_report_contract(mock_report_manager_class, mock_project_manager, client):
    mock_state = MagicMock()
    mock_state.report_id = "rep_123"
    mock_state.status = MagicMock(value="completed")
    
    mock_report_manager_class.get_report_by_simulation.return_value = None
    mock_report_manager_class.create_report.return_value = mock_state
    
    mock_project = MagicMock()
    mock_project.simulation_requirement = "test"
    mock_project.graph_id = "graph_123"
    mock_project_manager.get_project.return_value = mock_project
    
    # We also need to patch SimulationManager to prevent it from returning None
    with patch('app.api.report.SimulationManager') as mock_sim_manager_class:
        mock_sim_state = MagicMock()
        mock_sim_state.project_id = "proj_123"
        mock_sim_manager_instance = MagicMock()
        mock_sim_manager_instance.get_simulation.return_value = mock_sim_state
        mock_sim_manager_class.return_value = mock_sim_manager_instance
        
        with patch('app.api.report.TaskManager') as mock_task_manager_class:
            mock_task_manager = MagicMock()
            mock_task_manager.create_task.return_value = "task_rep_123"
            mock_task_manager_class.return_value = mock_task_manager
            
            payload = {
                "simulation_id": "sim_123",
                "force_regenerate": False
            }
            
            response = client.post('/api/report/generate', json=payload)
            
            assert response.status_code == 200
            data = response.json
            assert data["success"] is True
            assert data["data"]["report_id"].startswith("report_")
            assert data["data"]["task_id"] == "task_rep_123"
@patch('app.api.report.ReportManager')
def test_get_report_contract(mock_report_manager_class, client):
    mock_state = MagicMock()
    mock_state.to_dict.return_value = {
        "report_id": "rep_123",
        "simulation_id": "sim_123",
        "status": "completed",
        "sections": [
            {
                "id": "sec_1",
                "title": "Executive Summary",
                "content": "This is a summary."
            }
        ]
    }
    mock_report_manager_class.get_report.return_value = mock_state
    
    response = client.get('/api/report/rep_123')
    
    assert response.status_code == 200
    data = response.json
    assert data["success"] is True
    assert data["data"]["report_id"] == "rep_123"
    assert len(data["data"]["sections"]) == 1
    assert data["data"]["sections"][0]["title"] == "Executive Summary"
