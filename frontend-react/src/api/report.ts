import service, { requestWithRetry } from './client';
import type {
  GenerateReportRequest,
  GenerateReportResponse,
  ReportStatusResponse,
  LogResponse,
  ReportResponse,
  ChatRequest,
  ChatResponse,
} from './types';

export const generateReport = (data: GenerateReportRequest): Promise<GenerateReportResponse> => {
  return requestWithRetry(() => service.post('/api/report/generate', data));
};

export const getReportStatus = (reportId: string): Promise<ReportStatusResponse> => {
  return service.get('/api/report/generate/status', { params: { report_id: reportId } });
};

export const getAgentLog = (reportId: string, fromLine: number = 0): Promise<LogResponse> => {
  return service.get(`/api/report/${reportId}/agent-log`, { params: { from_line: fromLine } });
};

export const getConsoleLog = (reportId: string, fromLine: number = 0): Promise<LogResponse> => {
  return service.get(`/api/report/${reportId}/console-log`, { params: { from_line: fromLine } });
};

export const getReport = (reportId: string): Promise<ReportResponse> => {
  return service.get(`/api/report/${reportId}`);
};

export const chatWithReport = (data: ChatRequest): Promise<ChatResponse> => {
  return requestWithRetry(() => service.post('/api/report/chat', data));
};
