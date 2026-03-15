// ─── Graph API Types ───────────────────────────────────────────────

export interface GraphOntologyRequest {
  files: File[];
  simulation_requirement: string;
  project_name?: string;
}

export interface GraphOntologyResponse {
  success: boolean;
  data: {
    project_id: string;
    name: string;
    ontology: Ontology;
  };
  error?: string;
}

export interface Ontology {
  entity_types?: EntityType[];
  relation_types?: RelationType[];
  [key: string]: unknown;
}

export interface EntityType {
  name: string;
  description?: string;
  [key: string]: unknown;
}

export interface RelationType {
  name: string;
  source?: string;
  target?: string;
  description?: string;
  [key: string]: unknown;
}

export interface BuildGraphRequest {
  project_id: string;
  graph_name?: string;
}

export interface BuildGraphResponse {
  success: boolean;
  data: {
    task_id: string;
  };
  error?: string;
}

export interface TaskStatusResponse {
  success: boolean;
  data: {
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress?: number;
    message?: string;
    error?: string;
    result?: unknown;
  };
  error?: string;
}

export interface GraphNode {
  id: string;
  name: string;
  labels?: string[];
  uuid?: string;
  attributes?: Record<string, unknown>;
  summary?: string;
  created_at?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  name: string;
  fact_type?: string;
  fact?: string;
  episodes?: string[];
  created_at?: string;
  valid_at?: string;
}

export interface GraphDataResponse {
  success: boolean;
  data: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    node_count: number;
    edge_count: number;
  };
  error?: string;
}

export interface Project {
  project_id: string;
  name: string;
  status: string;
  graph_id?: string;
  ontology?: Ontology;
  simulation_requirement?: string;
  created_at?: string;
}

export interface ProjectResponse {
  success: boolean;
  data: Project;
  error?: string;
}

// ─── Simulation API Types ──────────────────────────────────────────

export interface CreateSimulationRequest {
  project_id: string;
  graph_id?: string;
  enable_twitter?: boolean;
  enable_reddit?: boolean;
}

export interface CreateSimulationResponse {
  success: boolean;
  data: {
    simulation_id: string;
    status: string;
  };
  error?: string;
}

export interface PrepareSimulationRequest {
  simulation_id: string;
  entity_types?: string[];
  use_llm_for_profiles?: boolean;
  parallel_profile_count?: number;
  force_regenerate?: boolean;
}

export interface PrepareSimulationResponse {
  success: boolean;
  data: {
    task_id: string;
  };
  error?: string;
}

export interface PrepareStatusRequest {
  task_id?: string;
  simulation_id?: string;
}

export interface PrepareStatusResponse {
  success: boolean;
  data: {
    status: string;
    progress?: number;
    message?: string;
    phase?: string;
  };
  error?: string;
}

export interface AgentProfile {
  agent_id?: string;
  username: string;
  name: string;
  profession?: string;
  bio?: string;
  interested_topics?: string[];
  entity_type?: string;
  entity_name?: string;
  [key: string]: unknown;
}

export interface SimulationProfilesResponse {
  success: boolean;
  data: {
    profiles: AgentProfile[];
  };
  error?: string;
}

export interface TimeConfig {
  total_simulation_hours: number;
  minutes_per_round: number;
  peak_hours?: number[];
  work_hours?: number[];
  morning_hours?: number[];
  off_peak_hours?: number[];
  multipliers?: Record<string, number>;
}

export interface AgentConfig {
  agent_id: string;
  entity_name: string;
  entity_type: string;
  stance?: string;
  active_hours?: number[];
  posts_per_hour?: number;
  comments_per_hour?: number;
  response_delay_min?: number;
  response_delay_max?: number;
  activity_level?: number;
  sentiment_bias?: number;
  influence_weight?: number;
}

export interface PlatformConfig {
  recency_weight?: number;
  popularity_weight?: number;
  relevance_weight?: number;
  viral_threshold?: number;
  echo_chamber_strength?: number;
}

export interface EventConfig {
  narrative_direction?: string;
  hot_topics?: string[];
  initial_posts?: Array<{
    content: string;
    platform?: string;
    agent_id?: string;
  }>;
}

export interface SimulationConfig {
  time_config?: TimeConfig;
  agent_configs?: AgentConfig[];
  twitter_config?: PlatformConfig;
  reddit_config?: PlatformConfig;
  event_config?: EventConfig;
  generation_reasoning?: string;
}

export interface SimulationConfigResponse {
  success: boolean;
  data: SimulationConfig;
  error?: string;
}

export interface Simulation {
  simulation_id: string;
  project_id: string;
  status: string;
  graph_id?: string;
  report_id?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface SimulationResponse {
  success: boolean;
  data: Simulation;
  error?: string;
}

export interface SimulationListResponse {
  success: boolean;
  data: {
    simulations: Simulation[];
  };
  error?: string;
}

export interface StartSimulationRequest {
  simulation_id: string;
  platform?: string;
  max_rounds?: number;
  enable_graph_memory_update?: boolean;
}

export interface StopSimulationRequest {
  simulation_id: string;
}

export interface RunStatus {
  twitter_running?: boolean;
  reddit_running?: boolean;
  twitter_current_round?: number;
  reddit_current_round?: number;
  total_rounds?: number;
  twitter_actions_count?: number;
  reddit_actions_count?: number;
  status?: string;
  [key: string]: unknown;
}

export interface RunStatusResponse {
  success: boolean;
  data: RunStatus;
  error?: string;
}

export interface RunStatusDetailResponse {
  success: boolean;
  data: RunStatus & {
    recent_actions?: SimulationAction[];
  };
  error?: string;
}

export interface SimulationPost {
  id: string;
  content: string;
  platform: string;
  agent_id?: string;
  agent_name?: string;
  round_num?: number;
  created_at?: string;
  [key: string]: unknown;
}

export interface SimulationPostsResponse {
  success: boolean;
  data: {
    posts: SimulationPost[];
  };
  error?: string;
}

export interface SimulationTimelineResponse {
  success: boolean;
  data: {
    timeline: Array<{
      round: number;
      actions: SimulationAction[];
      [key: string]: unknown;
    }>;
  };
  error?: string;
}

export interface AgentStats {
  [key: string]: unknown;
}

export interface AgentStatsResponse {
  success: boolean;
  data: {
    stats: AgentStats[];
  };
  error?: string;
}

export interface SimulationAction {
  id?: string;
  agent_id?: string;
  agent_name?: string;
  action_type?: string;
  platform?: string;
  content?: string;
  target_id?: string;
  target_content?: string;
  round_num?: number;
  timestamp?: string;
  [key: string]: unknown;
}

export interface SimulationActionsResponse {
  success: boolean;
  data: {
    actions: SimulationAction[];
  };
  error?: string;
}

export interface CloseEnvRequest {
  simulation_id: string;
  timeout?: number;
}

export interface EnvStatusRequest {
  simulation_id: string;
}

export interface InterviewRequest {
  simulation_id: string;
  interviews: Array<{
    agent_id: string;
    prompt: string;
  }>;
}

export interface InterviewResponse {
  success: boolean;
  data: {
    results: Array<{
      agent_id: string;
      response: string;
      [key: string]: unknown;
    }>;
  };
  error?: string;
}

export interface HistorySimulation {
  simulation_id: string;
  project_id?: string;
  report_id?: string;
  files?: Array<{ filename: string }>;
  created_at?: string;
  simulation_requirement?: string;
  total_rounds?: number;
  current_round?: number;
  status?: string;
  [key: string]: unknown;
}

export interface SimulationHistoryResponse {
  success: boolean;
  data: HistorySimulation[] | { simulations: HistorySimulation[] };
  error?: string;
}

// ─── Report API Types ──────────────────────────────────────────────

export interface GenerateReportRequest {
  simulation_id: string;
  force_regenerate?: boolean;
}

export interface GenerateReportResponse {
  success: boolean;
  data: {
    report_id: string;
  };
  error?: string;
}

export interface ReportStatusResponse {
  success: boolean;
  data: {
    status: string;
    outline?: ReportOutline;
    sections?: Record<string, string>;
    progress?: number;
    [key: string]: unknown;
  };
  error?: string;
}

export interface ReportOutline {
  title: string;
  summary?: string;
  sections: Array<{
    title: string;
    description?: string;
  }>;
}

export interface AgentLogEntry {
  timestamp?: string;
  action?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LogResponse {
  success: boolean;
  data: {
    logs: AgentLogEntry[];
    next_line: number;
  };
  error?: string;
}

export interface Report {
  report_id: string;
  simulation_id?: string;
  title?: string;
  summary?: string;
  sections?: Array<{
    title: string;
    content: string;
  }>;
  created_at?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ReportResponse {
  success: boolean;
  data: Report;
  error?: string;
}

export interface ChatRequest {
  simulation_id: string;
  message: string;
  chat_history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface ChatResponse {
  success: boolean;
  data: {
    response: string;
    [key: string]: unknown;
  };
  error?: string;
}

// ─── Financial Simulation API Types (v2) ──────────────────────────

export interface MarketDataTick {
  symbol: string;
  timestamp: string; // ISO format or unix timestamp
  price: number;
  volume: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  bid: number;
  ask: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookDepth {
  symbol: string;
  timestamp: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface AgentPortfolio {
  agent_id: string;
  cash: number;
  positions: Record<string, number>; // e.g., { "NVDA": 100, "TSMC": -50 }
  total_value: number;
  timestamp: string;
}

export interface TradeExecution {
  trade_id: string;
  symbol: string;
  buyer_id: string;
  seller_id: string;
  price: number;
  quantity: number;
  timestamp: string;
}

export interface MarketDataResponse {
  success: boolean;
  data: {
    ticks: MarketDataTick[];
  };
  error?: string;
}

export interface OrderBookResponse {
  success: boolean;
  data: OrderBookDepth;
  error?: string;
}

export interface PortfolioResponse {
  success: boolean;
  data: AgentPortfolio;
  error?: string;
}

export interface TradeExecutionsResponse {
  success: boolean;
  data: {
    trades: TradeExecution[];
  };
  error?: string;
}

// ─── Generic API Response ──────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
}
