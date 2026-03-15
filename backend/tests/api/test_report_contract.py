import pytest

def test_generate_report_contract(client):
    payload = {
        "simulation_id": "sim_123",
        "force_regenerate": False
    }

    response = client.post('/api/report/generate', json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["report_id"].startswith("report_")
    assert data["data"]["task_id"] == "task_rep_123"

def test_get_report_contract(client):
    response = client.get('/api/report/rep_123')

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["report_id"] == "rep_123"
    assert len(data["data"]["sections"]) == 1
    assert data["data"]["sections"][0]["title"] == "Executive Summary"
