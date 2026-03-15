# nVision — Productization Strategy

## Executive Summary

nVision is an AI-powered market simulation and scenario analysis platform built by nClouds. It enables financial professionals to upload real-world event data, construct knowledge graphs of market actors, simulate how those actors respond through multi-agent LLM-driven simulation, and receive structured predictive reports — all on AWS-native infrastructure.

This document outlines the productization strategy, market positioning, target customers, pricing model, technical architecture, go-to-market plan, and revenue projections.

---

## Origin

nVision is a fork of MiroFish, an existing AI social simulation engine that:

- Ingests unstructured documents and generates knowledge graph ontologies via LLM
- Builds entity-relationship graphs using Zep (graph memory platform)
- Auto-generates agent personas with unique behavioral profiles
- Runs dual-platform multi-agent simulations (OASIS framework)
- Produces ReACT-style analytical reports with tool-augmented retrieval
- Supports interactive post-simulation Q&A (agent interviews, surveys)

The core pipeline — **documents → knowledge graph → agent simulation → report → interaction** — is domain-agnostic. nVision adapts this pipeline for financial market prediction and scenario analysis.

---

## Market Opportunity

### The Problem

Financial professionals need to answer: **"If Event X happens, what are the second and third-order market effects?"**

Current tools fail at this because:

1. **Monte Carlo scenario tools (FactSet, MSCI, Bloomberg PORT, Morningstar Direct)** — the real incumbent competitors. They use statistical simulation or historical replay, but **cannot model behavioral feedback loops or cascading second/third-order effects**. They answer "what happened before" not "what happens next given how actors behave"
2. **Bloomberg/Refinitiv** — excellent data terminals, but no simulation or scenario modeling
3. **Traditional quant models** — pattern-match on historical data; can't handle novel events (the Lucas Critique: rules calibrated to past behavior break under regime changes)
4. **Single-agent LLM tools (FinRobot, FinAgent)** — can reason about one company or generate research reports, but can't model multi-actor cascades or market microstructure
5. **LLM multi-agent trading systems (TradingAgents, StockAgent, FinMem, FinCon, QuantAgents)** — academic prototypes focused on generating trade signals, not scenario analysis; none combine document ingestion, knowledge graphs, realistic order book simulation, and structured reporting
6. **Traditional ABM platforms (Simudyne)** — the only production ABM vendor (deployed at HKEX, LSEG), but no LLM agents, no knowledge graphs, no document ingestion — it's a quant tool, not an AI-powered scenario platform
7. **Generative market models (MarS)** — emerging foundation-model approach that learns order-level dynamics from data without explicit agents; strong realism but black-box with no explainable agent narratives

### The Gap: Four Pillars Nobody Combines

No existing product chains all four pillars: **(1) document → knowledge graph**, **(2) multi-agent market simulation** with realistic order book, **(3) hybrid LLM + rule-based agents**, and **(4) structured scenario reports** with confidence intervals.

| Capability | nVision | FactSet/MSCI | Simudyne | TradingAgents | FinRobot | StockSim | MarS |
|---|---|---|---|---|---|---|---|
| Document → knowledge graph | ✅ | ❌ | ❌ | ❌ | Partial | ❌ | ❌ |
| Auto-generated agent personas | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Multi-agent market simulation | ✅ | Monte Carlo | ✅ | Debate only | ❌ | ✅ | Generative |
| Realistic order book / matching | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Hybrid LLM + rule-based agents | ✅ | ❌ | Rule only | LLM only | LLM only | LLM only | No agents |
| Evolving graph memory | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Structured scenario reports | ✅ | Templates | ❌ | ❌ | ✅ | ❌ | ❌ |
| Interactive post-sim Q&A | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Interview individual agents** | **✅** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Calibrated confidence intervals | ✅ | ❌ | Partial | ❌ | ❌ | ❌ | ❌ |
| Production SaaS platform | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

**The pitch in one sentence:** nVision is behavioral simulation for markets — where FactSet/MSCI tell you what the statistics say, nVision shows you what the *actors* do.

### Market Size

- ~3,500 family offices in the US (**primary beachhead** — technology-underserved, 3x AI adoption growth 2024→2025, 65% prioritize AI investments per JPMorgan survey of 333 family offices, shorter sales cycles than institutional)
- ~13,000 registered investment advisors
- ~4,000 hedge funds (95% of fund managers now use Gen AI per AIMA survey of 150 managers/$788B AUM — but almost entirely for research/admin, not simulation)
- Fortune 500 corporate treasury/risk teams
- Insurance company investment and catastrophe modeling teams
- Fintech startups building on AI for finance
- Adjacent: synthetic financial data market ($310-576M in 2024), financial digital twin market ($3.9B in 2024, projected $18.4B by 2035)

---

## The Platform Play

### Product Vision

A multi-tenant SaaS platform where financial professionals can:

1. **Define scenarios** — upload earnings reports, regulatory filings, news events, or describe hypothetical events
2. **Build financial knowledge graphs** — automatically extract market actors, positions, relationships, and constraints using FinDKG-style dynamic graph construction from financial documents
3. **Run simulations** — watch AI agents (institutional investors, retail traders, algorithmic strategies, market makers, regulators) interact in a simulated market environment with realistic order book mechanics
4. **Receive predictions** — scenario-weighted price paths, cascade risk points, time-to-impact, and calibrated confidence intervals (conformal prediction — the emerging standard for financial AI uncertainty)
5. **Explore interactively** — ask follow-up questions, **interview individual agents** ("Why did you sell NVDA at that price?"), run what-if variations

**Killer feature: Interview-an-Agent.** No other platform lets you interrogate a simulated hedge fund PM about their reasoning, a market maker about their inventory management, or a retail cohort about their sentiment. This is inherently more explainable than any black-box model — and explainability is increasingly a regulatory baseline expectation (EU AI Act high-risk rules take effect August 2, 2026).

### Five-Step Pipeline (adapted from MiroFish)

#### Step 1: Event Ingestion & Graph Build

**Input:** Documents (10-Ks, earnings transcripts, executive orders, news articles), portfolio data, or free-text scenario descriptions.

**Process:**
- LLM extracts entities and relationships into a financial ontology
- Knowledge graph built with financial entity types:
  - Companies (with balance sheet exposure, sector, supply chain position)
  - Institutional investors (with mandates, AUM, known positions from 13F filings)
  - Central banks (with policy frameworks, stated reaction functions)
  - Market makers (with inventory models, hedging behavior)
  - Retail cohorts (characterized by sentiment, platform, holding patterns)
  - Governments/regulators (with political incentives, election cycles)
  - Algorithmic strategies (momentum, mean-reversion, stat-arb)
- Edge types capture: supply chain dependencies, credit exposure, competitive dynamics, policy sensitivity, correlation regimes, and a **positioning layer** (who holds what, at what leverage)

**ML models involved:**
- Event Impact Classifier (gradient-boosted ensemble) — predicted severity
- Anomaly Detection (isolation forest) — pre-news positioning signals
- Supply Chain Propagation Model (graph neural network) — impact magnitude and delay through the graph
- Correlation Regime Detector (hidden Markov model) — current market regime identification

#### Step 2: Agent Generation & Environment Setup

**Process:**
- Read entities from the knowledge graph
- LLM generates detailed agent personas with financial behavioral profiles:
  - Investment mandate and constraints
  - Risk tolerance and position sizing rules
  - Information processing speed and sources
  - Historical behavior patterns in similar events
  - Herding tendency, contrarian tendency, loss aversion
- Simulation config auto-generated:
  - Market hours and time flow
  - Per-agent activity schedules
  - Order book parameters
  - Recommendation/information propagation algorithm weights

**ML models involved:**
- Agent Action Predictor (per-agent-type XGBoost/neural net) — probability distributions over buy/sell/hold/hedge with sizing
- Entity Importance Ranker (PageRank on financial graph) — determines which agents get high-fidelity LLM simulation vs. cheap heuristics

#### Step 3: Market Simulation

**Process:**
- Agents run decision cycles each time step:
  1. Perceive (new information, filtered by access level)
  2. Interpret (through their investment framework)
  3. Decide (buy/sell/hold/hedge, constrained by mandate and risk limits)
  4. Act (submit orders to the simulated order book)
- Dual-mode agents:
  - **LLM-powered agents** for discretionary actors (institutional PMs, retail sentiment-driven)
  - **Rule-based/ML agents** for algorithmic strategies and market makers (no LLM overhead — run actual trading rules)
- Price determined by order book matching engine
- Portfolio values update → margin checks → forced actions (stop losses, margin calls, option expirations)
- Results written back to knowledge graph (graph evolves with simulation)

**ML models involved:**
- Cascade Probability Model (RNN) — probability of forced-liquidation feedback loop at each price level
- Order Book Simulator (reinforcement learning / neural ODE) — converts agent decisions to predicted price paths
- Residual Error Model (meta-learner) — bias correction based on historical simulation accuracy

#### Step 4: Report Generation

**Process:**
- ReACT agent analyzes the full simulation
- Uses retrieval tools against the evolved knowledge graph:
  - InsightForge (deep hybrid retrieval with auto-generated sub-questions)
  - PanoramaSearch (broad context retrieval)
  - QuickSearch (fast factual lookups)
- Generates scenario-weighted output:
  - Multiple scenarios with probability weights (from Bayesian network)
  - Predicted price paths per scenario (hour-by-hour for first 72 hours)
  - Key cascade risk points
  - Which agents drove the outcome
  - Confirmation/disconfirmation signals to watch for

**ML models involved:**
- Scenario Probability Weighter (Bayesian network / mixture of experts)
- Time-to-Impact Estimator (survival model)
- Confidence Estimator (conformal prediction) — calibrated confidence intervals

#### Step 5: Interactive Exploration

**Process:**
- Chat with Report Agent (follow-up Q&A with tool-augmented retrieval)
- Interview individual agents (ask a simulated hedge fund PM why they sold)
- Run what-if variations ("what if the Fed intervenes at -10%?")
- Compare scenarios side by side

---

## Technical Architecture (AWS-Native)

### Infrastructure

| Component | AWS Service | Purpose |
|---|---|---|
| LLM Orchestration | Amazon Bedrock | Agent reasoning, persona generation, report writing |
| ML Model Training | Amazon SageMaker | Train/host cascade, classification, GNN models |
| Knowledge Graph | Amazon Neptune | Financial entity-relationship graph (replaces Zep for enterprise) |
| Simulation Compute | ECS / Fargate | Agent simulation at scale |
| Orchestration | Step Functions | Multi-step pipeline coordination |
| Data Lake | S3 + Athena | Market data, simulation results, calibration data |
| Real-time Streaming | Kinesis | Live market data and event ingestion |
| Auth / Multi-tenant | Cognito | User management, tenant isolation |
| API Layer | API Gateway + Lambda | REST/WebSocket APIs |
| Frontend | CloudFront + S3 | React SPA (from existing nVision frontend) |
| Observability | CloudWatch + X-Ray | Monitoring, tracing, cost tracking |
| Secrets | Secrets Manager | API keys, data feed credentials |

### Data Integrations

| Data Source | Purpose | Cost |
|---|---|---|
| Polygon.io or Databento | Real-time + historical market data | $500-$2K/mo |
| SEC EDGAR | Regulatory filings, 13F positions | Free |
| Alpha Vantage / Yahoo Finance | MVP market data (free tier) | Free |
| NewsAPI or Benzinga | News event feed | $200-$1K/mo |
| Reddit/StockTwits API | Retail sentiment signal | Free-$500/mo |
| CBOE Options Data | Options positioning, gamma exposure | $1K-$5K/mo |

### Multi-Tenant Architecture

- Tenant isolation at the data layer (Neptune named graphs per tenant, S3 prefix per tenant)
- Shared compute with per-tenant quotas (simulation run limits, concurrent agent counts)
- Tenant-specific ML model calibration (each customer's historical accuracy improves independently)
- SSO integration (Cognito federated identity for enterprise customers)

---

## Pricing

### Tier Structure

| Tier | Target Customer | Monthly Price | Included |
|---|---|---|---|
| **Analyst** | Individual traders, small RIAs | $500-$2,000/mo | Pre-built scenario templates, basic simulation (up to 50 agents), 10 runs/month, standard reports |
| **Professional** | Mid-size funds, family offices | $5,000-$15,000/mo | Custom agent models, unlimited runs, up to 500 agents, API access, portfolio upload, priority compute |
| **Enterprise** | Institutional, corporate treasury | $25,000-$75,000/mo | Custom calibration on client's historical data, private deployment option, dedicated support, compliance audit logging, SSO, SLA |

### Add-Ons

| Add-On | Price | Description |
|---|---|---|
| Real-time event monitoring | $2,000-$5,000/mo | Continuous event detection + instant simulation |
| Custom data integration | $5,000 one-time + $500/mo | Connect proprietary data sources |
| Historical calibration package | $10,000-$25,000 one-time | Backtest against 2+ years of events for client-specific tuning using ANTR neural posterior estimation (50% calibration error reduction vs. traditional methods) |
| Synthetic market data feed | $3,000-$10,000/mo | Simulation-generated synthetic order book, price, and agent behavior data for ML training, strategy backtesting, or regulatory sandbox testing (FCA-endorsed approach) |
| White-label deployment | Custom | Full private deployment on client's AWS account |

### AWS Marketplace Listing

- List on AWS Marketplace for distribution through AWS sales channels
- Customers pay through existing AWS commitment (reduces procurement friction)
- nClouds earns AWS partner credit for Marketplace revenue
- Qualifies for ISV co-sell programs and AWS funding

---

## Go-to-Market

### Phase 1: Demo & Validation (Months 1-3)

**Objective:** Build a compelling financial demo and validate demand, targeting family offices as the primary beachhead.

**Why family offices first:** Technology-underserved (no Bloomberg terminals or quant teams), 3x AI adoption growth YoY, shorter sales cycles than institutional, and 51% already use AI in their investment process (but zero use simulation-based scenario analysis — this is our gap). They need the *answer* ("what happens if..."), not raw data.

**Actions:**
1. Build a "Financial Scenario" mode using the existing 5-step pipeline with financial entity types
2. Pre-load 2-3 compelling demos tailored to family office concerns:
   - "What happens if NVIDIA misses earnings by 20%?" (concentrated tech exposure)
   - "What happens if the Fed does an emergency 50bps rate cut?" (fixed income reallocation)
   - "Simulate the market impact of a major cybersecurity breach at a top-5 bank" (tail risk / contagion)
3. **Lead every demo with the calibration story** — show confidence intervals, explain the ML calibration feedback loop, demonstrate the residual error correction. The #1 reason ABM fails in production is calibration; leading with this differentiates immediately from both Monte Carlo tools and academic prototypes
4. **Showcase Interview-an-Agent** — this is the "aha moment" in demos. Let prospects ask a simulated hedge fund PM why they sold, or interrogate a market maker about their spread widening
5. Record a 3-minute product demo video
6. Identify and reach out to 5-10 family offices through AWS FinServ rep introductions and family office networks (RBC/Campden, JPMorgan GFO)
7. Run 3-5 discovery calls to validate willingness to pay

**Positioning:** Frame nVision against FactSet/MSCI scenario tools, not against other ABMs. The pitch is **"behavioral simulation > statistical simulation"** — where Monte Carlo tells you what the statistics say, nVision shows you what the actors do.

**Investment:** 2-3 engineers × 8-12 weeks (~$80K-$120K internal cost)

**Success criteria:** 3+ family office prospects express willingness to pay; 1+ signs a LOI or POC agreement

### Phase 2: Beta Platform (Months 3-6)

**Objective:** Ship a working multi-tenant beta to 5-10 design partners.

**Actions:**
1. Build multi-tenant infrastructure (auth, billing, data isolation)
2. Integrate market data feeds (start with Alpha Vantage free → Polygon.io paid)
3. Build financial UI (portfolio views, price charts, scenario comparison dashboards)
4. Pre-train core ML models (event impact classifier, agent action predictor) on 2 years of S&P 500 earnings data
5. Onboard 5-10 beta users at discounted rates ($1K-$3K/mo)
6. Collect feedback, calibrate models, iterate

**Investment:** 3-4 engineers × 12-16 weeks (~$200K-$350K internal cost)

**Revenue:** $5K-$30K/mo from beta users

### Phase 3: GA Launch & AWS Marketplace (Months 6-9)

**Objective:** General availability with full pricing, listed on AWS Marketplace.

**Actions:**
1. Production hardening (SLA, monitoring, compliance logging)
2. AWS Marketplace listing
3. Launch Professional and Enterprise tiers
4. Publish case studies from beta users
5. Present at AWS re:Invent, AWS Summit, or FinServ-specific events
6. Activate AWS co-sell program (AWS reps actively sell nVision to their FinServ customers)

**Revenue target:** 10-15 subscribers = $50K-$150K MRR

### Phase 4: Scale & Expand (Months 9-18)

**Objective:** Reach $100K+ MRR and expand use cases beyond scenario analysis.

**Actions:**
1. Add real-time event monitoring tier
2. Expand beyond equities: FX, commodities, crypto, credit
3. Add custom calibration packages for enterprise
4. **Launch synthetic market data product** — sell simulation-generated order book, price, and agent behavior data as a standalone product for ML training, strategy backtesting, and regulatory sandbox testing (FCA-endorsed). This creates a secondary revenue stream that reinforces the calibration flywheel (more simulations → better models → better synthetic data → more customers)
5. Build partner channel (other AWS consultancies resell nVision)
6. Consider strategic investment or spin-out if growth warrants it

**Revenue target:** 30-50 subscribers = $200K-$500K MRR + synthetic data revenue

---

## Revenue Projections

### Conservative (Platform Only)

| Quarter | Subscribers | Avg MRR/Sub | MRR | Quarterly Revenue |
|---|---|---|---|---|
| Q3 2026 | 5 (beta) | $2,000 | $10,000 | $30,000 |
| Q4 2026 | 12 | $6,000 | $72,000 | $216,000 |
| Q1 2027 | 20 | $8,000 | $160,000 | $480,000 |
| Q2 2027 | 30 | $9,000 | $270,000 | $810,000 |
| **12-Month Total** | | | | **$1,536,000** |

### Optimistic (Platform + Enterprise)

| Quarter | Platform MRR | Enterprise Deals | Quarterly Revenue |
|---|---|---|---|
| Q3 2026 | $10,000 | 1 × $50K | $80,000 |
| Q4 2026 | $72,000 | 1 × $75K | $291,000 |
| Q1 2027 | $160,000 | 2 × $75K | $630,000 |
| Q2 2027 | $270,000 | 1 × $100K | $910,000 |
| **12-Month Total** | | | **$1,911,000** |

### Impact on Earnout

The $6M earnout target for 2026 breaks down to ~$500K/month average. nVision platform revenue could contribute **$100K-$300K/month** by Q1 2027, representing 20-60% of the monthly target — from a single product line.

---

## Competitive Moat

### The Calibration Advantage (core differentiator)

The #1 reason financial ABM hasn't gone mainstream is **calibration** — too many parameters, equifinality (multiple configs produce identical outputs), and computationally prohibitive validation. nVision solves this with:

1. **ANTR neural posterior estimation** — cutting-edge technique (2024-2026) that reduces calibration error by 50% vs. traditional methods
2. **Conformal prediction confidence intervals** — honest, calibrated uncertainty (not fake precision). The emerging standard for financial AI
3. **Residual error model** — meta-learner that continuously corrects simulation bias using prediction-vs-actual feedback
4. **LLM agents inherently sidestep the Lucas Critique** — unlike rule-based ABMs that break under regime changes, LLM agents adapt to novel scenarios naturally because they reason from first principles, not fitted parameters

This matters because nVision's primary competitor is Monte Carlo (FactSet/MSCI), not other ABMs. Monte Carlo gives no confidence intervals on behavioral outcomes. nVision's calibration story converts the biggest ABM weakness into a selling point.

### Short-term advantages (0-6 months)
- **Working prototype** — nVision already runs end-to-end; LLM trading agent competitors are academic papers
- **Four-pillar integration** — the only system that chains document → knowledge graph → agent simulation → structured report. Research confirms no existing product combines all four (see competitive gap table)
- **Interview-an-Agent explainability** — no competitor offers this; inherently more explainable than black-box alternatives, which is a regulatory selling point (EU AI Act August 2026)
- **AWS-native architecture** — qualifies for funding, co-sell, and Marketplace from day one
- **nClouds delivery capability** — can customize and deploy for enterprise customers immediately

### Medium-term advantages (6-18 months)
- **Calibration data network effect** — every simulation run improves the models via residual error feedback; early customers get better predictions over time
- **Customer-specific tuning** — enterprise tier builds moats per-customer (their models are calibrated to their portfolio and style)
- **Hybrid agent architecture** — validated by FCLAgent research (PRIMA 2025) showing LLM-generated psychological biases combined with rule-based prediction reproduce path-dependent patterns that conventional agents miss. Hybrid is 40-60% cheaper on LLM costs than pure-LLM approaches while being more accurate
- **AWS distribution** — Marketplace listing + co-sell is a channel most AI startups can't access
- **Synthetic data revenue stream** — simulation outputs can be sold as training data ($310-576M market), creating a secondary revenue line that reinforces the calibration flywheel

### Long-term advantages (18+ months)
- **Proprietary financial knowledge graph** — accumulated entity/relationship data across all tenants becomes a unique dataset. FinDKG-style dynamic graphs evolve with every simulation
- **Simulation history** — thousands of simulation runs create a backtesting corpus no competitor can replicate. This is the training data for the next generation of models
- **Brand in FinServ AI** — first-mover in "behavioral simulation for markets"
- **Regulatory moat** — as AI regulation tightens (EU AI Act, SEC guidance), nVision's explainable agent-persona approach becomes a compliance advantage that black-box competitors (MarS, traditional quant models) cannot match

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Financial data feeds are expensive at scale | Medium | Start with free/cheap sources; pass costs to Enterprise tier; negotiate volume discounts |
| LLM hallucination in financial reasoning | High | ML calibration layer corrects LLM bias; conformal prediction confidence intervals flag low-certainty predictions; residual error model continuously corrects; human-in-the-loop for high-stakes |
| **LLM prompt sensitivity** (Lopez-Lira 2025 showed LLM trading behavior changes dramatically with prompt wording) | High | Hybrid architecture mitigates: LLMs for qualitative reasoning only, ML models for quantitative sizing/timing, rule-based agents for deterministic strategies. Prompt sensitivity testing in CI pipeline |
| Regulatory concerns (investment advice) | Medium | Clear disclaimers ("for informational purposes only"); consult securities attorney before GA; avoid specific buy/sell recommendations. EU AI Act high-risk rules (Aug 2026) favor nVision's explainable agent-persona approach over black-box alternatives |
| Long sales cycles in FinServ | Medium | **Family offices first** — shorter cycles, no procurement bureaucracy. AWS co-sell shortens institutional procurement; Marketplace billing reduces friction |
| Engineering bandwidth competes with consulting revenue | Medium | Phase 1 demo is small investment; platform build funded by early beta revenue; dedicated product team by Phase 3 |
| Prediction accuracy isn't good enough | High | ANTR neural posterior estimation cuts calibration error 50%; conformal prediction manages expectations with honest uncertainty; position as "scenario analysis" not "crystal ball"; every simulation improves the residual error model |
| **Simudyne adds LLM agents** | Medium (6-12 mo) | Simudyne's strength is traditional ABM at HKEX/LSEG scale, but they have no KG, no document ingestion, no report generation. Adding LLMs to an existing non-LLM platform is architecturally harder than nVision's native hybrid approach. Speed to market + four-pillar integration is the moat |
| **MarS or similar generative market models mature** | Low (now), Medium (18+ mo) | Generative models are black-box — no agent narratives, no interview capability, no explainability. Position nVision as the explainable alternative. Complementary, not competing: nVision could incorporate generative models as a data source |
| Competitors build similar platforms | Low (now), Medium (later) | Speed to market; calibration data flywheel; AWS distribution advantage; enterprise customization; no competitor has all four pillars today |

---

## Team Requirements

### Phase 1 (Demo)
- 1 senior full-stack engineer (existing team)
- 1 ML/data engineer (existing team or contract)
- Patrick for product direction and sales

### Phase 2 (Beta)
- 2 full-stack engineers
- 1 ML engineer
- 1 data engineer (market data integrations)
- Patrick for product and sales

### Phase 3+ (GA and Scale)
- 3-4 engineers (platform + ML)
- 1 product manager
- 1 solutions architect (enterprise onboarding)
- Sales support (could be Patrick + AWS co-sell initially)

---

## Decision Points

### Go/No-Go: Phase 1 → Phase 2
- Did 3+ prospects express willingness to pay?
- Did the demo generate genuine excitement (not just polite interest)?
- Can we staff Phase 2 without jeopardizing existing client commitments?

### Go/No-Go: Phase 2 → Phase 3
- Do we have 5+ paying beta users?
- Is prediction accuracy improving with calibration (measurable via backtests)?
- Is AWS Marketplace listing approved?
- Do we have at least one case study / testimonial?

---

## Appendix: Key References

### Origin
- **MiroFish codebase:** Origin platform (social simulation engine)
- **OASIS:** Open Agent Social Interaction Simulations ([arxiv.org/abs/2411.11581](https://arxiv.org/abs/2411.11581))

### LLM Financial Agent Systems
- **TradingAgents:** Multi-agent LLM financial trading framework, v0.2.0 Feb 2026 ([github.com/TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents)) ([arxiv.org/abs/2412.20138](https://arxiv.org/abs/2412.20138))
- **StockAgent:** LLM-based stock trading in simulated environments ([arxiv.org/abs/2407.18957](https://arxiv.org/abs/2407.18957))
- **FinRobot:** Open-source AI agent platform for financial analysis ([github.com/AI4Finance-Foundation/FinRobot](https://github.com/AI4Finance-Foundation/FinRobot))
- **FinMem:** LLM trading agent with layered memory, ICLR 2024 ([arxiv.org/abs/2311.13743](https://arxiv.org/abs/2311.13743))
- **FinCon:** Manager-analyst hierarchy with verbal reinforcement, NeurIPS 2024 ([arxiv.org/abs/2407.06567](https://arxiv.org/abs/2407.06567))
- **QuantAgents:** 26 tools, 3 memory types, live trading with 111% returns ([arxiv.org/abs/2509.09995](https://arxiv.org/abs/2509.09995))
- **HedgeAgents:** Multi-asset portfolio hedging with risk constraints ([arxiv.org/abs/2502.13165](https://arxiv.org/abs/2502.13165))
- **FLAG-Trader:** Hybrid LLM + RL, ACL 2025 ([arxiv.org/abs/2502.11433](https://arxiv.org/abs/2502.11433))
- **FCLAgent:** Fundamental-Chartist-LLM-Agent validating hybrid approach, PRIMA 2025 ([arxiv.org/abs/2510.12189](https://arxiv.org/abs/2510.12189))
- **"Can LLMs Trade?" (Lopez-Lira, Apr 2025):** Landmark study showing LLM agents produce realistic price discovery but are highly prompt-sensitive ([arxiv.org/abs/2504.10789](https://arxiv.org/abs/2504.10789))
- **MarketAgents:** Double auction with literate agents ([github.com/marketagents-ai/MarketAgents](https://github.com/marketagents-ai/MarketAgents))

### Market Simulation Infrastructure
- **ABIDES (JPMorgan):** Agent-Based Interactive Discrete Event Simulation, NASDAQ ITCH/OUCH protocol ([github.com/jpmorganchase/abides-jpmc-public](https://github.com/jpmorganchase/abides-jpmc-public))
- **StockSim:** Dual-mode order-level simulator for 500+ concurrent LLM agents ([arxiv.org/abs/2507.09255](https://arxiv.org/abs/2507.09255))
- **JAX-LOB:** GPU-accelerated LOB simulator, 75x faster per-message ([arxiv.org/abs/2308.13289](https://arxiv.org/abs/2308.13289))
- **Simudyne:** Commercial ABM platform deployed at HKEX and LSEG ([simudyne.com](https://simudyne.com/))
- **MarS:** Large Market Model — generative foundation model for order-level dynamics

### Knowledge Graphs for Finance
- **FinDKG:** Dynamic knowledge graph construction from financial news, ACM ICAIF 2024 ([github.com/xiaohui-victor-li/FinDKG](https://github.com/xiaohui-victor-li/FinDKG))
- **FinReflectKG:** Agentic KG construction from SEC 10-K filings, 17.5M triplets, ACM ICAIF 2025 ([huggingface.co/datasets/domyn/FinReflectKG](https://huggingface.co/datasets/domyn/FinReflectKG))

### Calibration & ML
- **ANTR neural posterior estimation:** 50% calibration error reduction for ABMs (2024-2026)
- **Conformal prediction:** Emerging standard for calibrated uncertainty in financial AI
- **Bank of England Working Paper 1122 (Feb 2025):** ABM at central banks survey ([bankofengland.co.uk](https://www.bankofengland.co.uk/working-paper/2025/agent-based-modeling-at-central-banks-recent-developments-and-new-challenges))

### Market Intelligence
- **AIMA survey (2025):** 95% of fund managers use Gen AI, $788B AUM surveyed
- **RBC/Campden (2025):** Family office AI adoption 3x growth YoY
- **JPMorgan GFO (2025):** 65% of 333 family offices prioritize AI investments
