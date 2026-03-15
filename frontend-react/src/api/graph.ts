import service, { requestWithRetry } from './client';
import type {
  GraphOntologyResponse,
  BuildGraphRequest,
  BuildGraphResponse,
  TaskStatusResponse,
  GraphDataResponse,
  ProjectResponse,
} from './types';

export function generateOntology(formData: FormData): Promise<GraphOntologyResponse> {
  return requestWithRetry(() =>
    service({
      url: '/api/graph/ontology/generate',
      method: 'post',
      data: formData,
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  );
}

export function buildGraph(data: BuildGraphRequest): Promise<BuildGraphResponse> {
  return requestWithRetry(() =>
    service({ url: '/api/graph/build', method: 'post', data })
  );
}

export function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  return service({ url: `/api/graph/task/${taskId}`, method: 'get' });
}

export function getGraphData(graphId: string): Promise<GraphDataResponse> {
  return service({ url: `/api/graph/data/${graphId}`, method: 'get' });
}

export function getProject(projectId: string): Promise<ProjectResponse> {
  return service({ url: `/api/graph/project/${projectId}`, method: 'get' });
}
