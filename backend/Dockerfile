# syntax=docker/dockerfile:1

FROM python:3.12-slim

# Install system dependencies required by ABIDES and general compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy uv from official image for blazing fast python installs
COPY --from=ghcr.io/astral-sh/uv:0.5.2 /uv /uvx /bin/

WORKDIR /app

# Copy dependency files first to leverage Docker layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies using uv
# We use --frozen to ensure exact versions from the lockfile
RUN uv sync --frozen --no-dev

# Copy the actual application code
COPY app/ ./app/
COPY scripts/ ./scripts/
COPY run.py ./

# Expose the FastAPI port
EXPOSE 5001

# Start the uvicorn server
CMD ["uv", "run", "run.py"]
