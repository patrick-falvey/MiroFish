import pytest
from fastapi.testclient import TestClient
from app.main import create_fastapi_app

@pytest.fixture
def app():
    # Use the new FastAPI app
    app = create_fastapi_app()
    yield app

@pytest.fixture
def client(app):
    # Use FastAPI's TestClient
    return TestClient(app)
