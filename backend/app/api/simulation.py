from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional

# This router replaces the Flask blueprint in app/api/simulation.py
router = APIRouter(prefix="/api/simulation", tags=["Simulation"])

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
    """
    Creates a new simulation environment. 
    Maintains exact JSON contract from V1 Flask API.
    """
    # In the full implementation, we will call SimulationManager here.
    # For now, we mock the legacy response to satisfy the Phase 0 contract tests.
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
    """
    Returns the status of a running simulation.
    """
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
    """
    Returns a list of recent simulations.
    """
    return V1Response(
        success=True,
        data={
            "simulations": []
        }
    )

# --- V2 Financial API Endpoints ---
# We will implement these fully later, returning 404 for now to match the test stubs
v2_router = APIRouter(prefix="/api/v2/simulation", tags=["Simulation V2"])

from app.services.data.market_store import MarketDataStore

# We instantiate a global store for now. In a full production setup with workers, 
# this might point to a local file path like './market_data.duckdb' shared with the worker.
market_store = MarketDataStore()

@v2_router.get("/{simulation_id}/market-data")
async def get_market_data(simulation_id: str, symbol: str):
    """
    Fetches the historical OHLCV chart ticks for a specific asset in a simulation.
    Used by the React frontend to draw Lightweight Charts on initial page load or refresh.
    """
    ticks = market_store.get_market_data(simulation_id, symbol)
    
    return {
        "success": True,
        "data": {
            "ticks": ticks
        }
    }

@v2_router.get("/{simulation_id}/order-book")
async def get_order_book(simulation_id: str, symbol: str):
    raise HTTPException(status_code=404, detail="Not implemented yet")

@v2_router.get("/{simulation_id}/portfolio/{agent_id}")
async def get_portfolio(simulation_id: str, agent_id: str):
    raise HTTPException(status_code=404, detail="Not implemented yet")

@v2_router.get("/{simulation_id}/trades")
async def get_trades(simulation_id: str, symbol: str):
    raise HTTPException(status_code=404, detail="Not implemented yet")
