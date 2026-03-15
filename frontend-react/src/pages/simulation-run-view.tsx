import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getSimulation, getSimulationConfig } from '../api/simulation';
import { getProject, getGraphData } from '../api/graph';
import { GraphPanel } from '../components/graph-panel/graph-panel';
import { Step3Simulation } from '../components/wizard/step-3-simulation';
import { formatLogTimestamp, type LogEntry } from '../components/shared/log-viewer';
import type { GraphNode, GraphEdge } from '../api/types';
import { cx } from '../utils/cx';

type ViewMode = 'graph' | 'split' | 'workbench';

export function SimulationRunView() {
  const { simulationId } = useParams<{ simulationId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const maxRoundsParam = searchParams.get('maxRounds');
  const maxRounds = maxRoundsParam ? Number(maxRoundsParam) : null;

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[]; node_count: number; edge_count: number } | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [minutesPerRound, setMinutesPerRound] = useState(30);
  const [systemLogs, setSystemLogs] = useState<LogEntry[]>([]);
  const [currentStatus, setCurrentStatus] = useState('processing');

  const graphRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graphIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const addLog = useCallback((msg: string, type?: LogEntry['type']) => {
    setSystemLogs((prev) => {
      const next = [...prev, { timestamp: formatLogTimestamp(), message: msg, type }];
      return next.length > 200 ? next.slice(-200) : next;
    });
  }, []);

  const loadGraph = useCallback(async (graphId: string) => {
    try {
      const res = await getGraphData(graphId);
      if (res.success && mountedRef.current) {
        setGraphData(res.data as typeof graphData);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!simulationId) return;

    const load = async () => {
      addLog('Loading simulation data...');
      try {
        const simRes = await getSimulation(simulationId);
        if (simRes.success) {
          // Get config for minutes_per_round
          try {
            const configRes = await getSimulationConfig(simulationId);
            if (configRes.success && configRes.data?.time_config?.minutes_per_round) {
              setMinutesPerRound(configRes.data.time_config.minutes_per_round);
            }
          } catch { /* ignore */ }

          const projectId = simRes.data.project_id;
          if (projectId) {
            const projRes = await getProject(projectId);
            if (projRes.success) {
              const graphId = projRes.data.graph_id;
              if (graphId) {
                graphIdRef.current = graphId;
                setGraphLoading(true);
                await loadGraph(graphId);
                setGraphLoading(false);
              }
            }
          }
        }
      } catch (e) {
        addLog(`Error: ${(e as Error).message}`, 'error');
      }
    };
    load();

    return () => {
      mountedRef.current = false;
      if (graphRefreshTimerRef.current) clearInterval(graphRefreshTimerRef.current);
    };
  }, [simulationId, addLog, loadGraph]);

  // Graph refresh during simulation (30s)
  useEffect(() => {
    if (isSimulating && graphIdRef.current) {
      graphRefreshTimerRef.current = setInterval(() => {
        if (graphIdRef.current) loadGraph(graphIdRef.current);
      }, 30000);
    } else {
      if (graphRefreshTimerRef.current) { clearInterval(graphRefreshTimerRef.current); graphRefreshTimerRef.current = null; }
    }
    return () => {
      if (graphRefreshTimerRef.current) clearInterval(graphRefreshTimerRef.current);
    };
  }, [isSimulating, loadGraph]);

  const handleUpdateStatus = (status: string) => {
    setCurrentStatus(status);
    setIsSimulating(status === 'running');
  };

  const leftPanelStyle = viewMode === 'graph' ? { width: '100%', opacity: 1 } : viewMode === 'workbench' ? { width: '0%', opacity: 0 } : { width: '50%', opacity: 1 };
  const rightPanelStyle = viewMode === 'workbench' ? { width: '100%', opacity: 1 } : viewMode === 'graph' ? { width: '0%', opacity: 0 } : { width: '50%', opacity: 1 };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-[60px] items-center justify-between border-b border-brand-100 bg-white px-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80"><img src="/assets/nclouds-icon.svg" alt="nClouds" className="h-6 w-6" /><span className="text-lg font-bold text-brand-950">nVision</span></button>
        <div className="flex items-center gap-1 rounded-lg bg-brand-50 p-0.5">
          {(['graph', 'split', 'workbench'] as ViewMode[]).map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={cx('rounded-md px-3 py-1 text-xs font-medium capitalize', viewMode === mode ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-500')}>
              {mode}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-brand-500">Step 3/5 · Simulation</span>
          <span className={cx('h-2 w-2 rounded-full', currentStatus === 'completed' ? 'bg-green-500' : isSimulating ? 'bg-brand-500 animate-pulse' : 'bg-brand-200')} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="h-full overflow-hidden transition-all duration-500" style={leftPanelStyle}>
          <GraphPanel graphData={graphData} loading={graphLoading} currentPhase={3} isSimulating={isSimulating}
            onRefresh={() => { if (graphIdRef.current) loadGraph(graphIdRef.current); }}
            onToggleMaximize={() => setViewMode(viewMode === 'graph' ? 'split' : 'graph')} />
        </div>
        <div className="h-full overflow-hidden transition-all duration-500" style={rightPanelStyle}>
          <Step3Simulation
            simulationId={simulationId || ''}
            maxRounds={maxRounds}
            minutesPerRound={minutesPerRound}
            systemLogs={systemLogs}
            onGoBack={() => navigate(`/simulation/${simulationId}`)}
            onAddLog={addLog}
            onUpdateStatus={handleUpdateStatus}
          />
        </div>
      </div>
    </div>
  );
}
