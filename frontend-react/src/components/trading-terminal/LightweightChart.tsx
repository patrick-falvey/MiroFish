import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickSeries, CandlestickData, Time } from 'lightweight-charts';
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

    // Create the Candlestick series using the v5 addSeries API
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
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
    const formattedData: CandlestickData[] = data.map((tick) => {
      const price = tick.price;
      const dateObj = new Date(tick.timestamp);
      let unixTime = Math.floor(dateObj.getTime() / 1000);
      
      // Fallback if timestamp is invalid
      if (isNaN(unixTime)) {
        unixTime = Math.floor(Date.now() / 1000);
      }

      return {
        time: unixTime as Time,
        open: tick.open ?? price,
        high: tick.high ?? price,
        low: tick.low ?? price,
        close: tick.close ?? price,
      };
    });

    // Filter out invalid entries and handle unique times
    const uniqueData = Array.from(new Map(formattedData.map(item => [item.time, item])).values());
    uniqueData.sort((a, b) => (a.time as number) - (b.time as number));

    if (uniqueData.length > 0) {
      seriesRef.current.setData(uniqueData);
    }
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