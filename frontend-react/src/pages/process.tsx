import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { generateOntology, buildGraph, getTaskStatus, getGraphData, getProject } from '../api/graph';
import { usePendingUpload } from '../stores/pending-upload';
import { GraphPanel } from '../components/graph-panel/graph-panel';
import { Step1GraphBuild } from '../components/wizard/step-1-graph-build';
import { formatLogTimestamp, type LogEntry } from '../components/shared/log-viewer';
import type { GraphNode, GraphEdge, Project } from '../api/types';
import { cx } from '../utils/cx';

type ViewMode = 'graph' | 'split' | 'workbench';

type ExtendedProject = Project & {
  graph_build_task_id?: string;
  ontology?: Project['ontology'] & {
    entity_types?: Array<{ name: string; description?: string }>;
    edge_types?: Array<{ name: string; description?: string }>;
    relation_types?: Array<{ name: string; description?: string }>;
  };
};

export function Process() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { files, simulationRequirement, isPending, clearPendingUpload } = usePendingUpload();

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [currentStep, setCurrentStep] = useState(1);
  const [currentProjectId, setCurrentProjectId] = useState(routeProjectId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [projectData, setProjectData] = useState<ExtendedProject | null>(null);
  const [graphData, setGraphData] = useState<{
    nodes: GraphNode[]; edges: GraphEdge[]; node_count: number; edge_count: number;
  } | null>(null);
  const [currentPhase, setCurrentPhase] = useState(-1);
  const [ontologyProgress, setOntologyProgress] = useState<{ message: string } | null>(null);
  const [buildProgress, setBuildProgress] = useState<{ progress: number; message?: string } | null>(null);
  const [systemLogs, setSystemLogs] = useState<LogEntry[]>([]);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graphPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const addLog = useCallback((msg: string, type?: LogEntry['type']) => {
    setSystemLogs((prev) => {
      const next = [...prev, { timestamp: formatLogTimestamp(), message: msg, type }];
      return next.length > 100 ? next.slice(-100) : next;
    });
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
  }, []);

  const stopGraphPolling = useCallback(() => {
    if (graphPollTimerRef.current) { clearInterval(graphPollTimerRef.current); graphPollTimerRef.current = null; }
  }, []);

  const loadGraph = useCallback(async (graphId: string) => {
    addLog(`Loading graph data: ${graphId}`);
    try {
      const res = await getGraphData(graphId);
      if (res.success && mountedRef.current) {
        setGraphData(res.data as { nodes: GraphNode[]; edges: GraphEdge[]; node_count: number; edge_count: number });
        addLog('Graph data loaded.', 'success');
      }
    } catch (e) {
      addLog(`Failed to load graph: ${(e as Error).message}`, 'error');
    }
  }, [addLog]);

  const startPollingTask = useCallback((taskId: string, projId: string) => {
    const poll = async () => {
      try {
        const res = await getTaskStatus(taskId);
        if (!res.success || !mountedRef.current) return;
        const task = res.data;
        if (task.message) addLog(task.message);
        setBuildProgress({ progress: task.progress || 0, message: task.message });
        if (task.status === 'completed') {
          addLog('Graph build completed.', 'success');
          stopPolling();
          stopGraphPolling();
          setCurrentPhase(2);
          const projRes = await getProject(projId);
          if (projRes.success && projRes.data.graph_id) {
            setProjectData(projRes.data as ExtendedProject);
            await loadGraph(projRes.data.graph_id);
          }
        } else if (task.status === 'failed') {
          stopPolling();
          setError(task.error || 'Build failed');
          addLog(`Build failed: ${task.error}`, 'error');
        }
      } catch { /* ignore */ }
    };
    poll();
    pollTimerRef.current = setInterval(poll, 2000);
  }, [addLog, stopPolling, stopGraphPolling, loadGraph]);

  const startGraphPolling = useCallback((projId: string) => {
    addLog('Started graph data polling...');
    const fetch = async () => {
      try {
        const projRes = await getProject(projId);
        if (projRes.success && projRes.data.graph_id) {
          const gRes = await getGraphData(projRes.data.graph_id);
          if (gRes.success && mountedRef.current) {
            setGraphData(gRes.data as { nodes: GraphNode[]; edges: GraphEdge[]; node_count: number; edge_count: number });
          }
        }
      } catch { /* ignore */ }
    };
    fetch();
    graphPollTimerRef.current = setInterval(fetch, 10000);
  }, [addLog]);

  // Initialize on mount
  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      if (routeProjectId === 'new') {
        // New project flow
        if (!isPending || files.length === 0) {
          setError('No pending files found.');
          return;
        }
        setLoading(true);
        setCurrentPhase(0);
        setOntologyProgress({ message: 'Uploading and analyzing docs...' });
        addLog('Starting ontology generation...');
        try {
          const formData = new FormData();
          files.forEach((f) => formData.append('files', f));
          formData.append('simulation_requirement', simulationRequirement);
          const res = await generateOntology(formData);
          if (res.success && mountedRef.current) {
            clearPendingUpload();
            const pid = res.data.project_id;
            setCurrentProjectId(pid);
            setProjectData(res.data as ExtendedProject);
            navigate(`/process/${pid}`, { replace: true });
            setOntologyProgress(null);
            addLog(`Ontology generated: ${pid}`, 'success');
            // Auto start build
            setCurrentPhase(1);
            setBuildProgress({ progress: 0, message: 'Starting build...' });
            const buildRes = await buildGraph({ project_id: pid });
            if (buildRes.success) {
              addLog(`Build task: ${buildRes.data.task_id}`);
              startGraphPolling(pid);
              startPollingTask(buildRes.data.task_id, pid);
            }
          }
        } catch (e) {
          setError((e as Error).message);
          addLog(`Error: ${(e as Error).message}`, 'error');
        } finally {
          setLoading(false);
        }
      } else if (routeProjectId) {
        // Existing project
        setLoading(true);
        addLog(`Loading project ${routeProjectId}...`);
        try {
          const res = await getProject(routeProjectId);
          if (res.success && mountedRef.current) {
            const proj = res.data as ExtendedProject;
            setProjectData(proj);
            const status = proj.status;
            addLog(`Project loaded. Status: ${status}`);
            if (status === 'graph_completed' && proj.graph_id) {
              setCurrentPhase(2);
              await loadGraph(proj.graph_id);
            } else if (status === 'graph_building' && proj.graph_build_task_id) {
              setCurrentPhase(1);
              startPollingTask(proj.graph_build_task_id, routeProjectId);
              startGraphPolling(routeProjectId);
            } else {
              setCurrentPhase(0);
            }
          }
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (graphPollTimerRef.current) clearInterval(graphPollTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const leftPanelStyle = viewMode === 'graph'
    ? { width: '100%', opacity: 1 }
    : viewMode === 'workbench'
    ? { width: '0%', opacity: 0 }
    : { width: '50%', opacity: 1 };

  const rightPanelStyle = viewMode === 'workbench'
    ? { width: '100%', opacity: 1 }
    : viewMode === 'graph'
    ? { width: '0%', opacity: 0 }
    : { width: '50%', opacity: 1 };

  const statusText = error ? 'Error' : currentPhase >= 2 ? 'Ready' : currentPhase === 1 ? 'Building Graph' : currentPhase === 0 ? 'Generating Ontology' : 'Initializing';
  const statusClass = error ? 'bg-red-500' : currentPhase >= 2 ? 'bg-green-500' : 'bg-brand-500';

  const stepNames = ['Graph Build', 'Env Setup', 'Simulation', 'Report', 'Interaction'];

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex h-[60px] items-center justify-between border-b border-brand-100 bg-white px-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80">
          <img src="/assets/nclouds-icon.svg" alt="nClouds" className="h-6 w-6" />
          <span className="text-lg font-bold text-brand-950">nVision</span>
        </button>
        <div className="flex items-center gap-1 rounded-lg bg-brand-50 p-0.5">
          {(['graph', 'split', 'workbench'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cx('rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors',
                viewMode === mode ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-500 hover:text-brand-700')}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-brand-500">Step {currentStep}/5 · {stepNames[currentStep - 1]}</span>
          <div className="flex items-center gap-1.5">
            <span className={cx('h-2 w-2 rounded-full', statusClass)} />
            <span className="text-xs text-brand-500">{statusText}</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-bold">&times;</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="h-full overflow-hidden transition-all duration-500" style={leftPanelStyle}>
          <GraphPanel
            graphData={graphData}
            loading={loading}
            currentPhase={currentPhase}
            onRefresh={() => {
              if (projectData?.graph_id) loadGraph(projectData.graph_id);
            }}
            onToggleMaximize={() => setViewMode(viewMode === 'graph' ? 'split' : 'graph')}
          />
        </div>
        <div className="h-full overflow-hidden transition-all duration-500" style={rightPanelStyle}>
          <Step1GraphBuild
            currentPhase={currentPhase}
            projectData={projectData}
            ontologyProgress={ontologyProgress}
            buildProgress={buildProgress}
            graphData={graphData}
            systemLogs={systemLogs}
          />
        </div>
      </div>
    </div>
  );
}
