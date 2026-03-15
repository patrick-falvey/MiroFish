# nVision — Technical Architecture: Platform Migration

## Document Purpose

This document defines the technical architecture for migrating nVision from its current single-tenant prototype (forked from MiroFish) to a production multi-tenant SaaS platform ("Option B: The Platform Play"). It covers the current state, target state, migration path, AWS service mapping, data architecture, ML model infrastructure, API design, and operational concerns.

**Companion doc:** [PRODUCTIZATION.md](./PRODUCTIZATION.md) — business strategy, pricing, GTM, revenue projections.

---

## Table of Contents

1. [Current Architecture (as-is)](#1-current-architecture-as-is)
2. [Target Architecture (to-be)](#2-target-architecture-to-be)
3. [AWS Service Map](#3-aws-service-map)
4. [Multi-Tenancy Design](#4-multi-tenancy-design)
5. [Data Architecture](#5-data-architecture)
6. [ML Model Infrastructure](#6-ml-model-infrastructure)
7. [API Design](#7-api-design)
8. [Frontend Migration](#8-frontend-migration)
9. [Simulation Engine Redesign](#9-simulation-engine-redesign)
10. [Infrastructure & DevOps](#10-infrastructure--devops)
11. [Security & Compliance](#11-security--compliance)
12. [Migration Phases](#12-migration-phases)
13. [Cost Estimates](#13-cost-estimates)
14. [Risks & Technical Debt](#14-risks--technical-debt)

---

## 1. Current Architecture (as-is)

### Overview

nVision is currently a single-user, single-machine application forked from MiroFish. It runs as two co-located processes behind a shared Dockerfile.

```
┌─────────────────────────────────────────────────────────────┐
│                     Single Host (Docker)                     │
│                                                              │
│  ┌──────────────────┐      ┌─────────────────────────────┐  │
│  │  Frontend (React) │      │    Backend (Flask/Python)    │  │
│  │  Vite dev server  │      │    Port 5001                 │  │
│  │  Port 3000        │◄────►│                              │  │
│  │                    │      │  ┌──────────┐ ┌───────────┐ │  │
│  │  Pages:            │      │  │ Graph API │ │ Sim API   │ │  │
│  │  - Home            │      │  └──────────┘ └───────────┘ │  │
│  │  - Process (wizard)│      │  ┌──────────┐ ┌───────────┐ │  │
│  │  - Simulation View │      │  │Report API│ │ Sim Runner│ │  │
│  │  - Report View     │      │  └──────────┘ └───────────┘ │  │
│  │  - Interaction View│      │                              │  │
│  └──────────────────┘      └────────┬──────────┬──────────┘  │
│                                      │          │             │
│                              ┌───────▼──┐  ┌───▼──────────┐  │
│                              │ Zep Cloud │  │ OpenAI API   │  │
│                              │ (graph)   │  │ (LLM)        │  │
│                              └──────────┘  └──────────────┘  │
│                                                              │
│  Local filesystem: uploads/, simulations/, reports/          │
└─────────────────────────────────────────────────────────────┘
```

### Current Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS | Migrated from Vue; single SPA |
| Backend | Python 3.11 + Flask | Synchronous; single-process |
| Knowledge Graph | Zep Cloud API | Standalone graphs, episodes, entity/edge extraction |
| Simulation | OASIS (camel-oasis 0.2.5 + camel-ai 0.2.78) | Twitter + Reddit dual-platform social sim |
| LLM | OpenAI API (GPT-4o-mini default) | Via openai SDK, configurable base URL |
| Report Generation | Custom ReACT agent | LLM + Zep retrieval tools (InsightForge, PanoramaSearch, QuickSearch) |
| File Storage | Local filesystem (`backend/uploads/`) | PDFs, simulation data, reports |
| Config | `.env` file | Flat key-value, no secrets management |
| Deployment | Docker Compose (single container) | Ports 3000 (frontend) + 5001 (backend) |

### Current Backend Services

```
backend/app/
├── api/
│   ├── graph.py             # Graph build endpoints
│   ├── simulation.py        # Entity read, sim prepare/run, interview
│   └── report.py            # Report generation, chat
├── services/
│   ├── ontology_generator.py    # LLM → financial ontology schema
│   ├── text_processor.py        # Document chunking
│   ├── graph_builder.py         # Zep graph construction
│   ├── zep_entity_reader.py     # Entity extraction + filtering
│   ├── oasis_profile_generator.py  # Agent persona generation
│   ├── simulation_config_generator.py  # Sim parameter generation
│   ├── simulation_manager.py    # Sim lifecycle orchestration
│   ├── simulation_runner.py     # OASIS process runner + IPC
│   ├── simulation_ipc.py        # Inter-process communication
│   ├── zep_graph_memory_updater.py  # Post-sim graph updates
│   ├── zep_tools.py             # Retrieval tools for report agent
│   └── report_agent.py          # ReACT report generation + chat
├── models/
│   ├── task.py              # Async task tracking
│   └── project.py           # Project/simulation metadata
└── utils/
    ├── llm_client.py        # OpenAI-compatible LLM wrapper
    ├── file_parser.py       # PDF/MD/TXT extraction
    ├── zep_paging.py        # Zep pagination helper
    ├── retry.py             # Retry decorator
    └── logger.py            # Logging config
```

### Current Limitations

| Limitation | Impact on Platform |
|---|---|
| No authentication | Can't identify users or isolate data |
| Local filesystem storage | Can't scale horizontally; data loss risk |
| Synchronous Flask | Blocks on long-running LLM calls and simulations |
| Single Zep Cloud account | All graphs in one namespace; no tenant isolation |
| OASIS hardcoded for social media | Twitter/Reddit actions; needs financial action types |
| No billing/metering | Can't track usage per tenant |
| No API versioning | Breaking changes affect all users |
| Chinese-language prompts | System prompts in Mandarin; needs English for US market |
| In-memory task tracking | Tasks lost on restart; no persistent job queue |

---

## 2. Target Architecture (to-be)

### High-Level Architecture

```
                            ┌─────────────────────┐
                            │    CloudFront CDN    │
                            │    (React SPA)       │
                            └──────────┬──────────┘
                                       │
                            ┌──────────▼──────────┐
                            │   API Gateway        │
                            │   (REST + WebSocket) │
                            │   + WAF              │
                            └──────────┬──────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                   │
         ┌──────────▼────┐  ┌─────────▼────┐  ┌──────────▼─────┐
         │  Auth Service  │  │  Core API    │  │  WebSocket     │
         │  (Cognito)     │  │  (ECS/       │  │  Handler       │
         │                │  │   Fargate)   │  │  (Lambda)      │
         └────────────────┘  └──────┬──────┘  └────────────────┘
                                    │
              ┌────────────┬────────┼────────┬──────────────┐
              │            │        │        │              │
    ┌─────────▼──┐  ┌──────▼──┐ ┌──▼─────┐ ┌▼──────────┐ ┌▼──────────┐
    │ Knowledge  │  │ Sim     │ │ Report │ │ ML Model  │ │ Data      │
    │ Graph Svc  │  │ Engine  │ │ Agent  │ │ Service   │ │ Ingestion │
    │            │  │ (ECS)   │ │ (ECS)  │ │(SageMaker)│ │ Pipeline  │
    └─────┬──────┘  └────┬───┘ └───┬────┘ └─────┬─────┘ └─────┬─────┘
          │               │        │             │             │
    ┌─────▼──────┐  ┌─────▼────┐  ┌▼─────────┐  │      ┌──────▼──────┐
    │ Neptune    │  │ DynamoDB │  │ Bedrock   │  │      │ Kinesis     │
    │ (graph DB) │  │ (state)  │  │ (LLM)    │  │      │ (streaming) │
    └────────────┘  └──────────┘  └──────────┘  │      └─────────────┘
                                                │
    ┌────────────┐  ┌──────────┐  ┌──────────┐  │      ┌─────────────┐
    │ S3         │  │ SQS      │  │ Secrets  │  │      │ EventBridge │
    │ (storage)  │  │ (queues) │  │ Manager  │  │      │ (scheduling)│
    └────────────┘  └──────────┘  └──────────┘  │      └─────────────┘
                                                │
                                   ┌────────────▼─────────────┐
                                   │  SageMaker Endpoints     │
                                   │  - Event Impact Clf      │
                                   │  - Agent Action Pred     │
                                   │  - Cascade Probability   │
                                   │  - Confidence Estimator  │
                                   └──────────────────────────┘
```

### Design Principles

1. **Tenant isolation by default** — every data path is tenant-scoped; no shared-state leaks
2. **Async everything** — no synchronous blocking on LLM or simulation calls; all long-running work goes through job queues
3. **Hybrid LLM + ML** — LLMs for reasoning and novelty; ML models for precision and speed
4. **AWS-native** — use managed services over self-hosted where possible; minimize undifferentiated ops
5. **Event-driven** — use events for inter-service communication; services are loosely coupled
6. **Cost-aware** — metered per-tenant; right-size compute for each tier

---

## 3. AWS Service Map

### Compute

| Service | Role | Why |
|---|---|---|
| **ECS Fargate** | Core API, Sim Engine, Report Agent | Serverless containers; no cluster management; scales to zero for low-tier tenants |
| **Lambda** | WebSocket handler, webhooks, lightweight event processing | Sub-second cold start for real-time updates |
| **SageMaker Endpoints** | ML model inference (event classifier, action predictor, cascade model, confidence estimator) | Managed model hosting with auto-scaling; GPU when needed |
| **SageMaker Training** | Periodic model retraining (calibration) | Spot instances for cost; managed training pipelines |

### AI / ML

| Service | Role | Why |
|---|---|---|
| **Amazon Bedrock** | LLM orchestration (Claude for reasoning, Titan for embeddings) | Managed, no GPU provisioning; pay-per-token; supports multiple model families |
| **SageMaker** | Custom ML models (XGBoost, GNN, RNN, etc.) | Full control over training and deployment; supports any framework |

### Data / Storage

| Service | Role | Why |
|---|---|---|
| **Amazon Neptune** | Financial knowledge graph (replaces Zep for graph storage) | Native graph database; SPARQL + Gremlin; IAM-integrated; supports property graphs with tenant-scoped named graphs |
| **DynamoDB** | Simulation state, task tracking, project metadata, user preferences | Serverless, single-digit-ms latency, scales linearly; partition key = tenant_id |
| **S3** | Document uploads, simulation artifacts, report outputs, ML training data | Unlimited storage; lifecycle policies for cost management; prefix-based tenant isolation |
| **ElastiCache (Redis)** | Session cache, rate limiting, real-time simulation state broadcasting | Sub-ms latency for hot paths; pub/sub for WebSocket fanout |

### Messaging / Orchestration

| Service | Role | Why |
|---|---|---|
| **SQS** | Job queues (graph build, simulation run, report generation) | Decouples API from long-running work; dead-letter queues for failure handling; FIFO for ordered processing |
| **EventBridge** | Inter-service events (simulation complete → trigger report; report complete → notify user) | Native event bus; schema registry; retry policies |
| **Step Functions** | Multi-step pipeline orchestration (the 5-step wizard as a state machine) | Visual workflow; built-in error handling and retry; audit trail |
| **Kinesis Data Streams** | Real-time market data ingestion (for live monitoring tier) | High-throughput ordered streaming; multiple consumers |

### Networking / Security

| Service | Role | Why |
|---|---|---|
| **API Gateway** | REST + WebSocket APIs; rate limiting; API keys | Managed; integrates with Cognito authorizer; usage plans per tier |
| **WAF** | DDoS protection, rate limiting, geo-blocking | Required for financial services; blocks abuse |
| **Cognito** | Authentication, user pools, federated identity (SSO for enterprise) | Managed auth; supports SAML/OIDC for enterprise SSO; JWT tokens |
| **Secrets Manager** | API keys, database credentials, LLM keys | Rotation; audit trail; per-tenant secrets for enterprise |
| **CloudFront** | CDN for React SPA + API acceleration | Global edge; HTTPS termination; S3 origin for frontend |

### Observability

| Service | Role | Why |
|---|---|---|
| **CloudWatch** | Metrics, logs, alarms | Unified observability; custom metrics for simulation performance |
| **X-Ray** | Distributed tracing across services | End-to-end request tracing through API → SQS → ECS → Bedrock |
| **CloudWatch RUM** | Frontend performance monitoring | Real user metrics; error tracking |

---

## 4. Multi-Tenancy Design

### Isolation Model

**Shared infrastructure, isolated data.** All tenants share the same compute fleet but every data record is scoped by `tenant_id`.

```
┌─────────────────────────────────────────────┐
│              Shared Compute Layer            │
│  (ECS tasks, Lambda functions, SageMaker)   │
└─────────────┬───────────────────────────────┘
              │
   ┌──────────┼──────────┬────────────────┐
   │          │          │                │
   ▼          ▼          ▼                ▼
┌──────┐  ┌──────┐  ┌──────┐      ┌───────────┐
│Tenant│  │Tenant│  │Tenant│      │ Enterprise │
│  A   │  │  B   │  │  C   │ ... │  (Private) │
│      │  │      │  │      │      │            │
│ Data │  │ Data │  │ Data │      │ Dedicated  │
│ in:  │  │ in:  │  │ in:  │      │ Neptune +  │
│ S3   │  │ S3   │  │ S3   │      │ ECS tasks  │
│DynDB │  │DynDB │  │DynDB │      │            │
│Neptn │  │Neptn │  │Neptn │      └───────────┘
└──────┘  └──────┘  └──────┘
```

### Isolation by Layer

| Layer | Isolation Mechanism |
|---|---|
| **API** | JWT with `tenant_id` claim; API Gateway authorizer validates on every request |
| **Neptune (graph)** | Named graphs per tenant: `tenant:{tenant_id}:graph:{graph_id}` |
| **DynamoDB** | Partition key prefix: `TENANT#{tenant_id}` on every table |
| **S3** | Bucket prefix: `tenants/{tenant_id}/` with IAM policy scoping |
| **SQS** | Message attribute `tenant_id`; consumer filters |
| **Bedrock** | Shared; usage tagged per tenant for billing |
| **SageMaker** | Shared endpoints for standard tiers; dedicated endpoints for Enterprise |
| **Enterprise tier** | Option for fully dedicated Neptune instance, dedicated ECS task definition, VPC peering to client AWS account |

### Tenant Quotas

| Resource | Analyst | Professional | Enterprise |
|---|---|---|---|
| Simulation runs / month | 10 | Unlimited | Unlimited |
| Max agents per simulation | 50 | 500 | 2,000+ |
| Max concurrent simulations | 1 | 3 | 10 |
| Document upload storage | 1 GB | 10 GB | 100 GB |
| Knowledge graph nodes | 500 | 5,000 | 50,000 |
| Report retention | 30 days | 1 year | Unlimited |
| API rate limit | 100 req/min | 1,000 req/min | 10,000 req/min |

Quotas enforced at API Gateway (rate) + application layer (resource counts via DynamoDB counters).

---

## 5. Data Architecture

### Data Model (DynamoDB)

#### Tenants Table

```
PK: TENANT#{tenant_id}
SK: METADATA

Attributes:
  tenant_id: string (UUID)
  name: string
  tier: enum (analyst | professional | enterprise)
  created_at: ISO-8601
  billing_customer_id: string (Stripe customer ID)
  settings: map {
    default_llm_model: string
    default_simulation_rounds: number
    notification_preferences: map
  }
  usage: map {
    current_month_sim_runs: number
    storage_bytes: number
    graph_node_count: number
  }
```

#### Projects Table

```
PK: TENANT#{tenant_id}
SK: PROJECT#{project_id}

Attributes:
  project_id: string (UUID)
  name: string
  description: string
  status: enum (draft | graph_building | ready | simulating | completed)
  scenario_type: enum (earnings | regulatory | geopolitical | custom)
  created_at: ISO-8601
  updated_at: ISO-8601
  graph_id: string (Neptune graph reference)
  documents: list [{
    document_id: string
    filename: string
    s3_key: string
    parsed_at: ISO-8601
    chunk_count: number
  }]
```

#### Simulations Table

```
PK: TENANT#{tenant_id}
SK: SIM#{simulation_id}

Attributes:
  simulation_id: string (UUID)
  project_id: string
  status: enum (created | preparing | running | completed | failed)
  config: map {
    max_rounds: number
    agent_count: number
    time_step_minutes: number
    enable_cascade_detection: boolean
    ml_models_enabled: list [string]
  }
  agents: list [{
    agent_id: string
    type: enum (institutional | retail | algorithmic | market_maker | regulator)
    name: string
    persona_summary: string
  }]
  results_s3_key: string
  started_at: ISO-8601
  completed_at: ISO-8601
  compute_seconds: number
```

#### Reports Table

```
PK: TENANT#{tenant_id}
SK: REPORT#{report_id}

Attributes:
  report_id: string (UUID)
  simulation_id: string
  project_id: string
  status: enum (generating | completed | failed)
  report_s3_key: string
  scenarios: list [{
    name: string
    probability: number
    predicted_impact: map {
      direction: string
      magnitude_pct: number
      confidence_low: number
      confidence_high: number
      time_to_peak_hours: number
    }
  }]
  created_at: ISO-8601
```

### Knowledge Graph Schema (Neptune)

Neptune uses Apache TinkerPop / Gremlin for property graph queries.

#### Vertex Labels (Financial Entity Types)

```
Company
  - name, ticker, sector, market_cap, balance_sheet_summary
  - supply_chain_position, revenue_concentration

InstitutionalInvestor
  - name, type (hedge_fund | pension | mutual_fund | family_office | sovereign_wealth)
  - aum, mandate, known_positions (from 13F), leverage_ratio
  - risk_tolerance, reaction_speed, historical_drawdown_behavior

RetailCohort
  - name (e.g., "Reddit/WSB cohort", "Robinhood momentum traders")
  - estimated_size, sentiment_source, holding_pattern
  - loss_aversion_score, herding_tendency

AlgorithmicStrategy
  - name, type (momentum | mean_reversion | stat_arb | market_making | hft)
  - parameters (lookback, threshold, position_size_rule)
  - execution_speed, capacity

MarketMaker
  - name, inventory_model, typical_spread
  - gamma_exposure, delta_hedging_frequency

CentralBank
  - name, policy_framework, current_rate
  - stated_reaction_function, communication_cadence

Regulator
  - name, jurisdiction, enforcement_history
  - political_cycle_stage

Event
  - name, type (earnings | regulatory | geopolitical | macro | technical)
  - severity, timestamp, source_document_id
```

#### Edge Labels (Relationships)

```
SUPPLIES → (Company → Company)
  weight, revenue_pct, critical (boolean)

COMPETES_WITH → (Company → Company)
  overlap_pct, market

HOLDS_POSITION → (InstitutionalInvestor → Company)
  shares, value, pct_portfolio, entry_date, cost_basis

CREDIT_EXPOSURE → (InstitutionalInvestor → Company)
  amount, type (loan | bond | derivative)

TRACKS → (AlgorithmicStrategy → Company)
  signal_type, current_signal_value

REGULATES → (Regulator → Company | Sector)
  jurisdiction, regulatory_framework

POLICY_SENSITIVITY → (Company → CentralBank)
  sensitivity_bps (impact per 25bps rate change)

CORRELATES_WITH → (Company → Company)
  correlation, regime (risk_on | risk_off | normal)
  lookback_days

TRIGGERED_BY → (Event → Company | Sector)
  impact_direction, estimated_magnitude
```

### S3 Structure

```
s3://nvision-{env}-data/
├── tenants/
│   └── {tenant_id}/
│       ├── documents/
│       │   └── {document_id}/{filename}
│       ├── simulations/
│       │   └── {simulation_id}/
│       │       ├── config.json
│       │       ├── agent_profiles.json
│       │       ├── rounds/
│       │       │   ├── round_001.jsonl
│       │       │   └── ...
│       │       ├── order_book_snapshots/
│       │       └── results_summary.json
│       ├── reports/
│       │   └── {report_id}/
│       │       ├── report.md
│       │       ├── report.pdf
│       │       ├── agent_log.jsonl
│       │       └── charts/
│       └── exports/
├── ml/
│   ├── training-data/
│   │   ├── historical_events/
│   │   ├── agent_actions/
│   │   └── calibration/
│   ├── models/
│   │   └── {model_name}/{version}/
│   └── predictions/
└── shared/
    ├── market-data/
    │   ├── equities/
    │   ├── options/
    │   └── macro/
    └── reference/
        ├── sec-filings/
        └── entity-master/
```

---

## 6. ML Model Infrastructure

### Model Registry & Deployment

All ML models are trained in SageMaker, versioned in S3, and deployed to SageMaker real-time or serverless endpoints.

```
┌─────────────────────────────────────────────────────┐
│                  ML Model Lifecycle                   │
│                                                       │
│  ┌─────────┐    ┌───────────┐    ┌────────────────┐  │
│  │ Training │───►│ Model     │───►│ SageMaker      │  │
│  │ Pipeline │    │ Registry  │    │ Endpoint       │  │
│  │(SageMaker│    │ (S3 +     │    │ (real-time or  │  │
│  │ Training)│    │  DynamoDB)│    │  serverless)   │  │
│  └─────────┘    └───────────┘    └────────┬───────┘  │
│       ▲                                    │          │
│       │              ┌─────────────────────▼───────┐  │
│       │              │      Inference Router       │  │
│       │              │  (routes to correct model   │  │
│       │              │   version per tenant/tier)  │  │
│       │              └─────────────────────────────┘  │
│       │                                               │
│  ┌────┴──────────────────────────────────────┐        │
│  │         Calibration Feedback Loop          │        │
│  │  Prediction → Actual → Residual → Retrain  │        │
│  └────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

### Model Inventory

| Model | Framework | Training Data | Endpoint Type | Inference Latency | Retrain Cadence |
|---|---|---|---|---|---|
| **Event Impact Classifier** | XGBoost (SageMaker built-in) | 2+ years of market-moving events labeled with actual impact magnitude | Real-time (ml.m5.large) | <50ms | Weekly |
| **Agent Action Predictor** (institutional) | PyTorch neural net | 13F filing diffs, block trade data, historical flow | Real-time (ml.m5.xlarge) | <100ms | Weekly |
| **Agent Action Predictor** (retail) | LSTM (PyTorch) | Retail sentiment time series + subsequent flow data | Real-time (ml.m5.large) | <100ms | Weekly |
| **Supply Chain GNN** | PyTorch Geometric | Knowledge graph structure + earnings surprise propagation history | Real-time (ml.m5.xlarge) | <200ms | Monthly |
| **Correlation Regime Detector** | scikit-learn (HMM) | Rolling cross-asset return correlations | Serverless | <100ms | Daily |
| **Cascade Probability Model** | PyTorch RNN | Historical crash/cascade events with agent state snapshots | Real-time (ml.g5.xlarge GPU) | <300ms | Weekly |
| **Order Book Simulator** | PyTorch (neural ODE) | Historical L2 order book data | Real-time (ml.g5.xlarge GPU) | <500ms | Monthly |
| **Residual Error Model** | XGBoost (meta-learner) | Historical simulation predictions vs. actual outcomes | Serverless | <50ms | After each simulation (online) |
| **Confidence Estimator** | scikit-learn (conformal prediction) | Historical prediction accuracy data | Serverless | <30ms | After each simulation (online) |
| **Scenario Probability Weighter** | pgmpy (Bayesian network) | Market conditions vs. scenario outcomes | Serverless | <50ms | Weekly |
| **Time-to-Impact Estimator** | lifelines (survival model) | Event → peak-impact timing data | Serverless | <30ms | Monthly |
| **Entity Importance Ranker** | NetworkX (PageRank) | Knowledge graph topology | Lambda (no endpoint) | <100ms | Per graph build |

### Model A/B Testing

SageMaker endpoints support production variants. New model versions deploy as a shadow variant receiving 10% of traffic. Promotion to primary after 7 days of equivalent or better performance on residual error metrics.

### Enterprise Custom Calibration

Enterprise tenants can request custom model calibration:
1. Upload historical portfolio + trade data
2. SageMaker Training job fine-tunes Agent Action Predictor on their specific behavior
3. Dedicated SageMaker endpoint serves their custom model
4. Isolated from other tenants' models

---

## 7. API Design

### API Gateway Structure

```
Base URL: https://api.nvision.nclouds.com/v1

Authentication: Bearer token (Cognito JWT)
Tenant resolution: from JWT claims (cognito:groups or custom:tenant_id)
```

### Core Endpoints

#### Projects

```
POST   /v1/projects                          # Create project
GET    /v1/projects                          # List projects
GET    /v1/projects/{id}                     # Get project details
PUT    /v1/projects/{id}                     # Update project
DELETE /v1/projects/{id}                     # Delete project
```

#### Documents & Graph Build

```
POST   /v1/projects/{id}/documents           # Upload document(s)
GET    /v1/projects/{id}/documents            # List documents
DELETE /v1/projects/{id}/documents/{doc_id}   # Remove document

POST   /v1/projects/{id}/graph/build          # Trigger graph build (async)
GET    /v1/projects/{id}/graph                # Get graph summary
GET    /v1/projects/{id}/graph/entities       # List entities with filters
GET    /v1/projects/{id}/graph/entities/{eid} # Entity detail with edges
GET    /v1/projects/{id}/graph/edges          # List edges
```

#### Simulation

```
POST   /v1/projects/{id}/simulations          # Create & configure simulation
GET    /v1/projects/{id}/simulations           # List simulations
GET    /v1/simulations/{sim_id}               # Get simulation status/results
POST   /v1/simulations/{sim_id}/start         # Start simulation (async)
POST   /v1/simulations/{sim_id}/pause         # Pause
POST   /v1/simulations/{sim_id}/stop          # Stop
GET    /v1/simulations/{sim_id}/rounds/{n}    # Get round N results
GET    /v1/simulations/{sim_id}/agents         # List agents with current state
GET    /v1/simulations/{sim_id}/agents/{aid}   # Agent detail + action history
GET    /v1/simulations/{sim_id}/order-book     # Current simulated order book
GET    /v1/simulations/{sim_id}/price-path     # Simulated price path
GET    /v1/simulations/{sim_id}/cascades       # Cascade risk points
```

#### Reports

```
POST   /v1/simulations/{sim_id}/reports        # Generate report (async)
GET    /v1/reports/{report_id}                 # Get report
GET    /v1/reports/{report_id}/scenarios        # Get scenario breakdown
GET    /v1/reports/{report_id}/download         # Download PDF
```

#### Interactive / Chat

```
POST   /v1/reports/{report_id}/chat            # Chat with report agent
POST   /v1/simulations/{sim_id}/interview      # Interview a specific agent
POST   /v1/simulations/{sim_id}/what-if        # Run what-if variation
```

#### ML / Predictions (direct access for Professional+)

```
POST   /v1/predict/event-impact               # Event impact classification
POST   /v1/predict/cascade-risk               # Cascade probability at price levels
GET    /v1/predict/regime                      # Current market regime
```

#### Account / Admin

```
GET    /v1/account                             # Tenant info + usage
GET    /v1/account/usage                       # Detailed usage metrics
PUT    /v1/account/settings                    # Update preferences
GET    /v1/account/billing                     # Billing portal link (Stripe)
```

### WebSocket API

Real-time updates during simulation runs and long-running operations.

```
WSS: wss://ws.nvision.nclouds.com

Channels:
  simulation:{sim_id}:status     # Status updates (preparing, running, round N, completed)
  simulation:{sim_id}:rounds     # Round-by-round agent actions
  simulation:{sim_id}:price      # Real-time price path updates
  simulation:{sim_id}:cascades   # Cascade alerts
  report:{report_id}:progress    # Report generation progress
  events:realtime                # Live event detection (monitoring tier)
```

### Rate Limiting (API Gateway Usage Plans)

| Tier | Requests/sec | Burst | Monthly Quota |
|---|---|---|---|
| Analyst | 2 | 10 | 100,000 |
| Professional | 20 | 100 | 1,000,000 |
| Enterprise | 200 | 1,000 | Unlimited |

---

## 8. Frontend Migration

### Current → Target

| Aspect | Current | Target |
|---|---|---|
| Hosting | Vite dev server / Docker | S3 + CloudFront |
| Auth | None | Cognito Hosted UI + Amplify Auth |
| State management | React useState/stores | Zustand (already lightweight) + React Query for server state |
| Real-time | Polling | WebSocket (native) |
| Routing | React Router | React Router (keep) |
| Charts | None | Recharts or Lightweight Charts (TradingView open-source) for price paths |
| Design system | Tailwind utility classes | Keep Tailwind; add shadcn/ui component library for consistent financial UI |

### New Pages / Views

```
/                          # Landing / marketing (public)
/login                     # Cognito hosted UI redirect
/dashboard                 # Tenant dashboard: recent projects, usage, alerts
/projects                  # Project list
/projects/{id}             # Project detail → 5-step wizard (keep existing flow)
/projects/{id}/graph       # Graph explorer (enhanced with financial entity views)
/simulations/{id}          # Simulation monitor (live price chart, agent actions, cascade alerts)
/simulations/{id}/agents   # Agent explorer (drill into any agent's reasoning + actions)
/reports/{id}              # Report viewer (scenarios, price paths, confidence intervals)
/reports/{id}/chat         # Interactive Q&A (keep existing)
/settings                  # Account settings, API keys, billing
/api-docs                  # Embedded API documentation (Swagger UI)

# Professional+ only:
/monitor                   # Real-time event monitoring dashboard
/portfolio                 # Portfolio upload + scenario exposure view
```

### Financial UI Components (new)

- **Price chart** — candlestick or line chart showing simulated price path with scenario overlays
- **Cascade risk heatmap** — price levels colored by cascade probability
- **Agent flow visualization** — Sankey diagram showing money flow between agent types
- **Order book depth chart** — bid/ask visualization from simulated order book
- **Scenario comparison table** — side-by-side scenario outcomes with probability bars
- **Confidence interval fan chart** — prediction with expanding CI over time
- **Knowledge graph explorer** — enhanced version of existing graph panel with financial entity icons and positioning data

---

## 9. Simulation Engine Redesign

### Current: OASIS Social Simulation

The current engine uses OASIS (camel-oasis) to simulate Twitter and Reddit interactions. Agents post, like, repost, follow, and comment. This is fundamentally a **social media behavior engine**.

### Target: Financial Market Simulation Engine

The simulation engine is the core IP. It needs a ground-up redesign for financial markets.

#### Agent Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Agent Manager                      │
│                                                       │
│  ┌─────────────────────────────────────────────┐      │
│  │          LLM-Powered Agents                  │      │
│  │  (Institutional PMs, Retail cohorts)          │      │
│  │                                               │      │
│  │  Per time step:                               │      │
│  │  1. Perceive (graph query → recent events)   │      │
│  │  2. Reason (Bedrock → interpretation)         │      │
│  │  3. Decide (Bedrock → action intent)          │      │
│  │  4. Size (ML model → quantity + timing)       │      │
│  │  5. Submit (order to matching engine)          │      │
│  └─────────────────────────────────────────────┘      │
│                                                       │
│  ┌─────────────────────────────────────────────┐      │
│  │          Rule-Based Agents                    │      │
│  │  (Algos, Market Makers)                       │      │
│  │                                               │      │
│  │  Per time step:                               │      │
│  │  1. Read market state (price, volume, OB)     │      │
│  │  2. Apply rules (momentum signal, inventory   │      │
│  │     management, delta hedging)                │      │
│  │  3. Submit order                               │      │
│  └─────────────────────────────────────────────┘      │
│                                                       │
│  ┌─────────────────────────────────────────────┐      │
│  │          Constraint Engine                    │      │
│  │                                               │      │
│  │  After each agent submits:                    │      │
│  │  - Mandate compliance check                   │      │
│  │  - Position limit check                       │      │
│  │  - Margin/leverage check                      │      │
│  │  - Stop-loss trigger check                    │      │
│  │  - Circuit breaker check                      │      │
│  │  → Override or block if constraints violated  │      │
│  └─────────────────────────────────────────────┘      │
│                                                       │
│  ┌─────────────────────────────────────────────┐      │
│  │          Matching Engine                      │      │
│  │                                               │      │
│  │  - Collects all orders for time step          │      │
│  │  - Price-time priority matching               │      │
│  │  - Updates order book                         │      │
│  │  - Determines new price                       │      │
│  │  - Broadcasts to all agents                   │      │
│  └─────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────┘
```

#### Financial Action Types (replaces OASIS Twitter/Reddit actions)

```python
class FinancialAction(Enum):
    # Orders
    MARKET_BUY = "market_buy"
    MARKET_SELL = "market_sell"
    LIMIT_BUY = "limit_buy"
    LIMIT_SELL = "limit_sell"
    STOP_LOSS = "stop_loss"
    TAKE_PROFIT = "take_profit"

    # Options
    BUY_CALL = "buy_call"
    BUY_PUT = "buy_put"
    SELL_CALL = "sell_call"
    SELL_PUT = "sell_put"

    # Meta
    HOLD = "hold"
    HEDGE = "hedge"                # Triggers automatic hedging logic
    REDUCE_EXPOSURE = "reduce_exposure"  # Partial unwind
    INCREASE_EXPOSURE = "increase_exposure"

    # Forced (system-generated, not agent-chosen)
    MARGIN_CALL_LIQUIDATION = "margin_call_liquidation"
    STOP_LOSS_TRIGGERED = "stop_loss_triggered"
    CIRCUIT_BREAKER_HALT = "circuit_breaker_halt"
```

#### Simulation Time Model

```
Real event timestamp: T₀
Simulation time: T₀ → T₀ + 72h (default)
Time step: 15 minutes (configurable)

Total steps: 288 (72h ÷ 15min)
Per step: all agents act → matching engine → price update → constraint check → next step
```

#### Parallel Execution

LLM-powered agents are the bottleneck (each requires a Bedrock API call). Strategy:

1. **Batch agent reasoning** — send all LLM agents' prompts concurrently (Bedrock supports batching)
2. **Rule-based agents run locally** — no API call needed; sub-ms per agent
3. **ML inference batched** — single SageMaker call with all agents' features
4. **Target: < 2 seconds per time step** for 100 agents (50 LLM + 50 rule-based)
5. **Full 72h simulation (288 steps × 100 agents) in ~10 minutes**

---

## 10. Infrastructure & DevOps

### CI/CD Pipeline

```
GitHub (nvision repo)
    │
    ├── Push to main ──────► GitHub Actions
    │                         │
    │                   ┌─────┴─────────────────┐
    │                   │  1. Lint + Type Check  │
    │                   │  2. Unit Tests         │
    │                   │  3. Integration Tests  │
    │                   │  4. Build Docker images│
    │                   │  5. Push to ECR        │
    │                   │  6. CDK Deploy (staging)│
    │                   │  7. E2E Tests (staging)│
    │                   │  8. Manual approval    │
    │                   │  9. CDK Deploy (prod)  │
    │                   └───────────────────────┘
    │
    └── Push to feature/* ──► PR checks only (steps 1-3)
```

### Infrastructure as Code

**AWS CDK (TypeScript)** for all infrastructure. Organized as:

```
infra/
├── bin/
│   └── nvision.ts                    # CDK app entry
├── lib/
│   ├── stacks/
│   │   ├── networking-stack.ts       # VPC, subnets, security groups
│   │   ├── data-stack.ts             # Neptune, DynamoDB, S3, ElastiCache
│   │   ├── compute-stack.ts          # ECS cluster, task defs, ALB
│   │   ├── api-stack.ts              # API Gateway, Cognito, WAF
│   │   ├── ml-stack.ts               # SageMaker endpoints, training pipelines
│   │   ├── messaging-stack.ts        # SQS, EventBridge, Step Functions
│   │   ├── frontend-stack.ts         # S3 + CloudFront
│   │   ├── observability-stack.ts    # CloudWatch dashboards, X-Ray, alarms
│   │   └── marketplace-stack.ts      # AWS Marketplace integration
│   └── constructs/
│       ├── tenant-isolation.ts       # Reusable tenant isolation patterns
│       └── simulation-pipeline.ts    # Step Functions state machine
├── test/
└── cdk.json
```

### Environments

| Environment | Purpose | Neptune | Compute | Cost |
|---|---|---|---|---|
| **dev** | Development | Neptune Serverless (min 1 NCU) | Fargate spot | ~$200/mo |
| **staging** | Pre-production testing | Neptune Serverless (min 2 NCU) | Fargate | ~$500/mo |
| **production** | Customer-facing | Neptune provisioned (db.r6g.large) | Fargate (auto-scaling) | ~$3K-$10K/mo (scales with tenants) |

---

## 11. Security & Compliance

### Authentication & Authorization

```
User → Cognito (MFA optional, required for Enterprise)
     → JWT with claims: sub, email, tenant_id, tier, roles
     → API Gateway Cognito Authorizer validates JWT
     → Application layer checks tenant_id + roles for fine-grained access
```

**Roles:**
- `admin` — full tenant access, billing, user management
- `analyst` — create/run simulations, view reports
- `viewer` — read-only access to reports and dashboards

### Data Protection

| Concern | Implementation |
|---|---|
| Encryption at rest | S3 SSE-S3, DynamoDB encryption, Neptune encryption (all default-on) |
| Encryption in transit | TLS 1.2+ everywhere; API Gateway enforces HTTPS |
| Secrets | AWS Secrets Manager; rotated automatically; no secrets in code or env vars |
| PII | Minimal PII collected (email, name); Cognito handles credential storage |
| Data residency | US-only deployment initially (us-west-2); EU region option for Enterprise |
| Backup | Neptune automated snapshots (daily, 7-day retention); DynamoDB PITR; S3 versioning |

### Compliance Considerations (Financial Services)

| Requirement | Status | Notes |
|---|---|---|
| SOC 2 Type II | Future (Phase 4) | Required for institutional customers; AWS services already SOC 2 compliant |
| Audit logging | Phase 2 | CloudTrail for API calls; application-level audit log in DynamoDB |
| Data retention policies | Phase 2 | Configurable per tenant; default 1 year |
| Penetration testing | Phase 3 (pre-GA) | Annual third-party pen test |
| Disclaimers | Phase 1 | "For informational purposes only; not investment advice" on all outputs |

---

## 12. Migration Phases

### Phase 1: Financial Demo (Months 1-3)

**Goal:** Adapt existing codebase for financial domain; keep single-tenant architecture.

**Changes:**
```
Week 1-2:  Translate all Chinese system prompts to English
Week 2-4:  Replace OASIS social actions with financial action types
           Build simplified matching engine (no full order book yet)
           Create financial entity types in ontology generator
Week 4-6:  Pre-build 2-3 demo scenarios with hardcoded market data
           Replace social media graph visualization with financial entity view
Week 6-8:  Build basic price chart component (Lightweight Charts)
           Integrate one free market data source (Alpha Vantage)
Week 8-12: Polish demo flow; record demo video
           Deploy on single EC2 instance for demo access
```

**Architecture:** Mostly unchanged from current. Flask backend, local storage, Zep Cloud for graphs. Add Alpha Vantage integration and financial simulation logic alongside OASIS (don't remove OASIS yet).

**Deliverable:** Working financial demo at `demo.nvision.nclouds.com`

### Phase 2: Multi-Tenant Foundation (Months 3-6)

**Goal:** Add auth, tenant isolation, and cloud-native data layer. Ship beta.

**Changes:**
```
Month 3:   CDK project setup; VPC + networking stack
           Cognito user pool + API Gateway with authorizer
           DynamoDB tables with tenant_id partition keys
           S3 bucket with tenant prefix isolation

Month 4:   Migrate Flask → FastAPI (async; better for concurrent LLM calls)
           Move from local filesystem → S3 for all storage
           Move from in-memory tasks → SQS + DynamoDB for job queue
           Move from Zep Cloud → Neptune for graph storage

Month 5:   ECS Fargate deployment (API + simulation worker)
           WebSocket support via API Gateway
           Frontend: add Cognito auth, dashboard, billing portal (Stripe)
           Basic usage metering

Month 6:   Beta launch with 5-10 design partners
           CloudFront + S3 for frontend hosting
           Basic CloudWatch dashboards and alarms
```

**Architecture:** Multi-tenant cloud-native. No ML models yet — LLM-only simulation. Financial simulation engine v1 (basic matching, LLM agents, no rule-based agents yet).

### Phase 3: ML Models + GA (Months 6-9)

**Goal:** Add ML model layer; production hardening; GA launch.

**Changes:**
```
Month 6-7: Train Event Impact Classifier on historical data
           Train Agent Action Predictor (institutional) on 13F data
           Deploy to SageMaker endpoints
           Integrate ML predictions into simulation engine

Month 7-8: Build rule-based algo and market maker agents
           Build constraint engine (margin calls, stop losses, circuit breakers)
           Build cascade detection logic
           Add Residual Error Model + Confidence Estimator

Month 8-9: Production hardening: rate limiting, abuse prevention, SLA monitoring
           AWS Marketplace listing
           Security audit + pen test
           GA launch
```

**Architecture:** Full target architecture minus real-time monitoring. All ML models deployed. Financial simulation engine v2 (LLM + rule-based + ML hybrid agents).

### Phase 4: Scale + Real-Time (Months 9-18)

**Goal:** Real-time monitoring tier; advanced ML; scale infrastructure.

**Changes:**
```
Month 9-12:  Kinesis integration for real-time market data
             Live event detection pipeline (news → EventBridge → simulation)
             Real-time monitoring dashboard
             Cascade Probability Model (RNN) + Order Book Simulator (neural ODE)
             Supply Chain GNN training on full entity graph

Month 12-18: Enterprise tier: dedicated Neptune, VPC peering, SSO
             Multi-asset support (FX, commodities, crypto)
             Historical backtesting mode
             Custom calibration packages
             Partner channel (white-label API)
```

---

## 13. Cost Estimates

### Infrastructure Cost per Environment

| Component | Dev | Staging | Production (10 tenants) | Production (50 tenants) |
|---|---|---|---|---|
| Neptune | $50/mo (serverless) | $100/mo | $700/mo (provisioned) | $1,400/mo |
| ECS Fargate | $50/mo (spot) | $200/mo | $1,000/mo | $3,000/mo |
| DynamoDB | $5/mo | $10/mo | $50/mo | $200/mo |
| S3 | $5/mo | $10/mo | $50/mo | $200/mo |
| API Gateway | $5/mo | $10/mo | $50/mo | $200/mo |
| Bedrock (LLM) | $50/mo | $200/mo | $2,000/mo | $8,000/mo |
| SageMaker Endpoints | $0 | $200/mo | $800/mo | $2,000/mo |
| SageMaker Training | $0 | $50/mo | $200/mo | $500/mo |
| ElastiCache | $0 | $50/mo | $200/mo | $400/mo |
| CloudFront + WAF | $0 | $20/mo | $100/mo | $200/mo |
| Market Data Feeds | $0 | $0 | $1,000/mo | $3,000/mo |
| **Total** | **~$165/mo** | **~$850/mo** | **~$6,150/mo** | **~$19,100/mo** |

### Unit Economics at Scale

At 50 Professional subscribers ($10K/mo avg):
- **Revenue:** $500K/mo
- **Infrastructure:** ~$19K/mo (3.8% of revenue)
- **Gross margin:** ~96% on infrastructure (before engineering salaries)

Bedrock (LLM) costs are the dominant variable cost. At scale, consider:
- Provisioned throughput for Bedrock (lower per-token cost)
- Model distillation (fine-tune smaller model on larger model's outputs for routine tasks)
- Caching frequent ontology/persona generation patterns

---

## 14. Risks & Technical Debt

### Technical Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Neptune performance at graph scale (>100K nodes per tenant) | Medium | Benchmark early in Phase 2; Neptune Serverless auto-scales; consider partitioning large graphs |
| Bedrock latency for concurrent agent reasoning (50 agents × Bedrock call per step) | High | Batch calls, use Bedrock provisioned throughput, cache similar prompts, fall back to smaller/faster models for routine agents |
| OASIS → custom sim engine migration complexity | High | Phase 1 builds alongside OASIS; Phase 2 replaces. Keep OASIS as fallback for social sim use case. |
| Matching engine correctness (price formation) | Medium | Start simple (uniform price clearing); validate against historical data; iterate toward full LOB |
| ML model cold start (not enough calibration data initially) | High | Ship without ML in Phase 2 beta; use LLM-only predictions with wide confidence intervals; add ML as data accumulates |

### Technical Debt to Address

| Debt | Source | When to Fix |
|---|---|---|
| Chinese-language system prompts throughout backend | MiroFish origin | Phase 1 (Week 1-2) |
| Flask synchronous architecture | MiroFish origin | Phase 2 (migrate to FastAPI) |
| Zep Cloud dependency for graph storage | MiroFish origin | Phase 2 (migrate to Neptune) |
| OASIS social media action types hardcoded | MiroFish origin | Phase 1 (add financial actions) |
| Local filesystem for all storage | MiroFish origin | Phase 2 (migrate to S3) |
| No test suite | MiroFish origin | Phase 2 (add pytest + React Testing Library) |
| `mirofish` references in package.json, Docker image name | Fork artifact | Phase 1 (rename) |
| Hardcoded `SECRET_KEY = 'mirofish-secret-key'` | MiroFish origin | Phase 2 (Secrets Manager) |

---

## Appendix A: Technology Decision Records

### ADR-001: Neptune over Zep Cloud for Production Graph Storage

**Context:** The current system uses Zep Cloud for knowledge graph storage. Zep is a memory platform designed for LLM applications, not a general-purpose graph database.

**Decision:** Migrate to Amazon Neptune for production.

**Rationale:**
- Neptune supports IAM-based access control (tenant isolation)
- Neptune supports named graphs (natural multi-tenant partitioning)
- Neptune scales to billions of edges (Zep Cloud has undefined limits for standalone graphs)
- Neptune is ACID-compliant (financial data integrity)
- Zep Cloud introduces vendor lock-in for a core data layer
- Neptune is AWS-native (VPC, CloudWatch, backups, encryption all integrated)

**Trade-off:** Zep provides built-in LLM memory features (episode processing, automatic entity extraction). We'll need to implement entity extraction ourselves using Bedrock, but this gives us more control over the financial ontology.

### ADR-002: FastAPI over Flask for Backend

**Context:** Current backend is Flask, which is synchronous. Financial simulation requires many concurrent LLM calls per time step.

**Decision:** Migrate to FastAPI.

**Rationale:**
- Native `async/await` support for concurrent Bedrock calls
- Built-in OpenAPI spec generation (self-documenting API)
- Pydantic models for request/response validation (reduces bugs in financial data handling)
- WebSocket support built-in
- Comparable ecosystem maturity to Flask

**Trade-off:** Migration effort (~2 weeks of backend refactoring). Flask extensions (flask-cors, etc.) need FastAPI equivalents.

### ADR-003: Step Functions for Pipeline Orchestration

**Context:** The 5-step simulation pipeline (graph build → environment setup → simulation → report → interaction) is currently orchestrated by frontend polling + backend state machine in Python.

**Decision:** Use AWS Step Functions.

**Rationale:**
- Built-in retry, error handling, and timeout logic
- Visual workflow debugging in AWS Console
- Native integration with SQS, Lambda, ECS, Bedrock
- Audit trail for every execution (important for financial compliance)
- Handles long-running simulations (up to 1 year execution time)

**Trade-off:** Step Functions pricing ($25 per million state transitions). At expected scale, this is <$50/mo.

### ADR-004: Hybrid LLM + Rule-Based Agent Architecture

**Context:** Should all agents in the simulation be LLM-powered?

**Decision:** No. Use LLM agents for discretionary actors and rule-based/ML agents for algorithmic and market-making actors.

**Rationale:**
- Algorithmic trading strategies follow deterministic rules — LLM adds noise, not insight
- Market makers follow mathematical inventory management — LLM can't price options
- Rule-based agents are 1000x faster and 1000x cheaper than LLM calls
- Hybrid reduces Bedrock costs by 40-60% per simulation
- More accurate: real markets have a mix of discretionary and systematic actors

**Trade-off:** Two different agent implementations to maintain. Mitigated by shared interface (all agents produce orders through the same matching engine).

---

## Appendix B: Sequence Diagrams

### Full Simulation Pipeline

```
User        API GW      Core API     SQS        Step Fn      ECS Worker    Neptune    Bedrock    SageMaker
 │            │            │          │            │            │            │          │          │
 │──POST /projects/{id}/simulations──►│            │            │            │          │          │
 │            │            │──create sim record──► │            │            │          │          │
 │            │            │          │            │            │            │          │          │
 │◄─────202 Accepted (sim_id)────────│            │            │            │          │          │
 │            │            │          │            │            │            │          │          │
 │──POST /simulations/{id}/start────►│            │            │            │          │          │
 │            │            │──enqueue──►│          │            │            │          │          │
 │◄─────202 Accepted─────────────────│            │            │            │          │          │
 │            │            │          │──start────►│            │            │          │          │
 │            │            │          │            │            │            │          │          │
 │            │            │          │            │──Step 1: Build Graph────►│          │          │
 │            │            │          │            │            │            │◄─entities─│          │
 │            │            │          │            │            │            │          │          │
 │            │            │          │            │──Step 2: Gen Agents─────────────────►│          │
 │◄─────WS: status=preparing────────│            │            │            │          │          │
 │            │            │          │            │            │            │          │          │
 │            │            │          │            │──Step 3: Run Sim───────►│          │          │
 │            │            │          │            │            │──per round:│          │          │
 │            │            │          │            │            │  query──────►│          │          │
 │            │            │          │            │            │  reason──────────────►│          │
 │            │            │          │            │            │  predict─────────────────────────►│
 │            │            │          │            │            │  match+price │          │          │
 │◄─────WS: round N results─────────│            │            │            │          │          │
 │            │            │          │            │            │            │          │          │
 │            │            │          │            │──Step 4: Report────────────────────►│          │
 │◄─────WS: report complete──────────│            │            │            │          │          │
 │            │            │          │            │            │            │          │          │
 │──GET /reports/{id}────────────────►│            │            │            │          │          │
 │◄─────report data──────────────────│            │            │            │          │          │
```

### Agent Decision Cycle (per time step)

```
Agent Manager         Neptune          Bedrock           SageMaker        Matching Engine
     │                  │                │                  │                  │
     │──query context──►│                │                  │                  │
     │◄──recent events──│                │                  │                  │
     │  + positions      │                │                  │                  │
     │  + relationships  │                │                  │                  │
     │                  │                │                  │                  │
     │──perceive+reason─────────────────►│                  │                  │
     │◄──action intent + rationale───────│                  │                  │
     │  ("I want to sell NVDA")          │                  │                  │
     │                  │                │                  │                  │
     │──predict size+timing──────────────────────────────►│                  │
     │◄──{sell 30%, TWAP over 2 steps}───────────────────│                  │
     │                  │                │                  │                  │
     │──constraint check (internal)──────│                  │                  │
     │  mandate OK? margin OK?           │                  │                  │
     │                  │                │                  │                  │
     │──submit order────────────────────────────────────────────────────────►│
     │                  │                │                  │                  │──match
     │                  │                │                  │                  │──new price
     │◄──fill confirmation + new price──────────────────────────────────────│
     │                  │                │                  │                  │
     │──update position─►│                │                  │                  │
     │                  │                │                  │                  │
```

---

*Last updated: 2026-03-14*
*Author: nVision Engineering (nClouds)*
*Status: Draft — Pre-Phase 1*
