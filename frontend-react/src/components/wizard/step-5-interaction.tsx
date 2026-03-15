import { useState, useEffect, useRef, useCallback } from 'react';
import { getReport, getAgentLog, chatWithReport } from '../../api/report';
import { getSimulationProfilesRealtime, interviewAgents } from '../../api/simulation';
import type { AgentProfile, AgentLogEntry } from '../../api/types';
import { MarkdownRenderer } from '../shared/markdown-renderer';
import { LogViewer, formatLogTimestamp, type LogEntry } from '../shared/log-viewer';
import { cx } from '../../utils/cx';

interface Step5Props {
  reportId: string;
  simulationId?: string;
  systemLogs: LogEntry[];
  onAddLog?: (msg: string) => void;
  onUpdateStatus?: (status: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface SurveyResult {
  agent_id: number;
  agent_name: string;
  profession?: string;
  question: string;
  answer: string;
}

export function Step5Interaction({ reportId, simulationId, systemLogs, onAddLog }: Step5Props) {
  const [activeTab, setActiveTab] = useState<'chat' | 'survey'>('chat');
  const [chatTarget, setChatTarget] = useState<'report_agent' | 'agent'>('report_agent');
  const [selectedAgent, setSelectedAgent] = useState<AgentProfile | null>(null);
  const [selectedAgentIndex, setSelectedAgentIndex] = useState<number | null>(null);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatHistoryCache, setChatHistoryCache] = useState<Record<string, ChatMessage[]>>({});
  const [isSending, setIsSending] = useState(false);

  const [selectedAgents, setSelectedAgents] = useState<Set<number>>(new Set());
  const [surveyQuestion, setSurveyQuestion] = useState('');
  const [surveyResults, setSurveyResults] = useState<SurveyResult[]>([]);
  const [isSurveying, setIsSurveying] = useState(false);

  const [reportOutline, setReportOutline] = useState<{ title: string; summary?: string; sections: Array<{ title: string }> } | null>(null);
  const [generatedSections, setGeneratedSections] = useState<Record<number, string>>({});
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);

  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  const addLog = useCallback((msg: string) => onAddLog?.(msg), [onAddLog]);

  const scrollToBottom = () => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  };

  // Load data on mount
  useEffect(() => {
    mountedRef.current = true;

    const loadData = async () => {
      // Load report data
      if (reportId) {
        try {
          const logRes = await getAgentLog(reportId, 0);
          if (logRes.success) {
            (logRes.data.logs || []).forEach((log: AgentLogEntry) => {
              if (log.action === 'planning_complete' && (log.details as Record<string, unknown>)?.outline) {
                setReportOutline((log.details as Record<string, unknown>).outline as typeof reportOutline);
              }
              if (log.action === 'section_complete') {
                const idx = (log as Record<string, unknown>).section_index as number;
                const content = (log.details as Record<string, unknown>)?.content as string;
                if (idx && content) {
                  setGeneratedSections((prev) => ({ ...prev, [idx]: content }));
                }
              }
            });
          }
        } catch { /* ignore */ }
      }

      // Load profiles
      if (simulationId) {
        try {
          const res = await getSimulationProfilesRealtime(simulationId, 'reddit');
          if (res.success && mountedRef.current) {
            setProfiles((res.data as Record<string, unknown>).profiles as AgentProfile[] || []);
            addLog(`Loaded ${((res.data as Record<string, unknown>).profiles as AgentProfile[])?.length || 0} agents`);
          }
        } catch { /* ignore */ }
      }
    };

    loadData();
    return () => { mountedRef.current = false; };
  }, [reportId, simulationId, addLog]);

  const saveChatHistory = useCallback(() => {
    if (chatHistory.length === 0) return;
    const key = chatTarget === 'report_agent' ? 'report_agent' : `agent_${selectedAgentIndex}`;
    setChatHistoryCache((prev) => ({ ...prev, [key]: [...chatHistory] }));
  }, [chatHistory, chatTarget, selectedAgentIndex]);

  const selectReportAgent = () => {
    saveChatHistory();
    setChatTarget('report_agent');
    setSelectedAgent(null);
    setSelectedAgentIndex(null);
    setShowAgentDropdown(false);
    setChatHistory(chatHistoryCache['report_agent'] || []);
    setActiveTab('chat');
  };

  const selectAgent = (agent: AgentProfile, idx: number) => {
    saveChatHistory();
    setSelectedAgent(agent);
    setSelectedAgentIndex(idx);
    setChatTarget('agent');
    setShowAgentDropdown(false);
    setChatHistory(chatHistoryCache[`agent_${idx}`] || []);
    addLog(`Selected: ${agent.username}`);
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || isSending) return;
    const message = chatInput.trim();
    setChatInput('');
    setChatHistory((prev) => [...prev, { role: 'user', content: message, timestamp: new Date().toISOString() }]);
    scrollToBottom();
    setIsSending(true);

    try {
      if (chatTarget === 'report_agent') {
        addLog(`To Report Agent: ${message.substring(0, 50)}...`);
        const historyForApi = chatHistory.slice(-10).map((m) => ({ role: m.role, content: m.content }));
        const res = await chatWithReport({ simulation_id: simulationId || '', message, chat_history: historyForApi });
        if (res.success) {
          setChatHistory((prev) => [...prev, {
            role: 'assistant',
            content: (res.data as Record<string, unknown>).response as string || (res.data as Record<string, unknown>).answer as string || 'No response',
            timestamp: new Date().toISOString(),
          }]);
          addLog('Report Agent replied.');
        }
      } else if (selectedAgentIndex !== null) {
        addLog(`To ${selectedAgent?.username}: ${message.substring(0, 50)}...`);
        let prompt = message;
        if (chatHistory.length > 1) {
          const ctx = chatHistory.slice(-6).map((m) => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`).join('\n');
          prompt = `Previous conversation:\n${ctx}\n\nNew question: ${message}`;
        }
        const res = await interviewAgents({
          simulation_id: simulationId || '',
          interviews: [{ agent_id: String(selectedAgentIndex), prompt }],
        });
        if (res.success) {
          const results = (res.data as Record<string, unknown>).results || (res.data as Record<string, unknown>).result || res.data;
          let responseContent = 'No response';
          if (typeof results === 'object' && results !== null) {
            const r = results as Record<string, Record<string, string>>;
            const agentResult = r[`reddit_${selectedAgentIndex}`] || r[`twitter_${selectedAgentIndex}`];
            if (agentResult) responseContent = agentResult.response || agentResult.answer || 'No response';
          }
          setChatHistory((prev) => [...prev, { role: 'assistant', content: responseContent, timestamp: new Date().toISOString() }]);
          addLog(`${selectedAgent?.username} replied.`);
        }
      }
    } catch (err) {
      setChatHistory((prev) => [...prev, { role: 'assistant', content: `Error: ${(err as Error).message}`, timestamp: new Date().toISOString() }]);
    } finally {
      setIsSending(false);
      scrollToBottom();
      saveChatHistory();
    }
  };

  const submitSurvey = async () => {
    if (selectedAgents.size === 0 || !surveyQuestion.trim()) return;
    setIsSurveying(true);
    addLog(`Sending survey to ${selectedAgents.size} agents...`);
    try {
      const interviews = Array.from(selectedAgents).map((idx) => ({ agent_id: String(idx), prompt: surveyQuestion.trim() }));
      const res = await interviewAgents({ simulation_id: simulationId || '', interviews });
      if (res.success) {
        const results = (res.data as Record<string, unknown>).results || (res.data as Record<string, unknown>).result || res.data;
        const surveyList: SurveyResult[] = [];
        for (const interview of interviews) {
          const idx = Number(interview.agent_id);
          const agent = profiles[idx];
          let answer = 'No response';
          if (typeof results === 'object' && results !== null) {
            const r = results as Record<string, Record<string, string>>;
            const agentResult = r[`reddit_${idx}`] || r[`twitter_${idx}`];
            if (agentResult) answer = agentResult.response || agentResult.answer || 'No response';
          }
          surveyList.push({ agent_id: idx, agent_name: agent?.username || `Agent ${idx}`, profession: agent?.profession, question: surveyQuestion.trim(), answer });
        }
        setSurveyResults(surveyList);
        addLog(`Received ${surveyList.length} survey responses.`);
      }
    } catch (err) {
      addLog(`Survey failed: ${(err as Error).message}`);
    } finally {
      setIsSurveying(false);
    }
  };

  const toggleSection = (idx: number) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Report */}
        <div className="flex-1 overflow-y-auto border-r border-brand-100 p-4">
          {reportOutline ? (
            <div>
              <h1 className="text-xl font-bold text-brand-950 mb-2">{reportOutline.title}</h1>
              <div className="space-y-3">
                {reportOutline.sections.map((section, i) => {
                  const idx = i + 1;
                  const content = generatedSections[idx];
                  const isCollapsed = collapsedSections.has(i);
                  return (
                    <div key={i} className="rounded-2xl border border-brand-100 overflow-hidden">
                      <button onClick={() => toggleSection(i)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-brand-25">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                          {String(idx).padStart(2, '0')}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-brand-900">{section.title}</span>
                        <span className="text-brand-400 text-xs">{isCollapsed ? '+' : '-'}</span>
                      </button>
                      {!isCollapsed && content && (
                        <div className="border-t border-brand-100 p-4">
                          <MarkdownRenderer content={content} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-brand-400">Loading report...</div>
          )}
        </div>

        {/* Right Panel: Interaction */}
        <div className="w-[380px] shrink-0 flex flex-col overflow-hidden">
          {/* Action Bar */}
          <div className="border-b border-brand-100 p-3">
            <div className="flex gap-2 mb-2">
              <button
                onClick={selectReportAgent}
                className={cx('rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors',
                  chatTarget === 'report_agent' && activeTab === 'chat' ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600 hover:bg-brand-100')}
              >
                Report Agent
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                  className={cx('rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors',
                    chatTarget === 'agent' && activeTab === 'chat' ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600 hover:bg-brand-100')}
                >
                  {selectedAgent ? selectedAgent.username : 'Select Agent'}
                </button>
                {showAgentDropdown && (
                  <div className="absolute top-full left-0 z-20 mt-1 w-56 max-h-[300px] overflow-y-auto rounded-lg bg-white shadow-lg border border-brand-100">
                    {profiles.map((p, i) => (
                      <button key={i} onClick={() => selectAgent(p, i)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-brand-25">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-600">
                          {p.username?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-brand-800">{p.username}</div>
                          <div className="text-[10px] text-brand-400">{p.profession}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setActiveTab('survey'); saveChatHistory(); }}
                className={cx('rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTab === 'survey' ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600 hover:bg-brand-100')}
              >
                Survey
              </button>
            </div>

            {/* Agent profile card */}
            {activeTab === 'chat' && chatTarget === 'agent' && selectedAgent && (
              <div className="rounded-lg bg-brand-25 p-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-600">
                    {selectedAgent.username?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-medium text-brand-900">{selectedAgent.username}</div>
                    <div className="text-[10px] text-brand-500">{selectedAgent.profession}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chat Mode */}
          {activeTab === 'chat' && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div ref={chatMessagesRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                {chatHistory.length === 0 && (
                  <div className="py-8 text-center text-xs text-brand-400">
                    {chatTarget === 'report_agent' ? 'Chat with Report Agent' : 'Select an agent to start'}
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} className={cx('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {msg.role === 'assistant' && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-600">
                        {chatTarget === 'report_agent' ? 'RA' : selectedAgent?.username?.[0] || '?'}
                      </div>
                    )}
                    <div className={cx('max-w-[80%] rounded-lg px-3 py-2 text-xs',
                      msg.role === 'user' ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-800')}>
                      {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} className="text-xs" /> : msg.content}
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-600">...</div>
                    <div className="rounded-lg bg-brand-50 px-3 py-2">
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: '0.2s' }} />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-brand-100 p-3">
                <div className="flex gap-2">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Type your message..."
                    className="flex-1 resize-none rounded-lg border border-brand-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                    rows={2}
                    disabled={isSending || (chatTarget === 'agent' && !selectedAgent)}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={isSending || !chatInput.trim() || (chatTarget === 'agent' && !selectedAgent)}
                    className="shrink-0 rounded-[5px] bg-brand-600 px-4 text-xs font-semibold uppercase text-white hover:bg-brand-500 disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Survey Mode */}
          {activeTab === 'survey' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-brand-400 uppercase tracking-wider">Select Agents ({selectedAgents.size})</h4>
                  <div className="flex gap-1">
                    <button onClick={() => { const s = new Set<number>(); profiles.forEach((_, i) => s.add(i)); setSelectedAgents(s); }}
                      className="text-[10px] text-brand-600 hover:text-brand-500">All</button>
                    <button onClick={() => setSelectedAgents(new Set())}
                      className="text-[10px] text-brand-600 hover:text-brand-500">None</button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 max-h-[150px] overflow-y-auto">
                  {profiles.map((p, i) => (
                    <button key={i}
                      onClick={() => setSelectedAgents((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                      className={cx('rounded px-1.5 py-1 text-[10px] transition-colors',
                        selectedAgents.has(i) ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600 hover:bg-brand-100')}>
                      {p.username}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={surveyQuestion}
                onChange={(e) => setSurveyQuestion(e.target.value)}
                placeholder="Enter your survey question..."
                className="w-full resize-none rounded-lg border border-brand-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                rows={3}
              />

              <button
                onClick={submitSurvey}
                disabled={isSurveying || selectedAgents.size === 0 || !surveyQuestion.trim()}
                className="w-full rounded-[5px] bg-brand-600 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-brand-500 disabled:opacity-50"
              >
                {isSurveying ? 'Sending...' : 'Submit Survey'}
              </button>

              {/* Survey Results */}
              {surveyResults.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-brand-400 uppercase tracking-wider">Results ({surveyResults.length})</h4>
                  {surveyResults.map((r, i) => (
                    <div key={i} className="rounded-lg border border-brand-100 p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-brand-900">{r.agent_name}</span>
                        {r.profession && <span className="text-[10px] text-brand-400">{r.profession}</span>}
                      </div>
                      <div className="text-xs text-brand-700 leading-relaxed">
                        <MarkdownRenderer content={r.answer} className="text-xs" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-brand-100">
        <LogViewer logs={systemLogs} title="System Logs" maxHeight="120px" />
      </div>
    </div>
  );
}
