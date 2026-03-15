import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSimulation, closeSimulationEnv, stopSimulation, getEnvStatus } from '../api/simulation';
import { getProject, getGraphData } from '../api/graph';
import { GraphPanel } from '../components/graph-panel/graph-panel';
import { Step2EnvSetup } from '../components/wizard/step-2-env-setup';
import { formatLogTimestamp, type LogEntry } from '../components/shared/log-viewer';
import type { GraphNode, GraphEdge, Project } from '../api/types';
import { cx } from '../utils/cx';

type ViewMode = 'graph' | 'split' | 'workbench';

export function SimulationView() {
  const { simulationId } = useParams<{ simulationId: string }>();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[]; node_count: number; edge_count: number } | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [systemLogs, setSystemLogs] = useState<LogEntry[]>([]);
  const [currentStatus, setCurrentStatus] = useState('processing');
  const mountedRef = useRef(true);

  const addLog = useCallback((msg: string, type?: LogEntry['type']) => {
    setSystemLogs((prev) => {
      const next = [...prev, { timestamp: formatLogTimestamp(), message: msg, type }];
      return next.length > 100 ? next.slice(-100) : next;
    });
  }, []);

  const loadGraph = useCallback(async (graphId: string) => {
    setGraphLoading(true);
    try {
      const res = await getGraphData(graphId);
      if (res.success && mountedRef.current) {
        setGraphData(res.data as typeof graphData);
        addLog('Graph loaded.', 'success');
      }
    } catch { /* ignore */ }
    finally { setGraphLoading(false); }
  }, [addLog]);

  useEffect(() => {
    mountedRef.current = true;
    if (!simulationId) return;

    const load = async () => {
      addLog('Loading simulation data...');
      try {
        // Check and stop any running simulation
        try {
          const envRes = await getEnvStatus({ simulation_id: simulationId });
          if (envRes.success && (envRes.data as { status?: string }).status === 'running') {
            addLog('Closing running environment...');
            await closeSimulationEnv({ simulation_id: simulationId, timeout: 10 });
          }
        } catch { /* ignore */ }

        const simRes = await getSimulation(simulationId);
        if (simRes.success && mountedRef.current) {
          const projectId = simRes.data.project_id;
          if (projectId) {
            const projRes = await getProject(projectId);
            if (projRes.success && mountedRef.current) {
              setProjectData(projRes.data);
              const graphId = projRes.data.graph_id;
              if (graphId) await loadGraph(graphId);
            }
          }
        }
      } catch (e) {
        addLog(`Error: ${(e as Error).message}`, 'error');
      }
    };
    load();

    return () => { mountedRef.current = false; };
  }, [simulationId, addLog, loadGraph]);

  const handleNextStep = (params?: { maxRounds?: number }) => {
    const url = `/simulation/${simulationId}/start${params?.maxRounds ? `?maxRounds=${params.maxRounds}` : ''}`;
    navigate(url);
  };

  const handleGoBack = () => {
    if (projectData?.project_id) {
      navigate(`/process/${projectData.project_id}`);
    } else {
      navigate('/');
    }
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
          <span className="text-xs text-brand-500">Step 2/5 · Environment Setup</span>
          <span className={cx('h-2 w-2 rounded-full', currentStatus === 'completed' ? 'bg-green-500' : 'bg-brand-500')} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="h-full overflow-hidden transition-all duration-500" style={leftPanelStyle}>
          <GraphPanel graphData={graphData} loading={graphLoading} currentPhase={2}
            onRefresh={() => { if (projectData?.graph_id) loadGraph(projectData.graph_id as string); }}
            onToggleMaximize={() => setViewMode(viewMode === 'graph' ? 'split' : 'graph')} />
        </div>
        <div className="h-full overflow-hidden transition-all duration-500" style={rightPanelStyle}>
          <Step2EnvSetup
            simulationId={simulationId || ''}
            projectData={projectData}
            graphData={graphData}
            systemLogs={systemLogs}
            onGoBack={handleGoBack}
            onNextStep={handleNextStep}
            onAddLog={addLog}
            onUpdateStatus={setCurrentStatus}
          />
        </div>
      </div>
    </div>
  );
}
