import { useCallback } from 'react';
import { getTaskStatus } from '@/api/graph';
import { usePolling } from './use-polling';
import type { TaskStatusResponse } from '@/api/types';

export interface UseTaskStatusOptions {
  onCompleted?: (result: unknown) => void;
  onFailed?: (error: string) => void;
}

export function useTaskStatus(taskId: string | null, options: UseTaskStatusOptions = {}) {
  const { onCompleted, onFailed } = options;

  const fetchStatus = useCallback(() => {
    if (!taskId) return Promise.reject(new Error('No task ID'));
    return getTaskStatus(taskId);
  }, [taskId]);

  const { data, error, isPolling, stop } = usePolling<TaskStatusResponse>(fetchStatus, 2000, {
    enabled: !!taskId,
    stopWhen: (res) => {
      const status = res.data?.status;
      return status === 'completed' || status === 'failed';
    },
    onSuccess: (res) => {
      const status = res.data?.status;
      if (status === 'completed') {
        onCompleted?.(res.data?.result);
      } else if (status === 'failed') {
        onFailed?.(res.data?.error || 'Task failed');
      }
    },
  });

  return {
    status: data?.data?.status ?? null,
    progress: data?.data?.progress ?? null,
    message: data?.data?.message ?? null,
    result: data?.data?.result ?? null,
    error,
    isPolling,
    stop,
  };
}
