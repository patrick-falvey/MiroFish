import pytest
import asyncio
from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient

# We will implement this manager in the actual code
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

# The mock FastAPI application we are testing against
app = FastAPI()
manager = ConnectionManager()

@app.websocket("/api/v2/ws/simulation/{simulation_id}/market-data")
async def websocket_endpoint(websocket: WebSocket, simulation_id: str):
    await manager.connect(websocket)
    try:
        while True:
            # We don't expect the client to send us data, just keep connection alive
            await websocket.receive_text()
    except Exception:
        manager.disconnect(websocket)

@pytest.fixture
def client():
    return TestClient(app)

def test_websocket_connection_and_broadcast(client):
    # Establish a websocket connection
    with client.websocket_connect("/api/v2/ws/simulation/sim_123/market-data") as websocket:
        # Verify connection was successful
        assert len(manager.active_connections) == 1
        
        # Simulate the Broadcaster (from Phase 1) pushing a tick to the manager
        mock_tick = {
            "symbol": "NVDA",
            "timestamp": "10:05:00",
            "price": 145.55,
            "volume": 15000
        }
        
        # In a real async environment, the Redis listener would call manager.broadcast()
        # For the test, we trigger it directly using the async event loop run
        asyncio.run(manager.broadcast(mock_tick))
        
        # Assert the client received the exact JSON
        data = websocket.receive_json()
        assert data["symbol"] == "NVDA"
        assert data["price"] == 145.55

    # Verify disconnection happened when context manager exits
    assert len(manager.active_connections) == 0
