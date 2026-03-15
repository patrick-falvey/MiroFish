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
3. **Hybrid LLM + ML** — LLMs for reasoning and novelty; ML models for precision and speed; rule-based agents for deterministic strategies. Validated by FCLAgent (PRIMA 2025) and Lopez-Lira (2025) research
4. **AWS-native** — use managed services over self-hosted where possible; minimize undifferentiated ops
5. **Event-driven** — use events for inter-service communication; services are loosely coupled
6. **Cost-aware** — metered per-tenant; right-size compute for each tier
7. **Build on proven open-source** — adopt battle-tested components (ABIDES matching engine, FinDKG-style KG construction, conformal prediction) rather than building from scratch. Compose best-in-class components into a unique integrated platform
8. **Calibration-first** — every architectural decision should support the calibration feedback loop (prediction → actual → residual → retrain). The calibration story is nVision's core differentiator against both Monte Carlo tools and academic ABM prototypes

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

#### Graph Construction Pipeline (FinDKG-inspired)

nVision adopts the **FinDKG approach** (ACM ICAIF 2024) for dynamic knowledge graph construction from financial documents, adapted for Neptune:

1. **Document ingestion** — PDFs, 10-Ks, earnings transcripts, news articles parsed into chunks
2. **LLM-based entity/relationship extraction** — Bedrock (Claude) extracts (Head Entity, Head Type, Relationship, Tail Entity, Tail Type) triples using a financial ontology schema. Multi-pass extraction with reflection-agent validation (inspired by FinReflectKG) catches extraction errors before graph write
3. **Temporal graph evolution** — unlike static KGs, nVision's graphs evolve over time. Each entity/edge carries a `valid_from` / `valid_to` timestamp. The graph after simulation differs from the graph before (positions change, exposures shift, new relationships emerge)
4. **KGTransformer-style attention** — for entity importance ranking and impact propagation prediction, nVision uses an attention-based GNN over the temporal graph (inspired by FinDKG's KGTransformer, which achieved ~15% improvement over SOTA in link prediction)

This replaces Zep Cloud's built-in entity extraction with a purpose-built financial extraction pipeline that gives full control over the ontology.

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

### Calibration Infrastructure (Core Differentiator)

Calibration is the #1 reason financial ABM hasn't gone mainstream. nVision's calibration infrastructure is architecturally first-class, not an afterthought.

#### ANTR Neural Posterior Estimation

Traditional ABM calibration uses grid search or Bayesian optimization — computationally prohibitive for models with >20 parameters. nVision adopts **ANTR (Amortized Neural posterior estimation with Truncation and Reweighting)**, a cutting-edge technique (2024-2026) that:

1. Trains a neural density estimator on synthetic simulation outputs
2. At inference time, conditions on observed market data to produce a posterior distribution over agent parameters in a single forward pass (no iterative optimization)
3. Achieves **~50% reduction in calibration error** vs. traditional methods
4. Supports online updates — each new simulation run improves the posterior without full retraining

Implementation: SageMaker Training pipeline produces an ANTR model per simulation configuration. Deployed as a serverless SageMaker endpoint. Invoked after each simulation to update the calibration posterior.

#### Conformal Prediction Confidence Intervals

nVision uses **conformal prediction** (not Gaussian assumptions) for all uncertainty estimates:

- Distribution-free: makes no assumptions about the underlying data distribution
- Guarantees finite-sample coverage (e.g., 90% prediction interval contains the true value ≥90% of the time)
- Adapts automatically as the model improves — intervals shrink as calibration data accumulates
- This is the emerging standard for financial AI uncertainty quantification

#### Calibration Feedback Loop

```
Simulation Run → Predicted Outcomes → Wait for Actuals → Compute Residuals
       ↑                                                         │
       │    ┌─────────────────────────────────────────────────┐  │
       │    │           Calibration Store (DynamoDB)           │  │
       │    │  prediction_id, predicted, actual, residual,     │◄─┘
       │    │  agent_params, market_regime, event_type         │
       │    └────────────────────┬────────────────────────────┘
       │                         │
       │    ┌────────────────────▼────────────────────────────┐
       │    │         ANTR Retraining Pipeline                 │
       │    │  (SageMaker Training, triggered by EventBridge   │
       │    │   when calibration store reaches N new samples)  │
       │    └────────────────────┬────────────────────────────┘
       │                         │
       └─────────────────────────┘
```

Every simulation run produces calibration data. This creates a flywheel: more customers → more simulations → better calibration → better predictions → more customers.

### Model A/B Testing

SageMaker endpoints support production variants. New model versions deploy as a shadow variant receiving 10% of traffic. Promotion to primary after 7 days of equivalent or better performance on residual error metrics.

### Enterprise Custom Calibration

Enterprise tenants can request custom model calibration:
1. Upload historical portfolio + trade data
2. ANTR posterior fine-tuned on their specific historical outcomes
3. SageMaker Training job fine-tunes Agent Action Predictor on their specific behavior
4. Dedicated SageMaker endpoint serves their custom model
5. Isolated from other tenants' models — their calibration data never mixes

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

### Target: Financial Market Simulation Engine (ABIDES-based)

The simulation engine is the core IP. Rather than building from scratch, nVision adopts **ABIDES** (JPMorgan's Agent-Based Interactive Discrete Event Simulation) as the foundation for the matching engine and market microstructure layer, extending it with LLM agent integration, knowledge graph connectivity, and the constraint/cascade detection systems.

#### Why ABIDES as Foundation

ABIDES is the most battle-tested open-source market simulation framework, developed by JPMorgan AI Research:
- **ABIDES-Core:** General-purpose discrete event simulator with latency-aware agent messaging
- **ABIDES-Markets:** NASDAQ-mimicking exchange supporting ITCH/OUCH protocol, with proven stylized trading agents (zero-intelligence, momentum, market makers)
- **ABIDES-Gym:** OpenAI Gym wrapper for reinforcement learning integration
- Supports tens of thousands of concurrent agents with realistic message-based communication
- Already validated for producing realistic market microstructure features (bid-ask spreads, price impact, order book dynamics)

nVision extends ABIDES rather than replacing it, adding three layers on top:
1. **LLM Agent Layer** — Bedrock-powered discretionary agents that feed orders into the ABIDES exchange
2. **Knowledge Graph Layer** — Neptune-backed context that informs agent perception and reasoning
3. **Constraint/Cascade Layer** — financial risk checks and cascade detection that operate alongside the ABIDES matching engine

#### Agent Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    nVision Agent Manager                          │
│                                                                   │
│  ┌─────────────────────────────────────────────┐                  │
│  │          LLM-Powered Agents (nVision)        │                  │
│  │  (Institutional PMs, Retail cohorts)          │                  │
│  │                                               │                  │
│  │  Per time step:                               │                  │
│  │  1. Perceive (Neptune query → recent events) │                  │
│  │  2. Reason (Bedrock → interpretation)         │                  │
│  │  3. Decide (Bedrock → action intent)          │  FCLAgent-style  │
│  │     • LLM generates psychological bias        │  hybrid: LLM for │
│  │     • ML model corrects for prompt sensitivity │  qualitative,    │
│  │  4. Size (SageMaker → quantity + timing)      │  ML for precision│
│  │  5. Submit (order to ABIDES exchange)          │                  │
│  └─────────────────────────────────────────────┘                  │
│                                                                   │
│  ┌─────────────────────────────────────────────┐                  │
│  │    Rule-Based Agents (ABIDES-native + custom)│                  │
│  │  (Algos, Market Makers, ZI traders)           │                  │
│  │                                               │                  │
│  │  ABIDES provides proven implementations:      │                  │
│  │  - ZeroIntelligenceAgent (liquidity baseline) │                  │
│  │  - MomentumAgent (trend-following)             │                  │
│  │  - MarketMakerAgent (inventory management)     │                  │
│  │  - ValueAgent (fundamental value reversion)    │                  │
│  │  nVision adds:                                 │                  │
│  │  - DeltaHedgingAgent (options market maker)    │                  │
│  │  - StatArbAgent (pairs/mean-reversion)         │                  │
│  │  - IndexRebalanceAgent (passive flow)          │                  │
│  └─────────────────────────────────────────────┘                  │
│                                                                   │
│  ┌─────────────────────────────────────────────┐                  │
│  │          Constraint Engine (nVision)          │                  │
│  │                                               │                  │
│  │  After each agent submits:                    │                  │
│  │  - Mandate compliance check                   │                  │
│  │  - Position limit check                       │                  │
│  │  - Margin/leverage check                      │                  │
│  │  - Stop-loss trigger check                    │                  │
│  │  - Circuit breaker check                      │                  │
│  │  → Override or block if constraints violated  │                  │
│  └─────────────────────────────────────────────┘                  │
│                                                                   │
│  ┌─────────────────────────────────────────────┐                  │
│  │    ABIDES Exchange (matching engine)          │                  │
│  │                                               │                  │
│  │  - NASDAQ ITCH/OUCH protocol simulation       │                  │
│  │  - Price-time priority matching                │                  │
│  │  - Full limit order book with L2/L3 depth     │                  │
│  │  - Partial fills, cancellations, amendments    │                  │
│  │  - Latency-aware message passing               │                  │
│  │  - Produces realistic microstructure features  │                  │
│  │  - Broadcasts fills + book updates to agents   │                  │
│  └─────────────────────────────────────────────┘                  │
│                                                                   │
│  ┌─────────────────────────────────────────────┐                  │
│  │    Cascade Detection Engine (nVision)         │                  │
│  │                                               │                  │
│  │  After each matching cycle:                   │                  │
│  │  - Check for forced-liquidation feedback loops│                  │
│  │  - Cascade Probability Model (RNN) evaluates  │                  │
│  │    probability of contagion at each price level│                  │
│  │  - Supply Chain GNN propagates impact through  │                  │
│  │    the knowledge graph                         │                  │
│  │  - Alerts if cascade probability > threshold   │                  │
│  └─────────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

#### LLM Agent Prompt Sensitivity Mitigation

Lopez-Lira (2025) demonstrated that LLM trading behavior is **highly sensitive to prompt wording** — agents follow instructions regardless of profit implications. nVision mitigates this through the hybrid architecture:

1. **LLM generates qualitative reasoning only** — "I believe NVDA is overvalued because..." (natural language interpretation)
2. **ML model translates to quantitative action** — Agent Action Predictor converts qualitative intent to sized orders, correcting for known LLM biases
3. **Prompt sensitivity testing** — automated CI pipeline tests agent behavior stability across prompt variations; significant behavioral drift triggers alerts
4. **FCLAgent-validated approach** — PRIMA 2025 research confirmed that combining LLM-generated psychological biases with rule-based price prediction reproduces path-dependent patterns that purely rule-based or purely LLM agents miss

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

LLM-powered agents are the bottleneck (each requires a Bedrock API call). ABIDES's discrete event architecture helps by allowing rule-based agents to run at native speed while LLM agents process concurrently.

Strategy:

1. **Batch agent reasoning** — send all LLM agents' prompts concurrently (Bedrock supports batching)
2. **ABIDES-native agents run locally** — zero-intelligence, momentum, and market maker agents from ABIDES need no API calls; sub-ms per agent
3. **ML inference batched** — single SageMaker call with all agents' features
4. **Entity Importance Ranker determines agent fidelity** — PageRank on the knowledge graph determines which agents get high-fidelity LLM simulation vs. cheaper ABIDES-native heuristic agents. Only the top-N most impactful actors (by graph centrality and position size) use LLM reasoning
5. **Target: < 2 seconds per time step** for 100 agents (30 LLM + 70 ABIDES-native/rule-based)
6. **Full 72h simulation (288 steps × 100 agents) in ~10 minutes**

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

**Goal:** Adapt existing codebase for financial domain; keep single-tenant architecture. Demonstrate the four-pillar integration (document → KG → simulation → report) with financial entities.

**Changes:**
```
Week 1-2:  Translate all Chinese system prompts to English ✅ (completed)
Week 2-4:  Replace OASIS social actions with financial action types
           Integrate ABIDES-Markets as the matching engine (pip install abides-markets)
           — Use ABIDES exchange agent for order matching
           — Add nVision LLM agent wrapper that submits orders to ABIDES
           — Keep ABIDES ZI + momentum agents as baseline market participants
           Create financial entity types in ontology generator
           Build FinDKG-style entity extraction pipeline (Bedrock + financial ontology schema)
Week 4-6:  Pre-build 2-3 demo scenarios with hardcoded market data
           Replace social media graph visualization with financial entity view
           Build prompt sensitivity test suite (automated checks for LLM agent behavioral stability)
Week 6-8:  Build basic price chart component (Lightweight Charts)
           Integrate one free market data source (Alpha Vantage)
           Build Interview-an-Agent demo flow (the "aha moment" feature)
Week 8-12: Polish demo flow; record demo video
           Lead with calibration story in all demo materials
           Deploy on single EC2 instance for demo access
```

**Architecture:** Mostly unchanged from current. Flask backend, local storage, Zep Cloud for graphs. Key additions: ABIDES-Markets as the matching engine (replaces the need to build one from scratch), Alpha Vantage integration, financial simulation logic alongside OASIS (don't remove OASIS yet), FinDKG-style extraction pipeline.

**Deliverable:** Working financial demo at `demo.nvision.nclouds.com`

### Phase 2: Multi-Tenant Foundation (Months 3-6)

**Goal:** Add auth, tenant isolation, and cloud-native data layer. Ship beta to family office design partners.

**Changes:**
```
Month 3:   CDK project setup; VPC + networking stack
           Cognito user pool + API Gateway with authorizer
           DynamoDB tables with tenant_id partition keys
           S3 bucket with tenant prefix isolation
           Set up calibration store (DynamoDB table for prediction-vs-actual tracking)

Month 4:   Migrate Flask → FastAPI (async; better for concurrent LLM calls)
           Move from local filesystem → S3 for all storage
           Move from in-memory tasks → SQS + DynamoDB for job queue
           Move from Zep Cloud → Neptune for graph storage
           Migrate FinDKG-style extraction pipeline from Zep to Neptune
           — Implement temporal graph evolution (valid_from/valid_to on entities)
           — Build multi-pass extraction with reflection-agent validation

Month 5:   ECS Fargate deployment (API + simulation worker with ABIDES)
           WebSocket support via API Gateway
           Frontend: add Cognito auth, dashboard, billing portal (Stripe)
           Basic usage metering
           Conformal prediction confidence intervals on all simulation outputs

Month 6:   Beta launch with 5-10 family office design partners ($1K-$3K/mo)
           CloudFront + S3 for frontend hosting
           Basic CloudWatch dashboards and alarms
           Initial ANTR calibration model trained on Phase 1 demo simulation data
```

**Architecture:** Multi-tenant cloud-native. LLM + ABIDES-native agents (ZI, momentum, market makers). Financial simulation engine v1 (ABIDES matching, LLM agents, ABIDES rule-based agents, conformal prediction CIs). No custom ML models yet — calibration bootstrapping with LLM-only predictions and wide confidence intervals.

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
| Bedrock latency for concurrent agent reasoning (50 agents × Bedrock call per step) | High | Batch calls, use Bedrock provisioned throughput, cache similar prompts, Entity Importance Ranker limits LLM agents to top-N most impactful actors; rest use ABIDES-native agents |
| OASIS → ABIDES migration complexity | Medium (reduced) | ABIDES is a proven matching engine with existing agent implementations. Phase 1 integrates ABIDES alongside OASIS; Phase 2 replaces OASIS entirely. Lower risk than building custom matching engine from scratch |
| Matching engine correctness (price formation) | Low (reduced) | ABIDES matching engine is battle-tested by JPMorgan and validated for producing realistic microstructure features. No need to build from scratch |
| ML model cold start (not enough calibration data initially) | High | Ship without ML in Phase 2 beta; use LLM-only predictions with wide conformal prediction CIs; ANTR calibration bootstraps from small sample sizes better than traditional methods |
| **LLM prompt sensitivity** (Lopez-Lira 2025) | High | Hybrid architecture: LLMs for qualitative reasoning only, ML/ABIDES for quantitative execution. Automated prompt sensitivity CI tests. FCLAgent approach validated by PRIMA 2025 |
| **ABIDES integration with async FastAPI** | Medium | ABIDES is synchronous Python; wrap in ECS worker process communicating via SQS. ABIDES simulation loop runs in dedicated worker, not in API process |
| **FinDKG-style extraction quality** | Medium | Multi-pass extraction with reflection-agent validation catches errors. Start with curated entity types (companies, institutional investors) and expand. Fallback to Zep extraction if needed in Phase 1 |

### Technical Debt to Address

| Debt | Source | When to Fix |
|---|---|---|
| Chinese-language system prompts throughout backend | MiroFish origin | Phase 1 (Week 1-2) ✅ completed |
| Flask synchronous architecture | MiroFish origin | Phase 2 (migrate to FastAPI) |
| Zep Cloud dependency for graph storage | MiroFish origin | Phase 2 (migrate to Neptune with FinDKG-style extraction) |
| OASIS social media action types hardcoded | MiroFish origin | Phase 1 (replace with ABIDES matching engine + financial actions) |
| OASIS social simulation engine | MiroFish origin | Phase 1 (integrate ABIDES alongside); Phase 2 (remove OASIS entirely) |
| Local filesystem for all storage | MiroFish origin | Phase 2 (migrate to S3) |
| No test suite | MiroFish origin | Phase 2 (add pytest + React Testing Library + prompt sensitivity tests) |
| `mirofish` references in package.json, Docker image name | Fork artifact | Phase 1 (rename) |
| Hardcoded `SECRET_KEY = 'mirofish-secret-key'` | MiroFish origin | Phase 2 (Secrets Manager) |
| No calibration infrastructure | New requirement | Phase 2 (DynamoDB calibration store + ANTR pipeline) |

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

**Trade-off:** Two different agent implementations to maintain. Mitigated by shared interface (all agents produce orders through the same ABIDES exchange).

### ADR-005: ABIDES as Matching Engine Foundation

**Context:** nVision needs a realistic order book and matching engine for financial market simulation. Options: (a) build from scratch, (b) adopt ABIDES (JPMorgan), (c) adopt JAX-LOB (GPU-accelerated), (d) adopt StockSim.

**Decision:** Adopt ABIDES-Markets as the matching engine foundation.

**Rationale:**
- Battle-tested by JPMorgan AI Research; used widely in academic and industry market microstructure research
- Provides NASDAQ ITCH/OUCH protocol simulation out of the box
- Includes proven rule-based agent implementations (ZI, momentum, market maker, value) that serve as baseline market participants alongside nVision's LLM agents
- Python-native — integrates cleanly with the existing Python backend
- ABIDES-Gym provides OpenAI Gym wrapper for future RL agent integration
- Open source (BSD license) — no licensing concerns for commercial use
- Reduces Phase 1 engineering effort by ~4 weeks (no need to build and validate matching engine)

**Alternatives considered:**
- **Build from scratch:** Higher risk, slower delivery, requires matching engine expertise we don't have in-house. The research confirms matching engine correctness is a non-trivial risk
- **JAX-LOB:** GPU-accelerated (75x faster per message), but JAX dependency adds infrastructure complexity and is overkill for nVision's agent counts (100-2000, not millions)
- **StockSim:** Newer (2025), supports 500+ concurrent LLM agents via RabbitMQ, but less battle-tested than ABIDES and adds RabbitMQ dependency

**Trade-off:** ABIDES is synchronous Python, which conflicts with FastAPI's async architecture. Mitigated by running ABIDES simulation loop in a dedicated ECS worker process that communicates with the API via SQS.

### ADR-006: FinDKG-Style Dynamic Knowledge Graph Construction

**Context:** The current system uses Zep Cloud's built-in entity extraction for knowledge graph construction. For production financial use cases, we need more control over the financial ontology, temporal graph evolution, and extraction quality.

**Decision:** Build a FinDKG-inspired extraction pipeline using Bedrock (Claude) with multi-pass validation, targeting Neptune as the graph store.

**Rationale:**
- FinDKG (ACM ICAIF 2024) demonstrated that LLM-based generative KG construction from financial news achieves ~15% improvement over SOTA in link prediction tasks
- FinReflectKG (ACM ICAIF 2025) showed that reflection-agent-based multi-pass extraction catches errors that single-pass extraction misses, producing 17.5M normalized triplets from S&P 500 10-Ks
- Temporal graph evolution (entities and edges with `valid_from` / `valid_to` timestamps) is critical for nVision — the graph must change as the simulation progresses (positions shift, relationships emerge)
- Financial ontology control — we need entity types specific to market simulation (companies, institutional investors, algo strategies, market makers) that Zep's generic extraction doesn't provide
- Neptune's named graphs + Gremlin queries are purpose-built for this kind of structured financial entity graph

**Trade-off:** More engineering effort than using Zep's built-in extraction (~2 weeks additional in Phase 1). Mitigated by: (a) Bedrock makes LLM calls cheap and fast, (b) the extraction pipeline is a core differentiator worth investing in, (c) the reflection-agent validation approach catches errors that would otherwise degrade simulation quality.

### ADR-007: ANTR Neural Posterior Estimation for Calibration

**Context:** ABM calibration is the #1 barrier to production deployment. Traditional approaches (grid search, Bayesian optimization) are computationally prohibitive for models with many parameters and suffer from equifinality.

**Decision:** Adopt ANTR (Amortized Neural posterior estimation with Truncation and Reweighting) as the primary calibration technique.

**Rationale:**
- ANTR achieves ~50% reduction in calibration error vs. traditional methods (2024-2026 research)
- Amortized inference: trains once, then calibrates new scenarios in a single forward pass (no iterative optimization). This is critical for a SaaS platform where calibration must be fast
- Supports online updates — each new simulation run improves the posterior without full retraining, creating a natural flywheel
- Works with small sample sizes better than traditional Bayesian optimization, which is important during the bootstrap phase
- Pairs naturally with conformal prediction for uncertainty quantification

**Trade-off:** ANTR is cutting-edge (not yet widely adopted in industry). Mitigated by: (a) fallback to traditional Bayesian optimization if ANTR underperforms, (b) conformal prediction provides calibrated uncertainty regardless of the calibration method used, (c) the calibration store captures all prediction-vs-actual data, so we can always retrain with better methods as they emerge.

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
Agent Manager         Neptune          Bedrock           SageMaker        ABIDES Exchange
     │                  │                │                  │                  │
     │──query context──►│                │                  │                  │
     │◄──recent events──│                │                  │                  │
     │  + positions      │                │                  │                  │
     │  + relationships  │                │                  │                  │
     │                  │                │                  │                  │
     │──perceive+reason─────────────────►│                  │                  │
     │◄──action intent + rationale───────│                  │                  │
     │  ("I want to sell NVDA because    │                  │                  │
     │   supply chain exposure is high") │                  │                  │
     │                  │                │                  │                  │
     │──predict size+timing──────────────────────────────►│                  │
     │◄──{sell 30%, TWAP over 2 steps}───────────────────│                  │
     │  (ML corrects for LLM prompt sensitivity)          │                  │
     │                  │                │                  │                  │
     │──constraint check (internal)──────│                  │                  │
     │  mandate OK? margin OK?           │                  │                  │
     │                  │                │                  │                  │
     │──submit order (ITCH/OUCH)─────────────────────────────────────────►│
     │                  │                │                  │                  │──match
     │                  │                │                  │  (ABIDES LOB)    │──new price
     │◄──fill confirmation + new price + book update─────────────────────│
     │                  │                │                  │                  │
     │──update position─►│                │                  │                  │
     │──log to calibration store──────────────────────────►│                  │
     │                  │                │                  │                  │
```

Meanwhile, ABIDES-native agents (ZI, momentum, market makers) run their own decision cycles within the ABIDES event loop — no Bedrock calls, sub-ms per agent. They provide realistic market liquidity and microstructure around the LLM agents' discretionary trades.

---

*Last updated: 2026-03-15*
*Author: nVision Engineering (nClouds)*
*Status: Draft — Pre-Phase 1 (updated with ABIDES, FinDKG, ANTR research findings)*
