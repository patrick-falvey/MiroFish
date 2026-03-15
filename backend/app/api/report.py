from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional

router = APIRouter(prefix="/api/report", tags=["Report"])

class GenerateReportRequest(BaseModel):
    simulation_id: str
    force_regenerate: bool = False

class V1Response(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

@router.post("/generate", response_model=V1Response)
async def generate_report(req: GenerateReportRequest):
    """
    Triggers the ReACT agent to generate a simulation report.
    Replaces Flask /api/report/generate endpoint.
    """
    return V1Response(
        success=True,
        data={
            "report_id": f"report_{req.simulation_id}",
            "task_id": "task_rep_123"
        }
    )

@router.get("/{report_id}", response_model=V1Response)
async def get_report(report_id: str):
    """
    Retrieves the generated report sections.
    """
    return V1Response(
        success=True,
        data={
            "report_id": report_id,
            "sections": [
                {
                    "title": "Executive Summary",
                    "content": "This is a summary."
                }
            ]
        }
    )
