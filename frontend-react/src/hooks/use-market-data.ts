import { useState, useEffect } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { getMarketData } from '@/api/simulation';
import type { MarketDataTick } from '@/api/types';

export function useMarketData(simulationId: string, symbol: string) {
  const [ticks, setTicks] = useState<MarketDataTick[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch initial historical data from DuckDB via REST API
  useEffect(() => {
    let mounted = true;
    
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const response = await getMarketData(simulationId, symbol);
        if (mounted && response.success && response.data?.ticks) {
          setTicks(response.data.ticks);
        }
      } catch (err) {
        console.error("Failed to fetch historical market data:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchHistory();

    return () => {
      mounted = false;
    };
  }, [simulationId, symbol]);

  // 2. Connect to WebSocket for live updates
  // Construct the ws URL assuming the API is on the same host (e.g., proxied by Vite in dev)
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = import.meta.env.VITE_API_URL 
    ? new URL(import.meta.env.VITE_API_URL).host 
    : window.location.host;
    
  const wsUrl = `${wsProtocol}//${wsHost}/api/v2/ws/simulation/${simulationId}/market-data`;

  const { lastJsonMessage, readyState } = useWebSocket<MarketDataTick>(
    wsUrl,
    {
      shouldReconnect: () => true,
      reconnectAttempts: 10,
      reconnectInterval: 3000,
      // Only connect once we have the initial history loaded
      filter: () => !isLoading 
    }
  );

  // 3. Append new ticks as they arrive over the websocket
  useEffect(() => {
    if (lastJsonMessage && lastJsonMessage.symbol === symbol) {
      setTicks((prev) => {
        // Prevent duplicate timestamps if WS pushes something we already fetched
        const exists = prev.some(t => t.timestamp === lastJsonMessage.timestamp);
        if (exists) return prev;
        
        return [...prev, lastJsonMessage];
      });
    }
  }, [lastJsonMessage, symbol]);

  return {
    ticks,
    isLoading,
    isConnected: readyState === ReadyState.OPEN
  };
}