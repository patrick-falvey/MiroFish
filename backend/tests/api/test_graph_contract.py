import pytest
import io
from unittest.mock import patch, MagicMock

@patch('app.api.graph.FileParser')
@patch('app.api.graph.TextProcessor')
@patch('app.api.graph.OntologyGenerator')
@patch('app.api.graph.ProjectManager')
def test_ontology_generate_contract(mock_project_manager, mock_ontology_generator_class, mock_text_processor, mock_file_parser, client):
    # Mock project
    mock_project = MagicMock()
    mock_project.project_id = "proj_123"
    mock_project.name = "Test Project"
    mock_project.files = []
    
    mock_project.ontology = {
        "entity_types": [],
        "edge_types": []
    }
    mock_project.analysis_summary = "test summary"
    mock_project.total_text_length = 100
    mock_project_manager.create_project.return_value = mock_project
    
    mock_project_manager.save_file_to_project.return_value = {"original_filename": "test.pdf", "size": 100, "path": "dummy/path"}
    mock_file_parser.extract_text.return_value = "dummy text"
    mock_text_processor.preprocess_text.return_value = "dummy text"
    
    mock_ontology_generator = MagicMock()
    mock_ontology_generator.generate.return_value = {
        "entity_types": [],
        "edge_types": [],
        "analysis_summary": "test summary"
    }
    mock_ontology_generator_class.return_value = mock_ontology_generator
    
    # We need to send multipart/form-data
    data = {
        'project_name': 'Test Project',
        'simulation_requirement': 'Test requirement',
        'files': (io.BytesIO(b'dummy pdf content'), 'test.pdf')
    }
    
    response = client.post('/api/graph/ontology/generate', data=data, content_type='multipart/form-data')
    
    assert response.status_code == 200
    result = response.json
    assert result["success"] is True
    assert result["data"]["project_id"] == "proj_123"
    assert "ontology" in result["data"]

@patch('app.api.graph.TaskManager')
def test_get_task_status_contract(mock_task_manager_class, client):
    mock_task = MagicMock()
    mock_task.to_dict.return_value = {
        "task_id": "task_123",
        "task_type": "ontology_generation",
        "status": "processing",
        "progress": 50,
        "message": "Processing...",
        "result": None,
        "error": None
    }
    mock_task_manager_instance = MagicMock()
    mock_task_manager_instance.get_task.return_value = mock_task
    mock_task_manager_class.return_value = mock_task_manager_instance
    
    response = client.get('/api/graph/task/task_123')
    
    assert response.status_code == 200
    data = response.json
    assert data["success"] is True
    assert data["data"]["status"] == "processing"
    assert data["data"]["progress"] == 50
