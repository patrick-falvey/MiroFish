from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.simulation import router as simulation_router
from .api.simulation import v2_router as simulation_v2_router
from .api.graph import router as graph_router
from .api.report import router as report_router

def create_fastapi_app() -> FastAPI:
    app = FastAPI(
        title="nVision Backend API",
        description="Async backend for financial market simulation",
        version="2.0.0"
    )

    # Add CORS middleware to match Flask setup
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health check
    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "MiroFish Backend"}

    # Include routers
    app.include_router(simulation_router)
    app.include_router(simulation_v2_router)
    app.include_router(graph_router)
    app.include_router(report_router)
    
    return app
