import service, { requestWithRetry } from './client';
import type {
  CreateSimulationRequest,
  CreateSimulationResponse,
  PrepareSimulationRequest,
  PrepareSimulationResponse,
  PrepareStatusRequest,
  PrepareStatusResponse,
  SimulationResponse,
  SimulationProfilesResponse,
  SimulationConfigResponse,
  SimulationListResponse,
  StartSimulationRequest,
  StopSimulationRequest,
  RunStatusResponse,
  RunStatusDetailResponse,
  SimulationPostsResponse,
  SimulationTimelineResponse,
  AgentStatsResponse,
  SimulationActionsResponse,
  CloseEnvRequest,
  EnvStatusRequest,
  InterviewRequest,
  InterviewResponse,
  SimulationHistoryResponse,
  ApiResponse,
  MarketDataResponse,
  OrderBookResponse,
  PortfolioResponse,
  TradeExecutionsResponse,
} from './types';

export const createSimulation = (data: CreateSimulationRequest): Promise<CreateSimulationResponse> => {
  return requestWithRetry(() => service.post('/api/simulation/create', data));
};

export const prepareSimulation = (data: PrepareSimulationRequest): Promise<PrepareSimulationResponse> => {
  return requestWithRetry(() => service.post('/api/simulation/prepare', data));
};

export const getPrepareStatus = (data: PrepareStatusRequest): Promise<PrepareStatusResponse> => {
  return service.post('/api/simulation/prepare/status', data);
};

export const getSimulation = (simulationId: string): Promise<SimulationResponse> => {
  return service.get(`/api/simulation/${simulationId}`);
};

export const getSimulationProfiles = (
  simulationId: string,
  platform: 'reddit' | 'twitter' = 'reddit'
): Promise<SimulationProfilesResponse> => {
  return service.get(`/api/simulation/${simulationId}/profiles`, { params: { platform } });
};

export const getSimulationProfilesRealtime = (
  simulationId: string,
  platform: 'reddit' | 'twitter' = 'reddit'
): Promise<SimulationProfilesResponse> => {
  return service.get(`/api/simulation/${simulationId}/profiles/realtime`, { params: { platform } });
};

export const getSimulationConfig = (simulationId: string): Promise<SimulationConfigResponse> => {
  return service.get(`/api/simulation/${simulationId}/config`);
};

export const getSimulationConfigRealtime = (simulationId: string): Promise<SimulationConfigResponse> => {
  return service.get(`/api/simulation/${simulationId}/config/realtime`);
};

export const listSimulations = (projectId?: string): Promise<SimulationListResponse> => {
  const params = projectId ? { project_id: projectId } : {};
  return service.get('/api/simulation/list', { params });
};

export const startSimulation = (data: StartSimulationRequest): Promise<ApiResponse> => {
  return requestWithRetry(() => service.post('/api/simulation/start', data));
};

export const stopSimulation = (data: StopSimulationRequest): Promise<ApiResponse> => {
  return service.post('/api/simulation/stop', data);
};

export const getRunStatus = (simulationId: string): Promise<RunStatusResponse> => {
  return service.get(`/api/simulation/${simulationId}/run-status`);
};

export const getRunStatusDetail = (simulationId: string, offset: number = 0): Promise<RunStatusDetailResponse> => {
  return service.get(`/api/simulation/${simulationId}/run-status/detail`, {
    params: { offset },
  });
};

export const getSimulationPosts = (
  simulationId: string,
  platform: string = 'reddit',
  limit: number = 50,
  offset: number = 0
): Promise<SimulationPostsResponse> => {
  return service.get(`/api/simulation/${simulationId}/posts`, {
    params: { platform, limit, offset },
  });
};

export const getSimulationTimeline = (
  simulationId: string,
  startRound: number = 0,
  endRound: number | null = null
): Promise<SimulationTimelineResponse> => {
  const params: Record<string, number> = { start_round: startRound };
  if (endRound !== null) {
    params.end_round = endRound;
  }
  return service.get(`/api/simulation/${simulationId}/timeline`, { params });
};

export const getAgentStats = (simulationId: string): Promise<AgentStatsResponse> => {
  return service.get(`/api/simulation/${simulationId}/agent-stats`);
};

export const getSimulationActions = (
  simulationId: string,
  params: { limit?: number; offset?: number; platform?: string; agent_id?: string; round_num?: number } = {}
): Promise<SimulationActionsResponse> => {
  return service.get(`/api/simulation/${simulationId}/actions`, { params });
};

export const closeSimulationEnv = (data: CloseEnvRequest): Promise<ApiResponse> => {
  return service.post('/api/simulation/close-env', data);
};

export const getEnvStatus = (data: EnvStatusRequest): Promise<ApiResponse> => {
  return service.post('/api/simulation/env-status', data);
};

export const interviewAgents = (data: InterviewRequest): Promise<InterviewResponse> => {
  return requestWithRetry(() => service.post('/api/simulation/interview/batch', data));
};

export const getSimulationHistory = (limit: number = 20): Promise<SimulationHistoryResponse> => {
  return service.get('/api/simulation/history', { params: { limit } });
};

// ─── Financial Simulation API Endpoints (v2) ─────────────────────────

export const getMarketData = (simulationId: string, symbol: string): Promise<MarketDataResponse> => {
  return service.get(`/api/v2/simulation/${simulationId}/market-data`, { params: { symbol } });
};

export const getOrderBook = (simulationId: string, symbol: string): Promise<OrderBookResponse> => {
  return service.get(`/api/v2/simulation/${simulationId}/order-book`, { params: { symbol } });
};

export const getAgentPortfolio = (simulationId: string, agentId: string): Promise<PortfolioResponse> => {
  return service.get(`/api/v2/simulation/${simulationId}/portfolio/${agentId}`);
};

export const getTradeExecutions = (simulationId: string, symbol: string, limit: number = 50): Promise<TradeExecutionsResponse> => {
  return service.get(`/api/v2/simulation/${simulationId}/trades`, { params: { symbol, limit } });
};
