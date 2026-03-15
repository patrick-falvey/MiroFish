from fastapi import APIRouter, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import asyncio
import json

# Setup routers
router = APIRouter(prefix="/api/simulation", tags=["Simulation"])
v2_router = APIRouter(prefix="/api/v2/simulation", tags=["Simulation V2"])

from app.services.data.market_store import MarketDataStore
from app.services.abides_runner import AbidesRunner
from app.services.engine.llm_coordinator import LLMCoordinator

# --- WebSocket Connection Manager ---
class ConnectionManager:
    def __init__(self):
        # Map simulation_id to list of websockets
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, simulation_id: str):
        await websocket.accept()
        if simulation_id not in self.active_connections:
            self.active_connections[simulation_id] = []
        self.active_connections[simulation_id].append(websocket)

    def disconnect(self, websocket: WebSocket, simulation_id: str):
        if simulation_id in self.active_connections:
            self.active_connections[simulation_id].remove(websocket)

    async def broadcast(self, simulation_id: str, message: dict):
        if simulation_id in self.active_connections:
            for connection in self.active_connections[simulation_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    # Handle dead connections
                    pass

# Global instances
market_store = MarketDataStore()
active_runners: Dict[str, AbidesRunner] = {}
ws_manager = ConnectionManager()

# Pydantic schemas for the V1 API Contract
class CreateSimulationRequest(BaseModel):
    project_id: str
    enable_twitter: bool = True
    enable_reddit: bool = True

class V1Response(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

@router.post("/create", response_model=V1Response)
async def create_simulation(req: CreateSimulationRequest):
    return V1Response(
        success=True,
        data={
            "simulation_id": "sim_123",
            "project_id": req.project_id,
            "status": "created"
        }
    )

@router.get("/{simulation_id}/run-status", response_model=V1Response)
async def get_run_status(simulation_id: str):
    return V1Response(
        success=True,
        data={
            "simulation_id": simulation_id,
            "runner_status": "running",
            "current_round": 5,
            "total_actions_count": 350
        }
    )

@router.get("/history", response_model=V1Response)
async def get_history(limit: int = 20):
    return V1Response(success=True, data={"simulations": []})

@router.post("/prepare", response_model=V1Response)
async def prepare_simulation(req: Dict[str, Any]):
    return V1Response(success=True, data={"task_id": "mock_task_id"})

@router.post("/prepare/status", response_model=V1Response)
async def get_prepare_status(req: Dict[str, Any]):
    return V1Response(success=True, data={"status": "completed", "progress": 100})

@router.post("/env-status", response_model=V1Response)
async def get_env_status(req: Dict[str, Any]):
    return V1Response(success=True, data={"twitter_status": "ready", "reddit_status": "ready"})

@router.get("/{simulation_id}", response_model=V1Response)
async def get_simulation(simulation_id: str):
    return V1Response(success=True, data={"simulation_id": simulation_id, "status": "created", "project_id": "proj_123"})

@router.get("/{simulation_id}/config", response_model=V1Response)
async def get_simulation_config(simulation_id: str):
    return V1Response(success=True, data={"config": {"time_config": {"minutes_per_round": 1}}})

@router.get("/{simulation_id}/profiles/realtime", response_model=V1Response)
async def get_simulation_profiles_realtime(simulation_id: str):
    return V1Response(success=True, data={"profiles": [], "stage": "completed"})

@router.get("/{simulation_id}/config/realtime", response_model=V1Response)
async def get_simulation_config_realtime(simulation_id: str):
    return V1Response(success=True, data={"config_generated": True, "stage": "completed"})

@router.post("/start", response_model=V1Response)
async def start_simulation(req: Dict[str, Any], background_tasks: BackgroundTasks):
    sim_id = req.get("simulation_id", "sim_123")
    
    # Broadcast Adapter that pushes to both DuckDB and WebSockets
    class BroadcasterAdapter:
        def on_tick(self, current_time, mkt_data):
            if not mkt_data: return
            
            # Format tick
            bids, asks = mkt_data.get('bids', []), mkt_data.get('asks', [])
            bb = bids[0][0] / 100.0 if bids else 0
            ba = asks[0][0] / 100.0 if asks else 0
            
            from datetime import datetime
            iso_time = datetime.now().isoformat()

            tick = {
                "symbol": mkt_data.get('symbol', 'NVDA'),
                "timestamp": iso_time,
                "price": (bb + ba) / 2 if bb and ba else (bb or ba),
                "volume": mkt_data.get('volume', 0),
                "bid": bb,
                "ask": ba
            }
            
            # Save to history
            market_store.insert_tick(sim_id, tick)
            
            # Broadcast to UI
            asyncio.create_task(ws_manager.broadcast(sim_id, tick))

    coordinator = LLMCoordinator()
    runner = AbidesRunner(sim_id, {"llm_agent_ids": [1, 2]}, coordinator, BroadcasterAdapter())
    active_runners[sim_id] = runner
    background_tasks.add_task(runner.run)
    
    return V1Response(success=True, data={"message": "Simulation started"})

@router.post("/stop", response_model=V1Response)
async def stop_simulation(req: Dict[str, Any]):
    sim_id = req.get("simulation_id")
    if sim_id in active_runners:
        active_runners[sim_id].stop()
    return V1Response(success=True, data={"message": "Simulation stopped"})

# --- V2 Financial API Endpoints ---

@v2_router.get("/{simulation_id}/market-data")
async def get_market_data(simulation_id: str, symbol: str):
    ticks = market_store.get_market_data(simulation_id, symbol)
    return {"success": True, "data": {"ticks": ticks}}

@v2_router.websocket("/ws/simulation/{simulation_id}/market-data")
async def websocket_market_data(websocket: WebSocket, simulation_id: str):
    await ws_manager.connect(websocket, simulation_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, simulation_id)

@v2_router.get("/{simulation_id}/order-book")
async def get_order_book(simulation_id: str, symbol: str):
    raise HTTPException(status_code=404)

@v2_router.get("/{simulation_id}/portfolio/{agent_id}")
async def get_portfolio(simulation_id: str, agent_id: str):
    raise HTTPException(status_code=404)

@v2_router.get("/{simulation_id}/trades")
async def get_trades(simulation_id: str, symbol: str):
    raise HTTPException(status_code=404)
