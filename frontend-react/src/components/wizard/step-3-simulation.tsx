import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  startSimulation,
  stopSimulation,
  getRunStatus,
} from '@/api/simulation';
import { generateReport } from '@/api/report';
import type { LogEntry } from '@/components/shared/log-viewer';
import { cx } from '@/utils/cx';
import { TradingTerminal } from '../trading-terminal/TradingTerminal';
import { CheckCircleIcon, PlayIcon, StopIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RunStatusData {
  runner_status?: string;
  current_round?: number;
  total_rounds?: number;
  total_actions_count?: number;
  [key: string]: unknown;
}

interface Step3SimulationProps {
  simulationId: string;
  maxRounds: number | null;
  minutesPerRound?: number;
  projectData?: any;
  graphData?: any;
  systemLogs: LogEntry[];
  onGoBack: () => void;
  onNextStep?: () => void;
  onAddLog: (msg: string) => void;
  onUpdateStatus: (status: string) => void;
}

export function Step3Simulation({
  simulationId,
  maxRounds,
  minutesPerRound,
  projectData,
  graphData,
  systemLogs,
  onGoBack,
  onNextStep,
  onAddLog,
  onUpdateStatus,
}: Step3SimulationProps) {
  const navigate = useNavigate();

  // Polling State
  const [runStatus, setRunStatus] = useState<RunStatusData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  
  // Track extracted symbols from the Knowledge Graph to feed the Trading Terminal
  const [activeSymbols, setActiveSymbols] = useState<string[]>(['NVDA', 'TSMC']); // Default fallbacks

  // On mount, look at the graph data to figure out what symbols we are trading
  useEffect(() => {
    if (graphData?.nodes) {
      const extractedAssets = graphData.nodes
        .filter((n: any) => n.label === 'Equity' || n.label === 'Asset')
        .map((n: any) => n.properties?.ticker || n.id)
        .filter(Boolean);
        
      if (extractedAssets.length > 0) {
        // Take up to top 5 assets
        setActiveSymbols(extractedAssets.slice(0, 5));
      }
    }
  }, [graphData]);

  // Handle Starting the simulation
  const handleStart = async () => {
    onAddLog('Requesting Simulation Start...');
    setIsRunning(true);
    onUpdateStatus('Starting execution engine...');

    try {
      // V1 API Contract maintained under the hood
      await startSimulation({
        simulation_id: simulationId,
        max_rounds: maxRounds ?? 10
      });
      onAddLog('ABIDES Engine initialized successfully.');
      onUpdateStatus('Running');
    } catch (err: any) {
      onAddLog(`Failed to start simulation: ${err?.message || String(err)}`);
      setIsRunning(false);
      onUpdateStatus('Error');
    }
  };

  // Handle Stopping
  const handleStop = async () => {
    onAddLog('Requesting Simulation Stop...');
    try {
      await stopSimulation({ simulation_id: simulationId });
      onAddLog('Simulation stopped by user.');
      setIsRunning(false);
      onUpdateStatus('Stopped');
    } catch (err: any) {
      onAddLog(`Failed to stop: ${err?.message || String(err)}`);
    }
  };

  // Status Polling Loop
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(async () => {
      try {
        const res = await getRunStatus(simulationId);
        if (res.success && res.data) {
          setRunStatus(res.data);
          
          if (res.data.runner_status === 'completed' || res.data.runner_status === 'error') {
            setIsRunning(false);
            setIsFinished(res.data.runner_status === 'completed');
            onUpdateStatus(res.data.runner_status === 'completed' ? 'Completed' : 'Error');
            onAddLog(`Simulation finished with status: ${res.data.runner_status}`);
          }
        }
      } catch (err) {
        console.error('Failed to poll run status', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [simulationId, isRunning, onAddLog, onUpdateStatus]);

  // Generate Report
  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    onAddLog('Initiating ReACT agents for Report Generation...');
    try {
      const res = await generateReport({ simulation_id: simulationId, force_regenerate: false });
      if (res.success && res.data?.report_id) {
        onAddLog(`Report generation started. Report ID: ${res.data.report_id}`);
        setReportId(res.data.report_id);
        
        // Let the wrapper know we are ready to move on
        if (onNextStep) {
          onNextStep();
        }
      }
    } catch (err: any) {
      onAddLog(`Failed to start report generation: ${err?.message || String(err)}`);
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative animate-fade-in">
      {/* HEADER */}
      <div className="flex-none bg-white border-b border-brand-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div>
          <h2 className="text-xl font-semibold text-brand-900 flex items-center">
            Trading Terminal Execution
            {isRunning && (
              <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-800 animate-pulse">
                Running Step {runStatus?.current_round || 0} / {runStatus?.total_rounds || '?'}
              </span>
            )}
            {isFinished && (
              <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <CheckCircleIcon className="w-4 h-4 mr-1" />
                Completed
              </span>
            )}
          </h2>
          <p className="text-sm text-brand-500 mt-1">
            LLM Agents are executing discretionary trades against the ABIDES-Markets discrete event simulator.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onGoBack}
            disabled={isRunning}
            className="px-4 py-2 text-sm font-medium text-brand-600 bg-white border border-brand-300 rounded-lg hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 transition-colors"
          >
            Back
          </button>
          
          {!isRunning && !isFinished && (
            <button
              onClick={handleStart}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-colors shadow-sm flex items-center"
            >
              <PlayIcon className="w-4 h-4 mr-2" />
              Start Engine
            </button>
          )}

          {isRunning && (
            <button
              onClick={handleStop}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors flex items-center"
            >
              <StopIcon className="w-4 h-4 mr-2" />
              Halt Engine
            </button>
          )}

          {isFinished && (
            <button
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-colors shadow-sm flex items-center disabled:opacity-50"
            >
              {isGeneratingReport ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Generating Analysis...
                </>
              ) : (
                <>
                  <DocumentTextIcon className="w-4 h-4 mr-2" />
                  Generate Post-Mortem Report
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 p-6 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 min-h-0 w-full rounded-xl shadow-lg border border-brand-200 overflow-hidden bg-white">
          <TradingTerminal simulationId={simulationId} symbols={activeSymbols} />
        </div>
        
        {/* Info Footer */}
        <div className="flex-none mt-4 text-xs text-brand-400 text-center">
          Simulation ID: <span className="font-mono">{simulationId}</span> | 
          Total Market Orders Processed: {runStatus?.total_actions_count || 0}
        </div>
      </div>
    </div>
  );
}