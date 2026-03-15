# nVision — Architecture Diagrams

Visual architecture diagrams for the nVision platform. Renders natively on GitHub/Bitbucket via Mermaid.

**Companion docs:**
- [PRODUCTIZATION.md](./PRODUCTIZATION.md) — business strategy, pricing, GTM
- [TECHNICAL-ARCHITECTURE.md](./TECHNICAL-ARCHITECTURE.md) — detailed technical spec

---

## 1. High-Level System Architecture

The full target-state platform with ABIDES matching engine, Neptune knowledge graph, Bedrock LLM orchestration, and SageMaker ML models.

```mermaid
graph TB
    subgraph Client["Client Layer"]
        SPA["React SPA<br/>(TypeScript + Tailwind + shadcn/ui)"]
        WS["WebSocket Client<br/>(real-time sim updates)"]
    end

    subgraph Edge["Edge / Ingress"]
        CF["CloudFront CDN"]
        APIGW["API Gateway<br/>(REST + WebSocket)"]
        WAF["AWS WAF"]
        COG["Amazon Cognito<br/>(Auth + SSO)"]
    end

    subgraph Compute["Compute Layer (ECS Fargate)"]
        API["Core API<br/>(FastAPI, async)"]
        SIMW["Simulation Worker<br/>(ABIDES + nVision agents)"]
        REPW["Report Worker<br/>(ReACT agent)"]
        KGW["KG Builder Worker<br/>(FinDKG-style extraction)"]
    end

    subgraph Orchestration["Orchestration"]
        SF["Step Functions<br/>(5-step pipeline)"]
        SQS["SQS Queues<br/>(job dispatch)"]
        EB["EventBridge<br/>(inter-service events)"]
    end

    subgraph AI["AI / ML Layer"]
        BR["Amazon Bedrock<br/>(Claude — reasoning,<br/>Titan — embeddings)"]
        subgraph SM["SageMaker"]
            EIC["Event Impact<br/>Classifier"]
            AAP["Agent Action<br/>Predictor"]
            CPM["Cascade Probability<br/>Model"]
            ANTR["ANTR Calibration<br/>Model"]
            CE["Confidence<br/>Estimator"]
            GNN["Supply Chain<br/>GNN"]
        end
    end

    subgraph Data["Data Layer"]
        NEP["Amazon Neptune<br/>(knowledge graph)"]
        DDB["DynamoDB<br/>(state + calibration store)"]
        S3["S3<br/>(docs, sims, reports, ML data)"]
        RC["ElastiCache Redis<br/>(sessions, rate limiting,<br/>real-time broadcast)"]
    end

    subgraph Streaming["Streaming (Phase 4)"]
        KIN["Kinesis Data Streams<br/>(real-time market data)"]
        MDF["Market Data Feeds<br/>(Polygon.io, SEC EDGAR,<br/>Alpha Vantage)"]
    end

    subgraph Monitoring["Observability"]
        CW["CloudWatch<br/>(metrics + logs)"]
        XR["X-Ray<br/>(distributed tracing)"]
    end

    SPA --> CF
    WS --> APIGW
    CF --> APIGW
    APIGW --> WAF
    APIGW --> COG
    APIGW --> API

    API --> SQS
    SQS --> SF
    SF --> KGW
    SF --> SIMW
    SF --> REPW
    EB --> SF

    KGW --> BR
    KGW --> NEP
    SIMW --> BR
    SIMW --> SM
    SIMW --> NEP
    SIMW --> DDB
    REPW --> BR
    REPW --> NEP

    API --> DDB
    API --> S3
    API --> RC

    SIMW --> S3
    REPW --> S3

    KIN --> EB
    MDF --> KIN

    API --> CW
    SIMW --> CW
    API --> XR

    SM --> DDB

    style Client fill:#e0e7ff,stroke:#4f46e5
    style Edge fill:#fef3c7,stroke:#d97706
    style Compute fill:#d1fae5,stroke:#059669
    style AI fill:#fce7f3,stroke:#db2777
    style Data fill:#dbeafe,stroke:#2563eb
    style Orchestration fill:#f3e8ff,stroke:#7c3aed
    style Streaming fill:#fff7ed,stroke:#ea580c
    style Monitoring fill:#f1f5f9,stroke:#64748b
```

---

## 2. Simulation Engine Detail (ABIDES-based)

The core simulation architecture showing how LLM agents, ABIDES-native agents, and the constraint/cascade engines interact through the ABIDES exchange.

```mermaid
graph TB
    subgraph AgentManager["nVision Agent Manager"]
        direction TB

        subgraph LLM["LLM-Powered Agents<br/>(Institutional PMs, Retail Cohorts)"]
            P1["1. Perceive<br/>(Neptune → events,<br/>positions, relationships)"]
            P2["2. Reason<br/>(Bedrock → interpretation<br/>+ psychological bias)"]
            P3["3. Decide<br/>(Bedrock → action intent)"]
            P4["4. Size<br/>(SageMaker → quantity,<br/>ML corrects prompt sensitivity)"]
            P5["5. Submit<br/>(order → ABIDES exchange)"]
            P1 --> P2 --> P3 --> P4 --> P5
        end

        subgraph RuleBased["ABIDES-Native + Custom Rule-Based Agents"]
            ZI["ZeroIntelligence<br/>Agent<br/>(liquidity baseline)"]
            MOM["Momentum<br/>Agent<br/>(trend-following)"]
            MM["MarketMaker<br/>Agent<br/>(inventory mgmt)"]
            VAL["Value<br/>Agent<br/>(fundamental)"]
            DH["DeltaHedging<br/>Agent<br/>(options MM)"]
            SA["StatArb<br/>Agent<br/>(pairs trading)"]
            IR["IndexRebalance<br/>Agent<br/>(passive flow)"]
        end
    end

    subgraph Constraint["Constraint Engine"]
        MC["Mandate<br/>compliance"]
        PL["Position<br/>limits"]
        ML["Margin /<br/>leverage"]
        SL["Stop-loss<br/>triggers"]
        CB["Circuit<br/>breaker"]
    end

    subgraph ABIDES["ABIDES Exchange"]
        LOB["Limit Order Book<br/>(ITCH/OUCH protocol)"]
        MATCH["Price-Time Priority<br/>Matching Engine"]
        FILLS["Fill Confirmations<br/>+ Book Updates"]
    end

    subgraph Cascade["Cascade Detection Engine"]
        CPM2["Cascade Probability<br/>Model (RNN)"]
        SCGNN["Supply Chain GNN<br/>(impact propagation)"]
        ALERT["Cascade Alert<br/>(if P > threshold)"]
    end

    subgraph Outputs["Per-Step Outputs"]
        PRICE["New Price"]
        OB["Order Book<br/>Snapshot"]
        ACTS["Agent Actions<br/>Log"]
        CALSTORE["Calibration<br/>Store Update"]
    end

    P5 --> Constraint
    ZI --> ABIDES
    MOM --> ABIDES
    MM --> ABIDES
    VAL --> ABIDES
    DH --> ABIDES
    SA --> ABIDES
    IR --> ABIDES
    Constraint -->|"orders pass"| ABIDES
    Constraint -->|"orders blocked"| ACTS

    LOB --> MATCH --> FILLS

    FILLS --> Cascade
    FILLS --> Outputs
    CPM2 --> ALERT
    SCGNN --> ALERT
    ALERT --> Outputs

    FILLS -.->|"broadcast to all agents"| LLM
    FILLS -.->|"broadcast to all agents"| RuleBased

    style LLM fill:#fce7f3,stroke:#db2777
    style RuleBased fill:#d1fae5,stroke:#059669
    style ABIDES fill:#dbeafe,stroke:#2563eb
    style Constraint fill:#fef3c7,stroke:#d97706
    style Cascade fill:#fee2e2,stroke:#dc2626
    style Outputs fill:#f1f5f9,stroke:#64748b
```

---

## 3. Five-Step Pipeline Flow

The end-to-end pipeline from document upload to interactive exploration, orchestrated by Step Functions.

```mermaid
graph LR
    subgraph Step1["Step 1: Event Ingestion<br/>& Graph Build"]
        DOC["Documents<br/>(10-Ks, transcripts,<br/>news, scenarios)"]
        EXTRACT["FinDKG-Style<br/>Extraction<br/>(Bedrock + reflection<br/>agent validation)"]
        KG["Financial<br/>Knowledge Graph<br/>(Neptune)"]
        EIC2["Event Impact<br/>Classifier<br/>(SageMaker)"]
    end

    subgraph Step2["Step 2: Agent Generation<br/>& Environment Setup"]
        ENTITIES["Read Entities<br/>from KG"]
        RANK["Entity Importance<br/>Ranker<br/>(PageRank)"]
        PERSONA["LLM Persona<br/>Generation<br/>(Bedrock)"]
        CONFIG["Sim Config<br/>Auto-generation"]
        SPLIT{{"Top-N → LLM agents<br/>Rest → ABIDES-native"}}
    end

    subgraph Step3["Step 3: Market<br/>Simulation"]
        SIM["ABIDES Exchange<br/>+ LLM Agents<br/>+ Rule-Based Agents"]
        CONSTRAIN["Constraint Engine<br/>(margin, stops,<br/>circuit breakers)"]
        CASCADE["Cascade Detection<br/>(RNN + GNN)"]
        EVOLVE["Graph Evolves<br/>(positions shift,<br/>relationships emerge)"]
    end

    subgraph Step4["Step 4: Report<br/>Generation"]
        REACT["ReACT Agent<br/>(Bedrock)"]
        RETRIEVE["Retrieval Tools<br/>(InsightForge,<br/>PanoramaSearch,<br/>QuickSearch)"]
        SCENARIOS["Scenario-Weighted<br/>Predictions"]
        CI["Conformal Prediction<br/>Confidence Intervals"]
    end

    subgraph Step5["Step 5: Interactive<br/>Exploration"]
        CHAT["Chat with<br/>Report Agent"]
        INTERVIEW["Interview<br/>Individual Agents<br/>(killer feature)"]
        WHATIF["What-If<br/>Variations"]
        COMPARE["Scenario<br/>Comparison"]
    end

    DOC --> EXTRACT --> KG
    DOC --> EIC2
    KG --> ENTITIES --> RANK --> SPLIT
    SPLIT --> PERSONA --> CONFIG

    CONFIG --> SIM
    SIM --> CONSTRAIN --> CASCADE --> EVOLVE
    EVOLVE -.->|"updated graph"| KG

    EVOLVE --> REACT
    REACT --> RETRIEVE --> SCENARIOS --> CI

    CI --> CHAT
    CI --> INTERVIEW
    CI --> WHATIF
    CI --> COMPARE

    style Step1 fill:#dbeafe,stroke:#2563eb
    style Step2 fill:#d1fae5,stroke:#059669
    style Step3 fill:#fce7f3,stroke:#db2777
    style Step4 fill:#f3e8ff,stroke:#7c3aed
    style Step5 fill:#fef3c7,stroke:#d97706
```

---

## 4. Calibration Feedback Loop (ANTR Pipeline)

The continuous calibration system that makes every simulation run improve the next one.

```mermaid
graph TB
    subgraph SimRun["Simulation Run"]
        SIM2["ABIDES Simulation<br/>(LLM + ML + rule-based agents)"]
        PRED["Predicted Outcomes<br/>(price paths, scenarios,<br/>cascade points)"]
    end

    subgraph Wait["Real-World Observation"]
        MKT["Actual Market<br/>Outcomes<br/>(via market data feeds)"]
        RESIDUAL["Compute Residuals<br/>(predicted − actual)"]
    end

    subgraph CalStore["Calibration Store (DynamoDB)"]
        CS["prediction_id<br/>predicted_outcomes<br/>actual_outcomes<br/>residuals<br/>agent_params<br/>market_regime<br/>event_type<br/>confidence_intervals"]
    end

    subgraph Retrain["ANTR Retraining Pipeline"]
        TRIGGER["EventBridge Trigger<br/>(N new samples<br/>accumulated)"]
        TRAIN["SageMaker Training<br/>(ANTR neural posterior<br/>estimation)"]
        DEPLOY["Deploy Updated<br/>Model<br/>(shadow variant<br/>→ 10% traffic)"]
        PROMOTE["Promote to Primary<br/>(after 7-day validation)"]
    end

    subgraph Outputs2["Improved Predictions"]
        NARROWER["Narrower Confidence<br/>Intervals"]
        BETTER["Better Agent<br/>Parameter Estimation"]
        LOWER["Lower Residual<br/>Error"]
    end

    subgraph Flywheel["Flywheel Effect"]
        MORE_CUST["More Customers"]
        MORE_SIMS["More Simulations"]
        MORE_DATA["More Calibration Data"]
        BETTER_PRED["Better Predictions"]
    end

    SIM2 --> PRED
    PRED --> RESIDUAL
    MKT --> RESIDUAL
    RESIDUAL --> CS

    CS --> TRIGGER --> TRAIN --> DEPLOY --> PROMOTE

    PROMOTE --> Outputs2
    NARROWER --> SIM2
    BETTER --> SIM2
    LOWER --> SIM2

    MORE_CUST --> MORE_SIMS --> MORE_DATA --> BETTER_PRED --> MORE_CUST

    style SimRun fill:#fce7f3,stroke:#db2777
    style Wait fill:#dbeafe,stroke:#2563eb
    style CalStore fill:#fef3c7,stroke:#d97706
    style Retrain fill:#d1fae5,stroke:#059669
    style Outputs2 fill:#f3e8ff,stroke:#7c3aed
    style Flywheel fill:#f1f5f9,stroke:#64748b
```

---

## 5. Knowledge Graph Construction (FinDKG-Style)

The multi-pass extraction pipeline from documents to temporal financial knowledge graph.

```mermaid
graph LR
    subgraph Sources["Document Sources"]
        PDF["10-K / 10-Q<br/>Filings"]
        EARN["Earnings<br/>Transcripts"]
        NEWS["News<br/>Articles"]
        EXEC["Executive<br/>Orders"]
        FREE["Free-Text<br/>Scenario"]
    end

    subgraph Parse["Document Processing"]
        CHUNK["Intelligent Chunking<br/>(table-aware, section-aware)"]
        EMBED["Titan Embeddings<br/>(for retrieval)"]
    end

    subgraph Extract["Entity Extraction (Bedrock)"]
        PASS1["Pass 1: Initial Extraction<br/>(Claude → entity/relationship<br/>triples using financial<br/>ontology schema)"]
        PASS2["Pass 2: Reflection Agent<br/>(validates extractions,<br/>catches errors,<br/>resolves conflicts)"]
        PASS3["Pass 3: Cross-Document<br/>Entity Resolution<br/>(merge duplicates,<br/>link co-references)"]
    end

    subgraph Ontology["Financial Ontology"]
        ENT["Entity Types:<br/>Company, InstitutionalInvestor,<br/>RetailCohort, AlgorithmicStrategy,<br/>MarketMaker, CentralBank,<br/>Regulator, Event"]
        REL["Relationship Types:<br/>SUPPLIES, COMPETES_WITH,<br/>HOLDS_POSITION, CREDIT_EXPOSURE,<br/>TRACKS, REGULATES,<br/>POLICY_SENSITIVITY,<br/>CORRELATES_WITH, TRIGGERED_BY"]
    end

    subgraph Graph["Neptune Knowledge Graph"]
        WRITE["Write to Neptune<br/>(Gremlin)"]
        TEMPORAL["Temporal Properties<br/>(valid_from / valid_to<br/>on every entity + edge)"]
        NAMED["Tenant-Scoped<br/>Named Graphs"]
    end

    subgraph Enrich["ML Enrichment"]
        RANK2["Entity Importance<br/>Ranker (PageRank)"]
        REGIME["Correlation Regime<br/>Detector (HMM)"]
        IMPACT["Event Impact<br/>Classifier (XGBoost)"]
    end

    Sources --> CHUNK --> EMBED
    CHUNK --> PASS1
    Ontology -.->|"schema"| PASS1
    PASS1 --> PASS2 --> PASS3

    PASS3 --> WRITE --> TEMPORAL --> NAMED

    NAMED --> RANK2
    NAMED --> REGIME
    NAMED --> IMPACT

    style Sources fill:#f1f5f9,stroke:#64748b
    style Parse fill:#dbeafe,stroke:#2563eb
    style Extract fill:#fce7f3,stroke:#db2777
    style Ontology fill:#fef3c7,stroke:#d97706
    style Graph fill:#d1fae5,stroke:#059669
    style Enrich fill:#f3e8ff,stroke:#7c3aed
```

---

## 6. Multi-Tenant Data Isolation

How tenant data is isolated across every layer of the stack.

```mermaid
graph TB
    subgraph Request["Incoming Request"]
        JWT["JWT Token<br/>(Cognito)"]
        CLAIMS["Claims:<br/>sub, email,<br/>tenant_id, tier, roles"]
    end

    subgraph Auth["Authorization"]
        AUTHZ["API Gateway<br/>Cognito Authorizer"]
        APPTENANT["Application Layer<br/>tenant_id extraction"]
    end

    subgraph Isolation["Data Isolation by Layer"]
        subgraph NeptuneIso["Neptune"]
            NG["Named Graph:<br/>tenant:{tenant_id}:graph:{graph_id}"]
        end
        subgraph DynamoIso["DynamoDB"]
            PK["Partition Key:<br/>TENANT#{tenant_id}"]
        end
        subgraph S3Iso["S3"]
            PREFIX["Prefix:<br/>tenants/{tenant_id}/"]
            IAM["IAM Policy<br/>Scoping"]
        end
        subgraph SQSIso["SQS"]
            ATTR["Message Attribute:<br/>tenant_id"]
        end
        subgraph BedrockIso["Bedrock"]
            TAG["Usage Tagged<br/>per tenant_id"]
        end
        subgraph SMIso["SageMaker"]
            SHARED["Shared Endpoints<br/>(Analyst + Professional)"]
            DEDICATED["Dedicated Endpoints<br/>(Enterprise)"]
        end
    end

    subgraph Quotas["Quota Enforcement"]
        APIGWQ["API Gateway<br/>Usage Plans<br/>(rate limits per tier)"]
        APPQ["Application Layer<br/>DynamoDB Counters<br/>(sim runs, storage,<br/>graph nodes)"]
    end

    JWT --> AUTHZ --> APPTENANT
    APPTENANT --> NeptuneIso
    APPTENANT --> DynamoIso
    APPTENANT --> S3Iso
    APPTENANT --> SQSIso
    APPTENANT --> BedrockIso
    APPTENANT --> SMIso
    APPTENANT --> Quotas

    style Request fill:#f1f5f9,stroke:#64748b
    style Auth fill:#fef3c7,stroke:#d97706
    style Isolation fill:#dbeafe,stroke:#2563eb
    style Quotas fill:#fee2e2,stroke:#dc2626
```

---

## 7. Competitive Positioning Map

Where nVision sits relative to existing tools across two axes: simulation fidelity and AI/explainability.

```mermaid
quadrantChart
    title Competitive Positioning: Simulation Fidelity vs AI Explainability
    x-axis Low Simulation Fidelity --> High Simulation Fidelity
    y-axis Low AI / Explainability --> High AI / Explainability
    quadrant-1 "nVision Target Zone"
    quadrant-2 "AI-Rich, No Market Sim"
    quadrant-3 "Legacy Tools"
    quadrant-4 "Sim-Rich, No AI"
    nVision: [0.85, 0.9]
    FactSet Scenario: [0.3, 0.2]
    MSCI RiskMetrics: [0.35, 0.15]
    Bloomberg PORT: [0.4, 0.2]
    Simudyne: [0.8, 0.2]
    TradingAgents: [0.2, 0.7]
    FinRobot: [0.1, 0.65]
    StockSim: [0.7, 0.5]
    MarS: [0.75, 0.1]
    FinMem: [0.15, 0.55]
    ABIDES: [0.85, 0.1]
```

---

*Last updated: 2026-03-15*
*Diagrams render via Mermaid — view on GitHub or use a Mermaid-compatible viewer*
