import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAgentLog, getConsoleLog } from '../../api/report';
import type { AgentLogEntry } from '../../api/types';
import { MarkdownRenderer } from '../shared/markdown-renderer';
import { LogViewer, formatLogTimestamp, type LogEntry } from '../shared/log-viewer';
import { cx } from '../../utils/cx';

interface Step4Props {
  reportId: string;
  simulationId?: string;
  systemLogs: LogEntry[];
  onAddLog?: (msg: string) => void;
  onUpdateStatus?: (status: string) => void;
}

interface ReportOutline {
  title: string;
  summary?: string;
  sections: Array<{ title: string; description?: string }>;
}

const TOOL_CONFIG: Record<string, { name: string; color: string }> = {
  insight_forge: { name: 'Deep Insight', color: 'text-purple-600' },
  panorama_search: { name: 'Panorama Search', color: 'text-blue-600' },
  interview_agents: { name: 'Agent Interview', color: 'text-green-600' },
  quick_search: { name: 'Quick Search', color: 'text-orange-600' },
  get_graph_statistics: { name: 'Graph Stats', color: 'text-cyan-600' },
  get_entities_by_type: { name: 'Entity Query', color: 'text-pink-600' },
};

export function Step4Report({ reportId, simulationId, systemLogs, onAddLog, onUpdateStatus }: Step4Props) {
  const navigate = useNavigate();
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const [reportOutline, setReportOutline] = useState<ReportOutline | null>(null);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number | null>(null);
  const [generatedSections, setGeneratedSections] = useState<Record<number, string>>({});
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const [isComplete, setIsComplete] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);

  const agentLogLineRef = useRef(0);
  const consoleLogLineRef = useRef(0);
  const agentLogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consoleLogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  const addLog = useCallback((msg: string) => onAddLog?.(msg), [onAddLog]);

  const stopPolling = useCallback(() => {
    if (agentLogTimerRef.current) { clearInterval(agentLogTimerRef.current); agentLogTimerRef.current = null; }
    if (consoleLogTimerRef.current) { clearInterval(consoleLogTimerRef.current); consoleLogTimerRef.current = null; }
  }, []);

  // Agent log polling (2s)
  const fetchAgentLog = useCallback(async () => {
    if (!reportId) return;
    try {
      const res = await getAgentLog(reportId, agentLogLineRef.current);
      if (!res.success || !mountedRef.current) return;
      const newLogs = res.data.logs || [];
      if (newLogs.length === 0) return;

      setAgentLogs((prev) => [...prev, ...newLogs]);

      newLogs.forEach((log) => {
        if (log.action === 'planning_complete' && (log.details as Record<string, unknown>)?.outline) {
          setReportOutline((log.details as Record<string, unknown>).outline as ReportOutline);
        }
        if (log.action === 'section_start') {
          setCurrentSectionIndex((log as Record<string, unknown>).section_index as number);
        }
        if (log.action === 'section_complete') {
          const content = (log.details as Record<string, unknown>)?.content as string;
          const idx = (log as Record<string, unknown>).section_index as number;
          if (content && idx) {
            setGeneratedSections((prev) => ({ ...prev, [idx]: content }));
            setCurrentSectionIndex(null);
          }
        }
        if (log.action === 'report_complete') {
          setIsComplete(true);
          onUpdateStatus?.('completed');
          stopPolling();
        }
        if (log.action === 'report_start') {
          setStartTime(new Date(log.timestamp || ''));
        }
      });

      agentLogLineRef.current = res.data.next_line;
    } catch { /* ignore */ }
  }, [reportId, stopPolling, onUpdateStatus]);

  // Console log polling (1.5s)
  const fetchConsoleLog = useCallback(async () => {
    if (!reportId) return;
    try {
      const res = await getConsoleLog(reportId, consoleLogLineRef.current);
      if (!res.success || !mountedRef.current) return;
      const newLogs = res.data.logs || [];
      if (newLogs.length > 0) {
        setConsoleLogs((prev) => [
          ...prev,
          ...newLogs.map((l) => ({
            timestamp: formatLogTimestamp(),
            message: typeof l === 'string' ? l : JSON.stringify(l),
          })),
        ]);
        consoleLogLineRef.current = res.data.next_line;
      }
    } catch { /* ignore */ }
  }, [reportId]);

  const startPolling = useCallback(() => {
    if (agentLogTimerRef.current || consoleLogTimerRef.current) return;
    fetchAgentLog();
    fetchConsoleLog();
    agentLogTimerRef.current = setInterval(fetchAgentLog, 2000);
    consoleLogTimerRef.current = setInterval(fetchConsoleLog, 1500);
  }, [fetchAgentLog, fetchConsoleLog]);

  useEffect(() => {
    mountedRef.current = true;
    if (reportId) {
      addLog(`Report generation initialized: ${reportId}`);
      startPolling();
    }
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [reportId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSections = reportOutline?.sections?.length || 0;
  const completedSections = Object.keys(generatedSections).length;

  const toggleSection = (idx: number) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Workflow steps for right panel
  const workflowSteps = useMemo(() => {
    const steps: Array<{ key: string; label: string; title: string; status: string }> = [];
    const planningDone = agentLogs.some((l) => l.action === 'planning_complete');
    const planningStarted = agentLogs.some((l) => l.action === 'planning_start');
    steps.push({
      key: 'planning',
      label: 'PL',
      title: 'Planning / Outline',
      status: planningDone ? 'done' : planningStarted ? 'active' : 'todo',
    });

    (reportOutline?.sections || []).forEach((section, i) => {
      const idx = i + 1;
      steps.push({
        key: `section-${idx}`,
        label: String(idx).padStart(2, '0'),
        title: section.title,
        status: generatedSections[idx] ? 'done' : currentSectionIndex === idx ? 'active' : 'todo',
      });
    });

    steps.push({
      key: 'complete',
      label: 'OK',
      title: 'Complete',
      status: isComplete ? 'done' : 'todo',
    });

    return steps;
  }, [agentLogs, reportOutline, generatedSections, currentSectionIndex, isComplete]);

  // Timeline logs for right panel
  const timelineLogs = useMemo(() => {
    return agentLogs.filter((l) =>
      ['planning_start', 'planning_complete', 'section_start', 'section_complete', 'tool_call', 'tool_result', 'report_complete'].includes(l.action || '')
    );
  }, [agentLogs]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Report */}
        <div ref={leftPanelRef} className="flex-1 overflow-y-auto border-r border-brand-100 p-4">
          {reportOutline ? (
            <div>
              <h1 className="text-xl font-bold text-brand-950 mb-2">{reportOutline.title}</h1>
              {reportOutline.summary && (
                <p className="text-sm text-brand-600 mb-4 leading-relaxed">{reportOutline.summary}</p>
              )}

              <div className="space-y-4">
                {reportOutline.sections.map((section, i) => {
                  const idx = i + 1;
                  const content = generatedSections[idx];
                  const isCollapsed = collapsedSections.has(i);
                  const isGenerating = currentSectionIndex === idx;

                  return (
                    <div key={i} className="rounded-2xl border border-brand-100 overflow-hidden">
                      <button
                        onClick={() => toggleSection(i)}
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-brand-25"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                          {String(idx).padStart(2, '0')}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-brand-900">{section.title}</span>
                        {content && <span className="text-[10px] text-green-500">Complete</span>}
                        {isGenerating && <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />}
                        <span className="text-brand-400 text-xs">{isCollapsed ? '+' : '-'}</span>
                      </button>
                      {!isCollapsed && (
                        <div className="border-t border-brand-100 p-4">
                          {content ? (
                            <MarkdownRenderer content={content} />
                          ) : isGenerating ? (
                            <div className="flex items-center gap-2 py-6 justify-center text-xs text-brand-400">
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
                              Generating section...
                            </div>
                          ) : (
                            <div className="py-4 text-center text-xs text-brand-300">Waiting...</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
                <p className="text-sm text-brand-500">Generating report outline...</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Workflow */}
        <div ref={rightPanelRef} className="w-[340px] shrink-0 overflow-y-auto p-4">
          {/* Metrics */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="rounded-lg bg-brand-25 p-2 text-center">
              <div className="text-lg font-bold text-brand-900">{completedSections}/{totalSections}</div>
              <div className="text-[10px] text-brand-500">Sections</div>
            </div>
            <div className="rounded-lg bg-brand-25 p-2 text-center">
              <div className={cx('text-sm font-bold', isComplete ? 'text-green-600' : 'text-brand-600')}>
                {isComplete ? 'Completed' : 'Generating'}
              </div>
              <div className="text-[10px] text-brand-500">Status</div>
            </div>
          </div>

          {/* Workflow Steps */}
          <div className="mb-4 space-y-1">
            {workflowSteps.map((step) => (
              <div key={step.key} className="flex items-center gap-2">
                <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
                  step.status === 'done' ? 'bg-green-500 text-white' :
                  step.status === 'active' ? 'bg-brand-600 text-white' :
                  'bg-brand-100 text-brand-400')}>
                  {step.status === 'done' ? '\u2713' : step.label}
                </span>
                <span className={cx('text-xs', step.status === 'active' ? 'font-medium text-brand-900' : 'text-brand-600')}>
                  {step.title}
                </span>
                {step.status === 'active' && (
                  <div className="ml-auto h-3 w-3 animate-spin rounded-full border border-brand-200 border-t-brand-600" />
                )}
              </div>
            ))}
          </div>

          {/* Next Step Button */}
          {isComplete && simulationId && (
            <button
              onClick={() => navigate(`/interaction/${reportId}`)}
              className="mb-4 w-full rounded-[5px] bg-brand-600 py-2 text-sm font-semibold uppercase tracking-wider text-white hover:bg-brand-500"
            >
              Go to Interaction
            </button>
          )}

          {/* Timeline */}
          <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-2">Timeline</h4>
          <div className="space-y-2">
            {timelineLogs.map((log, i) => {
              const toolName = (log.details as Record<string, unknown>)?.tool_name as string;
              const toolConf = toolName ? TOOL_CONFIG[toolName] : null;

              return (
                <div key={i} className="rounded-lg bg-brand-25 p-2">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {toolConf && <span className={cx('text-[10px] font-bold', toolConf.color)}>{toolConf.name}</span>}
                    <span className="text-[10px] font-medium text-brand-600 capitalize">
                      {(log.action || '').replace(/_/g, ' ')}
                    </span>
                    <span className="ml-auto text-[9px] text-brand-400">
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false }) : ''}
                    </span>
                  </div>
                  {log.action === 'tool_call' && (log.details as Record<string, unknown>)?.params != null && (
                    <div className="text-[10px] text-brand-500 mt-0.5 line-clamp-2">
                      {JSON.stringify((log.details as Record<string, unknown>).params).substring(0, 100)}
                    </div>
                  )}
                  {log.action === 'tool_result' && (log.details as Record<string, unknown>)?.result_length != null && (
                    <div className="text-[10px] text-brand-500 mt-0.5">
                      Result: {String((log.details as Record<string, unknown>).result_length)} chars
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Console Logs */}
      <div className="border-t border-brand-100">
        <LogViewer logs={consoleLogs} title="Console" maxHeight="120px" />
      </div>
    </div>
  );
}
