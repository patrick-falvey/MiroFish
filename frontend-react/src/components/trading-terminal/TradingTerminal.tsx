import React, { useState } from 'react';
import { LightweightChart } from './LightweightChart';
import { useMarketData } from '@/hooks/use-market-data';

interface TradingTerminalProps {
  simulationId: string;
  symbols: string[]; // e.g. ["NVDA", "TSMC"]
}

export const TradingTerminal: React.FC<TradingTerminalProps> = ({ simulationId, symbols }) => {
  const [activeSymbol, setActiveSymbol] = useState(symbols[0] || "UNKNOWN");
  
  const { ticks, isLoading, isConnected } = useMarketData(simulationId, activeSymbol);

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-lg shadow-sm border border-brand-200 overflow-hidden">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-200 bg-brand-50">
        <div className="flex space-x-2">
          {symbols.map(sym => (
            <button
              key={sym}
              onClick={() => setActiveSymbol(sym)}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                activeSymbol === sym 
                  ? 'bg-brand-500 text-white' 
                  : 'bg-white text-brand-600 border border-brand-200 hover:bg-brand-100'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
        
        <div className="flex items-center space-x-3 text-sm">
          {isConnected ? (
            <span className="flex items-center text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="flex items-center text-amber-500">
              <span className="w-2 h-2 rounded-full bg-amber-500 mr-2" />
              Reconnecting...
            </span>
          )}
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-grow relative bg-white">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin mb-4" />
              <p className="text-brand-600 font-medium">Loading Market Data...</p>
            </div>
          </div>
        ) : ticks.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center z-10 text-brand-400">
            No market data available yet. Waiting for simulation ticks.
          </div>
        ) : null}
        
        <div className="h-full w-full p-2">
          <LightweightChart data={ticks} containerClassName="h-full w-full" />
        </div>
      </div>
      
      {/* Ticker Tape Footer */}
      <div className="h-8 border-t border-brand-200 bg-brand-50 flex items-center px-4 overflow-hidden">
        {ticks.length > 0 && (
          <div className="text-xs font-mono text-brand-700 whitespace-nowrap overflow-hidden text-ellipsis">
            Latest: {ticks[ticks.length - 1].timestamp} | 
            Price: ${ticks[ticks.length - 1].price.toFixed(2)} | 
            Vol: {ticks[ticks.length - 1].volume} | 
            Spread: ${(ticks[ticks.length - 1].ask - ticks[ticks.length - 1].bid).toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
};