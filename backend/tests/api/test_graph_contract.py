import pytest
import io
from unittest.mock import patch, MagicMock

# We removed the mock patches here because the new FastAPI router is hardcoded
# to return the mock contract response for Phase 0 testing.
def test_ontology_generate_contract(client):
    # We need to send multipart/form-data for FastAPI
    data = {
        'project_name': 'Test Project',
        'simulation_requirement': 'Test requirement'
    }
    files = {
        'files': ('test.pdf', io.BytesIO(b'dummy pdf content'), 'application/pdf')
    }
    
    response = client.post('/api/graph/ontology/generate', data=data, files=files)
    
    assert response.status_code == 200
    result = response.json()
    assert result["success"] is True
    assert result["data"]["project_id"] == "proj_123"
    assert "ontology" in result["data"]

def test_get_task_status_contract(client):
    response = client.get('/api/graph/task/task_123')
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["status"] == "processing"
    assert data["data"]["progress"] == 50
