import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { MarketDataTick } from '@/api/types';

interface LightweightChartProps {
  data: MarketDataTick[];
  containerClassName?: string;
}

export const LightweightChart: React.FC<LightweightChartProps> = ({ data, containerClassName }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize the chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f3fa' },
        horzLines: { color: '#f0f3fa' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });
    chartRef.current = chart;

    // Create the Candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    seriesRef.current = candlestickSeries;

    // Cleanup on unmount
    return () => {
      chart.remove();
    };
  }, []);

  // Update data when props change
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;

    // Map our MarketDataTick to LightweightCharts CandlestickData
    // Note: LightweightCharts requires time to be in standard unix timestamp (seconds) or YYYY-MM-DD format
    const formattedData = data.map((tick) => {
      // Very naive mapping for now - assumes we have ohlc, otherwise defaults to flat price
      const price = tick.price;
      return {
        time: Math.floor(new Date(tick.timestamp).getTime() / 1000) as any, // Cast to any to bypass strict type checking for the exact time shape right now
        open: tick.open ?? price,
        high: tick.high ?? price,
        low: tick.low ?? price,
        close: tick.close ?? price,
      };
    });

    // Ensure data is sorted by time ascending and has unique times
    const uniqueData = Array.from(new Map(formattedData.map(item => [item.time, item])).values());
    uniqueData.sort((a, b) => a.time - b.time);

    seriesRef.current.setData(uniqueData);
  }, [data]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <div ref={chartContainerRef} className={containerClassName} style={{ width: '100%' }} />;
};