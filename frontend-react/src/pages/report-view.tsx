import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReport } from '../api/report';
import { getSimulation } from '../api/simulation';
import { getProject, getGraphData } from '../api/graph';
import { GraphPanel } from '../components/graph-panel/graph-panel';
import { Step4Report } from '../components/wizard/step-4-report';
import { formatLogTimestamp, type LogEntry } from '../components/shared/log-viewer';
import type { GraphNode, GraphEdge } from '../api/types';
import { cx } from '../utils/cx';

type ViewMode = 'graph' | 'split' | 'workbench';

export function ReportView() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>('workbench');
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[]; node_count: number; edge_count: number } | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [simulationId, setSimulationId] = useState('');
  const [systemLogs, setSystemLogs] = useState<LogEntry[]>([]);
  const [currentStatus, setCurrentStatus] = useState('processing');
  const mountedRef = useRef(true);

  const addLog = useCallback((msg: string, type?: LogEntry['type']) => {
    setSystemLogs((prev) => {
      const next = [...prev, { timestamp: formatLogTimestamp(), message: msg, type }];
      return next.length > 200 ? next.slice(-200) : next;
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!reportId) return;

    const load = async () => {
      addLog('Loading report data...');
      try {
        const reportRes = await getReport(reportId);
        if (reportRes.success) {
          const simId = reportRes.data.simulation_id;
          if (simId) {
            setSimulationId(simId);
            const simRes = await getSimulation(simId);
            if (simRes.success) {
              const projectId = simRes.data.project_id;
              if (projectId) {
                const projRes = await getProject(projectId);
                if (projRes.success) {
                  const graphId = projRes.data.graph_id;
                  if (graphId) {
                    setGraphLoading(true);
                    const gRes = await getGraphData(graphId);
                    if (gRes.success && mountedRef.current) setGraphData(gRes.data as typeof graphData);
                    setGraphLoading(false);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        addLog(`Error: ${(e as Error).message}`, 'error');
      }
    };
    load();

    return () => { mountedRef.current = false; };
  }, [reportId, addLog]);

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
          <span className="text-xs text-brand-500">Step 4/5 · Report</span>
          <span className={cx('h-2 w-2 rounded-full', currentStatus === 'completed' ? 'bg-green-500' : 'bg-brand-500')} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="h-full overflow-hidden transition-all duration-500" style={leftPanelStyle}>
          <GraphPanel graphData={graphData} loading={graphLoading} currentPhase={4}
            onToggleMaximize={() => setViewMode(viewMode === 'graph' ? 'split' : 'graph')} />
        </div>
        <div className="h-full overflow-hidden transition-all duration-500" style={rightPanelStyle}>
          <Step4Report
            reportId={reportId || ''}
            simulationId={simulationId}
            systemLogs={systemLogs}
            onAddLog={addLog}
            onUpdateStatus={setCurrentStatus}
          />
        </div>
      </div>
    </div>
  );
}
