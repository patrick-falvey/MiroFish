# nVision Migration Plan (Test-Driven Approach)

This plan outlines the steps to migrate the MiroFish architecture into the nVision platform as described in the `docs/strategy/` folder. The entire migration is driven by a Test-Driven Development (TDD) lifecycle to guarantee functional parity and safety while refactoring.

## Objective
Migrate from a single-tenant, social-media-focused prototype (Flask/OASIS) to a multi-tenant, cloud-native financial market simulation platform (FastAPI/ABIDES) without breaking the established API contracts.

## Key Files & Context
- **Backend:** Flask (to be FastAPI), Python 3.11, Zep Cloud (to be Neptune), OASIS (to be replaced with ABIDES).
- **Frontend:** Vue 3 (legacy) / React 19 (target).
- **Core Logic:** `backend/app/services/simulation_runner.py`, `backend/scripts/run_parallel_simulation.py`, `backend/app/api/simulation.py`.

## Phases & TDD Lifecycle

### Phase 0: The API Contract Freeze (Status: Completed)
*Goal: Lock down the current frontend-backend communication contracts to provide a black-box safety net for refactoring.*
- [x] **TDD: Write Integration Tests:** Create `pytest` fixtures asserting schemas and status codes for `/api/simulation/create`, `/api/simulation/{id}/run-status`, `/api/graph/ontology/generate`, and `/api/report/generate`.
- [x] **Verify Baseline:** Ensure all tests pass against the legacy Flask/OASIS application.

### Phase 1: Financial Domain & ABIDES Engine Swap (Short-term)
*Goal: Deprecate the OASIS engine and replace it with the ABIDES matching engine locally, driven by new unit tests.*
- [ ] **TDD: Test the Gym/LLM Action Translator:** Write tests ensuring mock LLM JSON intents correctly parse into ABIDES `OUCH` format messages (e.g. `SubmitOrder`, `CancelOrder`).
- [ ] **TDD: Test the LLM Coordinator Loop:** Write tests simulating an asynchronous batch of 50 agent requests and verify the array is correctly injected into `env.step()`.
- [ ] **Implementation:** 
    - Integrate `ABIDES-Gym` as the bridge between async LLMs and the synchronous ABIDES discrete event kernel.
    - Update `ontology_generator.py` and ReACT extraction to output financial entities and ABIDES-compatible variables (e.g. exogenous true value).
- [ ] **Validation:** Run Phase 0 contract tests to ensure the `/api/simulation/start` endpoint still behaves identically from the frontend's perspective.

### Phase 2: The Real-Time SaaS Pipeline (Medium-term)
*Goal: Move from synchronous local scripts to async distributed workers suitable for web applications.*
- [ ] **TDD: Test Message Broadcaster:** Write tests ensuring ABIDES `ITCH` event logs are formatted correctly to a mock Redis Pub/Sub channel.
- [ ] **TDD: Test WebSocket Fanout:** Assert that mock price updates injected into the server are received accurately by the WebSocket client.
- [ ] **Implementation:**
    - Isolate the ABIDES simulation loop into a dedicated background worker (e.g., AWS ECS/SQS).
    - Migrate backend from **Flask to FastAPI** to support concurrent LLM IO and native WebSockets.
- [ ] **Validation:** Run Phase 0 contract tests against the new FastAPI deployment.

### Phase 3: Multi-Tenant Cloud Data Architecture (Medium-term)
*Goal: Securely partition data and scale the graph database.*
- [ ] **TDD: Test Tenant Isolation:** Write security tests asserting that requests querying a mismatched `tenant_id` return `403 Forbidden`.
- [ ] **TDD: Test FinDKG Pipeline:** Verify that mock financial extractions generate correct Gremlin/SPARQL statements for Neptune.
- [ ] **Implementation:**
    - Replace local `backend/uploads/` with **Amazon S3** (tenant-isolated prefixes).
    - Replace Zep Cloud with **Amazon Neptune**.
    - Replace local JSON state files with **DynamoDB** (partitioned by tenant_id).
    - Integrate **AWS Cognito** JWT validation into FastAPI middleware.

### Phase 4: Intelligence, ML, and Calibration (Long-term)
*Goal: Add mathematical rigor to the simulation outputs.*
- [ ] **TDD: Test Prompt Sensitivity Mitigation:** Write tests ensuring different LLM phrasings ("Dump NVDA", "Sell all NVDA") parse to the same constrained quantitative order bounds.
- [ ] **TDD: Test Conformal Prediction Limits:** Feed mock historical residual arrays and assert the generated confidence bounds encompass the expected statistical threshold (e.g. 90%).
- [ ] **Implementation:**
    - Deploy SageMaker Endpoints for Event Impact, Action Prediction, and Cascade Risk.
    - Implement the **ANTR neural posterior estimation** loop to fine-tune background ABIDES heuristic agents against historical data.

## Continuous Verification
- **Test Command:** Execute `cd backend && uv run pytest tests/` continuously during development.
- **Contract Rule:** A Phase is incomplete until the Phase 0 API contract tests return to green.
