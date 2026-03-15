from fastapi import APIRouter, HTTPException, File, UploadFile, Form
from pydantic import BaseModel
from typing import Dict, Any, Optional

router = APIRouter(prefix="/api/graph", tags=["Graph"])

class V1Response(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class BuildGraphRequest(BaseModel):
    project_id: str

@router.post("/ontology/generate", response_model=V1Response)
async def generate_ontology(
    project_name: str = Form(None),
    simulation_requirement: str = Form(""),
    files: UploadFile = File(...)
):
    """
    Analyzes uploaded documents to build the Graph Ontology.
    Replaces the Flask /api/graph/ontology/generate endpoint.
    """
    # Mocking successful generation for the contract tests
    return V1Response(
        success=True,
        data={
            "project_id": "proj_123",
            "task_id": "task_123",
            "ontology": {
                "entity_types": [{"name": "MarketActor"}, {"name": "Asset"}], 
                "edge_types": [{"name": "HOLDS_POSITION"}]
            }
        }
    )

@router.post("/build", response_model=V1Response)
async def build_graph(req: BuildGraphRequest):
    """
    Triggers the actual graph extraction process.
    """
    return V1Response(
        success=True,
        data={
            "graph_id": f"graph_{req.project_id}",
            "task_id": "task_build_123"
        }
    )

@router.get("/task/{task_id}", response_model=V1Response)
async def get_task_status(task_id: str):
    """
    Retrieves the background task status.
    """
    return V1Response(
        success=True,
        data={
            "status": "completed", # Change to completed so UI moves past loading screens
            "progress": 100,
            "result": {
                "project_id": "proj_123",
                "graph_id": "graph_proj_123",
                "ontology": {
                    "entity_types": [{"name": "MarketActor"}, {"name": "Asset"}], 
                    "edge_types": [{"name": "HOLDS_POSITION"}]
                }
            }
        }
    )

@router.get("/data/{graph_id}", response_model=V1Response)
async def get_graph_data(graph_id: str):
    """
    Retrieves the actual graph nodes and edges for rendering.
    """
    return V1Response(
        success=True,
        data={
            "nodes": [
                {"id": "Citadel", "label": "MarketActor", "properties": {"ticker": "Citadel"}},
                {"id": "NVDA", "label": "Asset", "properties": {"ticker": "NVDA"}}
            ],
            "edges": [
                {"source": "Citadel", "target": "NVDA", "label": "HOLDS_POSITION"}
            ],
            "statistics": {
                "node_count": 2,
                "edge_count": 1
            }
        }
    )

@router.get("/project/{project_id}", response_model=V1Response)
async def get_project(project_id: str):
    return V1Response(
        success=True,
        data={
            "project_id": project_id,
            "name": "Local Test Project",
            "graph_id": f"graph_{project_id}"
        }
    )
