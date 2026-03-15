import { useCallback, useEffect, useRef, useState } from 'react';

export interface UsePollingOptions<T> {
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  stopWhen?: (data: T) => boolean;
}

export interface UsePollingReturn<T> {
  data: T | null;
  error: Error | null;
  isPolling: boolean;
  stop: () => void;
  start: () => void;
}

export function usePolling<T>(
  fetchFn: () => Promise<T>,
  intervalMs: number,
  options: UsePollingOptions<T> = {}
): UsePollingReturn<T> {
  const { enabled = true, onSuccess, onError, stopWhen } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);
  const fetchFnRef = useRef(fetchFn);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const stopWhenRef = useRef(stopWhen);

  fetchFnRef.current = fetchFn;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  stopWhenRef.current = stopWhen;

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    setIsPolling(false);
    clearTimer();
  }, [clearTimer]);

  const tick = useCallback(async () => {
    if (stoppedRef.current) return;
    try {
      const result = await fetchFnRef.current();
      if (stoppedRef.current) return;
      setData(result);
      setError(null);
      onSuccessRef.current?.(result);

      if (stopWhenRef.current?.(result)) {
        stop();
      }
    } catch (err) {
      if (stoppedRef.current) return;
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onErrorRef.current?.(e);
    }
  }, [stop]);

  const start = useCallback(() => {
    stoppedRef.current = false;
    setIsPolling(true);
    clearTimer();
    tick();
    intervalRef.current = setInterval(tick, intervalMs);
  }, [tick, intervalMs, clearTimer]);

  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    return () => {
      clearTimer();
      stoppedRef.current = true;
    };
  }, [enabled, start, stop, clearTimer]);

  return { data, error, isPolling, stop, start };
}
