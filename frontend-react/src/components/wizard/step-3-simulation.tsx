import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  startSimulation,
  stopSimulation,
  getRunStatus,
  getRunStatusDetail,
} from '@/api/simulation';
import { generateReport } from '@/api/report';
import type { LogEntry } from '@/components/shared/log-viewer';
import { cx } from '@/utils/cx';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RunStatusData {
  twitter_running?: boolean;
  reddit_running?: boolean;
  twitter_current_round?: number;
  reddit_current_round?: number;
  total_rounds?: number;
  twitter_actions_count?: number;
  reddit_actions_count?: number;
  twitter_completed?: boolean;
  reddit_completed?: boolean;
  runner_status?: string;
  twitter_simulated_hours?: number;
  reddit_simulated_hours?: number;
  process_pid?: string | number;
  force_restarted?: boolean;
  [key: string]: unknown;
}

interface ActionArgs {
  content?: string;
  quote_content?: string;
  original_content?: string;
  original_author_name?: string;
  post_author_name?: string;
  post_content?: string;
  post_id?: string;
  query?: string;
  target_user?: string;
  user_id?: string;
  [key: string]: unknown;
}

interface ActionItem {
  id?: string;
  timestamp?: string;
  platform?: string;
  agent_id?: string;
  agent_name?: string;
  action_type?: string;
  action_args?: ActionArgs;
  round_num?: number;
  _uniqueId: string;
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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ACTION_TYPE_LABELS: Record<string, string> = {
  CREATE_POST: 'POST',
  REPOST: 'REPOST',
  LIKE_POST: 'LIKE',
  CREATE_COMMENT: 'COMMENT',
  LIKE_COMMENT: 'LIKE',
  DO_NOTHING: 'IDLE',
  FOLLOW: 'FOLLOW',
  SEARCH_POSTS: 'SEARCH',
  QUOTE_POST: 'QUOTE',
  UPVOTE_POST: 'UPVOTE',
  DOWNVOTE_POST: 'DOWNVOTE',
};

const ACTION_TYPE_CLASSES: Record<string, string> = {
  CREATE_POST: 'bg-brand-100 text-brand-800 border-brand-200',
  QUOTE_POST: 'bg-brand-100 text-brand-800 border-brand-200',
  REPOST: 'bg-white text-brand-500 border-brand-200',
  LIKE_POST: 'bg-white text-brand-500 border-brand-200',
  LIKE_COMMENT: 'bg-white text-brand-500 border-brand-200',
  UPVOTE_POST: 'bg-white text-brand-500 border-brand-200',
  DOWNVOTE_POST: 'bg-white text-brand-500 border-brand-200',
  CREATE_COMMENT: 'bg-brand-50 text-brand-600 border-brand-200',
  FOLLOW: 'bg-brand-25 text-brand-400 border-dashed border-brand-200',
  SEARCH_POSTS: 'bg-brand-25 text-brand-400 border-dashed border-brand-200',
  DO_NOTHING: 'opacity-50',
};

const KNOWN_TYPES = [
  'CREATE_POST',
  'QUOTE_POST',
  'REPOST',
  'LIKE_POST',
  'CREATE_COMMENT',
  'SEARCH_POSTS',
  'FOLLOW',
  'UPVOTE_POST',
  'DOWNVOTE_POST',
  'DO_NOTHING',
];

const TWITTER_ACTIONS = ['POST', 'LIKE', 'REPOST', 'QUOTE', 'FOLLOW', 'IDLE'];
const REDDIT_ACTIONS = ['POST', 'COMMENT', 'LIKE', 'DISLIKE', 'SEARCH', 'TREND', 'FOLLOW', 'MUTE', 'REFRESH', 'IDLE'];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getActionLabel(type?: string): string {
  if (!type) return 'UNKNOWN';
  return ACTION_TYPE_LABELS[type] ?? type;
}

function getActionBadgeClass(type?: string): string {
  if (!type) return 'bg-brand-50 text-brand-400 border-brand-200';
  return ACTION_TYPE_CLASSES[type] ?? 'bg-brand-50 text-brand-400 border-brand-200';
}

function truncateContent(content?: string, maxLength = 100): string {
  if (!content) return '';
  return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
}

function formatActionTime(timestamp?: string): string {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatElapsedTime(currentRound: number, minutesPerRound: number): string {
  if (currentRound <= 0) return '0h 0m';
  const totalMinutes = currentRound * minutesPerRound;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function checkPlatformsCompleted(data: RunStatusData): boolean {
  if (!data) return false;
  const twitterCompleted = data.twitter_completed === true;
  const redditCompleted = data.reddit_completed === true;
  const twitterEnabled =
    (data.twitter_actions_count ?? 0) > 0 || data.twitter_running || twitterCompleted;
  const redditEnabled =
    (data.reddit_actions_count ?? 0) > 0 || data.reddit_running || redditCompleted;
  if (!twitterEnabled && !redditEnabled) return false;
  if (twitterEnabled && !twitterCompleted) return false;
  if (redditEnabled && !redditCompleted) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/*  SVG Icon helpers                                                   */
/* ------------------------------------------------------------------ */

function TwitterIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function RedditIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={3}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PlatformStatusCard({
  label,
  icon,
  active,
  completed,
  currentRound,
  totalRounds,
  elapsed,
  actsCount,
  availableActions,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  completed: boolean;
  currentRound: number;
  totalRounds: string;
  elapsed: string;
  actsCount: number;
  availableActions: string[];
}) {
  return (
    <div
      className={cx(
        'group relative flex min-w-[140px] cursor-pointer flex-col gap-1 rounded border px-3 py-1.5 transition-all',
        active && !completed && 'border-brand-800 bg-white opacity-100',
        completed && 'border-green-600 bg-green-50 opacity-100',
        !active && !completed && 'border-brand-200 bg-brand-25 opacity-70',
      )}
    >
      {/* Header */}
      <div className="mb-0.5 flex items-center gap-2">
        <span className="text-brand-800">{icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-brand-900">{label}</span>
        {completed && (
          <span className="ml-auto text-green-600">
            <CheckIcon />
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex gap-2.5">
        <span className="flex items-baseline gap-1">
          <span className="text-[8px] font-semibold uppercase tracking-wide text-brand-400">ROUND</span>
          <span className="font-mono text-[11px] font-semibold text-brand-700">
            {currentRound}
            <span className="text-[9px] font-normal text-brand-400">/{totalRounds}</span>
          </span>
        </span>
        <span className="flex items-baseline gap-1">
          <span className="text-[8px] font-semibold uppercase tracking-wide text-brand-400">Elapsed Time</span>
          <span className="font-mono text-[11px] font-semibold text-brand-700">{elapsed}</span>
        </span>
        <span className="flex items-baseline gap-1">
          <span className="text-[8px] font-semibold uppercase tracking-wide text-brand-400">ACTS</span>
          <span className="font-mono text-[11px] font-semibold text-brand-700">{actsCount}</span>
        </span>
      </div>

      {/* Tooltip on hover */}
      <div className="pointer-events-none invisible absolute left-1/2 top-full z-50 mt-2 min-w-[180px] -translate-x-1/2 rounded bg-brand-950 px-3.5 py-2.5 text-white opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 border-x-[6px] border-b-[6px] border-x-transparent border-b-brand-950" />
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-brand-400">
          Available Actions
        </div>
        <div className="flex flex-wrap gap-1.5">
          {availableActions.map((a) => (
            <span
              key={a}
              className="rounded-sm bg-white/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white"
            >
              {a}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Action card body renderers                                         */
/* ------------------------------------------------------------------ */

function ActionCardBody({ action }: { action: ActionItem }) {
  const type = action.action_type;
  const args = action.action_args;

  return (
    <div className="space-y-2">
      {/* CREATE_POST */}
      {type === 'CREATE_POST' && args?.content && (
        <p className="text-sm leading-relaxed text-brand-900">{args.content}</p>
      )}

      {/* QUOTE_POST */}
      {type === 'QUOTE_POST' && (
        <>
          {args?.quote_content && (
            <p className="text-[13px] leading-relaxed text-brand-700">{args.quote_content}</p>
          )}
          {args?.original_content && (
            <div className="mt-2 rounded border border-brand-100 bg-brand-25 p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] text-brand-500">
                <svg className="text-brand-400" viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span>@{args.original_author_name || 'User'}</span>
              </div>
              <p className="text-xs text-brand-600">{truncateContent(args.original_content, 150)}</p>
            </div>
          )}
        </>
      )}

      {/* REPOST */}
      {type === 'REPOST' && (
        <>
          <div className="flex items-center gap-1.5 text-[11px] text-brand-500">
            <svg className="text-brand-400" viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            <span>Reposted from @{args?.original_author_name || 'User'}</span>
          </div>
          {args?.original_content && (
            <div className="rounded border border-brand-100 bg-brand-25 p-2.5 text-xs text-brand-600">
              {truncateContent(args.original_content, 200)}
            </div>
          )}
        </>
      )}

      {/* LIKE_POST */}
      {type === 'LIKE_POST' && (
        <>
          <div className="flex items-center gap-1.5 text-[11px] text-brand-500">
            <svg className="text-brand-400" viewBox="0 0 24 24" width={14} height={14} fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span>Liked @{args?.post_author_name || 'User'}&apos;s post</span>
          </div>
          {args?.post_content && (
            <p className="text-xs italic text-brand-500">
              &ldquo;{truncateContent(args.post_content, 120)}&rdquo;
            </p>
          )}
        </>
      )}

      {/* CREATE_COMMENT */}
      {type === 'CREATE_COMMENT' && (
        <>
          {args?.content && (
            <p className="text-[13px] leading-relaxed text-brand-700">{args.content}</p>
          )}
          {args?.post_id && (
            <div className="flex items-center gap-1.5 text-[11px] text-brand-500">
              <svg className="text-brand-400" viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span>Reply to post #{args.post_id}</span>
            </div>
          )}
        </>
      )}

      {/* SEARCH_POSTS */}
      {type === 'SEARCH_POSTS' && (
        <div className="flex items-center gap-1.5 text-[11px] text-brand-500">
          <svg className="text-brand-400" viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Search Query:</span>
          <span className="rounded bg-brand-100 px-1 font-mono text-brand-600">
            &ldquo;{args?.query || ''}&rdquo;
          </span>
        </div>
      )}

      {/* FOLLOW */}
      {type === 'FOLLOW' && (
        <div className="flex items-center gap-1.5 text-[11px] text-brand-500">
          <svg className="text-brand-400" viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
          <span>Followed @{args?.target_user || args?.user_id || 'User'}</span>
        </div>
      )}

      {/* UPVOTE / DOWNVOTE */}
      {(type === 'UPVOTE_POST' || type === 'DOWNVOTE_POST') && (
        <>
          <div className="flex items-center gap-1.5 text-[11px] text-brand-500">
            {type === 'UPVOTE_POST' ? (
              <svg className="text-brand-400" viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="18 15 12 9 6 15" />
              </svg>
            ) : (
              <svg className="text-brand-400" viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
            <span>{type === 'UPVOTE_POST' ? 'Upvoted' : 'Downvoted'} Post</span>
          </div>
          {args?.post_content && (
            <p className="text-xs italic text-brand-500">
              &ldquo;{truncateContent(args.post_content, 120)}&rdquo;
            </p>
          )}
        </>
      )}

      {/* DO_NOTHING */}
      {type === 'DO_NOTHING' && (
        <div className="flex items-center gap-1.5 text-[11px] text-brand-400">
          <svg className="text-brand-300" viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Action Skipped</span>
        </div>
      )}

      {/* Fallback for unknown types */}
      {type && !KNOWN_TYPES.includes(type) && args?.content && (
        <p className="text-[13px] leading-relaxed text-brand-700">{args.content}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function Step3Simulation({
  simulationId,
  maxRounds,
  minutesPerRound = 30,
  projectData,
  graphData,
  systemLogs,
  onGoBack,
  onNextStep,
  onAddLog,
  onUpdateStatus,
}: Step3SimulationProps) {
  const navigate = useNavigate();

  // Phase: 0=not started, 1=running, 2=completed
  const [phase, setPhase] = useState(0);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatusData>({});
  const [allActions, setAllActions] = useState<ActionItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(50);

  const actionIdsRef = useRef(new Set<string>());
  const actionOffsetRef = useRef(0);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detailTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logContentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevTwitterRoundRef = useRef(0);
  const prevRedditRoundRef = useRef(0);
  const mountedRef = useRef(true);

  // Maximum actions kept in memory (sliding window)
  const MAX_ACTIONS_IN_MEMORY = 500;

  /* ---------- Computed values ---------- */

  const twitterElapsedTime = useMemo(
    () => formatElapsedTime(runStatus.twitter_current_round || 0, minutesPerRound),
    [runStatus.twitter_current_round, minutesPerRound],
  );

  const redditElapsedTime = useMemo(
    () => formatElapsedTime(runStatus.reddit_current_round || 0, minutesPerRound),
    [runStatus.reddit_current_round, minutesPerRound],
  );

  // Use counts from run status (already tracked by backend) instead of filtering array
  const twitterActionsCount = runStatus.twitter_actions_count || 0;
  const redditActionsCount = runStatus.reddit_actions_count || 0;

  /* ---------- Polling ---------- */

  const stopPolling = useCallback(() => {
    if (statusTimerRef.current) {
      clearInterval(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    if (detailTimerRef.current) {
      clearInterval(detailTimerRef.current);
      detailTimerRef.current = null;
    }
  }, []);

  const fetchRunStatus = useCallback(async () => {
    if (!simulationId || !mountedRef.current) return;
    try {
      const res = await getRunStatus(simulationId);
      if (!mountedRef.current) return;
      if (res.success && res.data) {
        const data = res.data as RunStatusData;
        setRunStatus(data);

        if ((data.twitter_current_round ?? 0) > prevTwitterRoundRef.current) {
          onAddLog(
            `[Plaza] R${data.twitter_current_round}/${data.total_rounds} | T:${data.twitter_simulated_hours || 0}h | A:${data.twitter_actions_count}`,
          );
          prevTwitterRoundRef.current = data.twitter_current_round ?? 0;
        }

        if ((data.reddit_current_round ?? 0) > prevRedditRoundRef.current) {
          onAddLog(
            `[Community] R${data.reddit_current_round}/${data.total_rounds} | T:${data.reddit_simulated_hours || 0}h | A:${data.reddit_actions_count}`,
          );
          prevRedditRoundRef.current = data.reddit_current_round ?? 0;
        }

        const isCompleted =
          data.runner_status === 'completed' || data.runner_status === 'stopped';
        const platformsCompleted = checkPlatformsCompleted(data);

        if (isCompleted || platformsCompleted) {
          if (platformsCompleted && !isCompleted) {
            onAddLog('All platform simulations have ended');
          }
          onAddLog('Simulation completed');
          setPhase(2);
          stopPolling();
          onUpdateStatus('completed');
        }
      }
    } catch (err) {
      console.warn('Failed to fetch run status:', err);
    }
  }, [simulationId, onAddLog, onUpdateStatus, stopPolling]);

  const fetchRunStatusDetail = useCallback(async () => {
    if (!simulationId || !mountedRef.current) return;
    try {
      const res = await getRunStatusDetail(simulationId, actionOffsetRef.current);
      if (!mountedRef.current) return;
      if (res.success && res.data) {
        const serverActions: any[] = (res.data as any).all_actions || [];
        const totalCount: number = (res.data as any).total_actions_count ?? 0;

        const newActions: ActionItem[] = [];
        for (const action of serverActions) {
          const actionId =
            action.id ||
            `${action.timestamp}-${action.platform}-${action.agent_id}-${action.action_type}`;
          if (!actionIdsRef.current.has(actionId)) {
            actionIdsRef.current.add(actionId);
            newActions.push({ ...action, _uniqueId: actionId });
          }
        }

        // Update offset so next poll only fetches new actions
        actionOffsetRef.current = totalCount;

        if (newActions.length > 0) {
          setAllActions((prev) => {
            const combined = [...prev, ...newActions];
            // Sliding window: keep only the most recent actions in memory
            if (combined.length > MAX_ACTIONS_IN_MEMORY) {
              return combined.slice(-MAX_ACTIONS_IN_MEMORY);
            }
            return combined;
          });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch status detail:', err);
    }
  }, [simulationId]);

  const startStatusPolling = useCallback(() => {
    statusTimerRef.current = setInterval(fetchRunStatus, 2000);
  }, [fetchRunStatus]);

  const startDetailPolling = useCallback(() => {
    detailTimerRef.current = setInterval(fetchRunStatusDetail, 3000);
  }, [fetchRunStatusDetail]);

  /* ---------- Start / Stop simulation ---------- */

  const doStartSimulation = useCallback(async () => {
    if (!simulationId) {
      onAddLog('Error: missing simulationId');
      return;
    }

    // Reset state
    setPhase(0);
    setRunStatus({});
    setAllActions([]);
    setVisibleCount(50);
    actionIdsRef.current = new Set();
    actionOffsetRef.current = 0;
    prevTwitterRoundRef.current = 0;
    prevRedditRoundRef.current = 0;
    setStartError(null);
    setIsStarting(true);
    stopPolling();

    onAddLog('Starting dual-platform parallel simulation...');
    onUpdateStatus('processing');

    try {
      const params: Record<string, any> = {
        simulation_id: simulationId,
        platform: 'parallel',
        force: true,
        enable_graph_memory_update: true,
      };

      if (maxRounds) {
        params.max_rounds = maxRounds;
        onAddLog(`Max simulation rounds: ${maxRounds}`);
      }

      onAddLog('Dynamic graph update mode enabled');

      const res = await startSimulation(params as any);

      if (!mountedRef.current) return;

      if (res.success && res.data) {
        const data = res.data as RunStatusData;
        if (data.force_restarted) {
          onAddLog('Cleared old simulation logs, restarting simulation');
        }
        onAddLog('Simulation engine started successfully');
        onAddLog(`  PID: ${data.process_pid || '-'}`);

        setPhase(1);
        setRunStatus(data);
        startStatusPolling();
        startDetailPolling();
      } else {
        const error = (res as any).error || 'Start failed';
        setStartError(error);
        onAddLog(`Start failed: ${error}`);
        onUpdateStatus('error');
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setStartError(err.message);
      onAddLog(`Start error: ${err.message}`);
      onUpdateStatus('error');
    } finally {
      if (mountedRef.current) {
        setIsStarting(false);
      }
    }
  }, [simulationId, maxRounds, onAddLog, onUpdateStatus, stopPolling, startStatusPolling, startDetailPolling]);

  const handleStopSimulation = useCallback(async () => {
    if (!simulationId) return;
    setIsStopping(true);
    onAddLog('Stopping simulation...');

    try {
      const res = await stopSimulation({ simulation_id: simulationId } as any);
      if (!mountedRef.current) return;
      if (res.success) {
        onAddLog('Simulation stopped');
        setPhase(2);
        stopPolling();
        onUpdateStatus('completed');
      } else {
        onAddLog(`Stop failed: ${(res as any).error || 'Unknown error'}`);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        onAddLog(`Stop error: ${err.message}`);
      }
    } finally {
      if (mountedRef.current) {
        setIsStopping(false);
      }
    }
  }, [simulationId, onAddLog, onUpdateStatus, stopPolling]);

  /* ---------- Generate report ---------- */

  const handleGenerateReport = useCallback(async () => {
    if (!simulationId) {
      onAddLog('Error: missing simulationId');
      return;
    }
    if (isGeneratingReport) {
      onAddLog('Report generation already in progress...');
      return;
    }

    setIsGeneratingReport(true);
    onAddLog('Starting report generation...');

    try {
      const res = await generateReport({
        simulation_id: simulationId,
        force_regenerate: true,
      } as any);

      if (res.success && res.data) {
        const reportId = (res.data as any).report_id;
        onAddLog(`Report generation started: ${reportId}`);
        navigate(`/report/${reportId}`);
      } else {
        onAddLog(`Report generation failed: ${(res as any).error || 'Unknown error'}`);
        setIsGeneratingReport(false);
      }
    } catch (err: any) {
      onAddLog(`Report generation error: ${err.message}`);
      setIsGeneratingReport(false);
    }
  }, [simulationId, isGeneratingReport, onAddLog, navigate]);

  /* ---------- Effects ---------- */

  // Auto-start on mount
  useEffect(() => {
    mountedRef.current = true;
    onAddLog('Step3 simulation initialization');
    if (simulationId) {
      doStartSimulation();
    }

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll system logs
  useEffect(() => {
    if (logContentRef.current) {
      logContentRef.current.scrollTop = logContentRef.current.scrollHeight;
    }
  }, [systemLogs]);

  /* ---------- Render ---------- */

  const totalRoundsDisplay = String(runStatus.total_rounds || maxRounds || '-');

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans">
      {/* ---- Top Control Bar ---- */}
      <div className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-brand-100 bg-white px-6">
        <div className="flex gap-3">
          <PlatformStatusCard
            label="Info Plaza"
            icon={<TwitterIcon />}
            active={!!runStatus.twitter_running}
            completed={!!runStatus.twitter_completed}
            currentRound={runStatus.twitter_current_round || 0}
            totalRounds={totalRoundsDisplay}
            elapsed={twitterElapsedTime}
            actsCount={runStatus.twitter_actions_count || 0}
            availableActions={TWITTER_ACTIONS}
          />
          <PlatformStatusCard
            label="Topic Community"
            icon={<RedditIcon />}
            active={!!runStatus.reddit_running}
            completed={!!runStatus.reddit_completed}
            currentRound={runStatus.reddit_current_round || 0}
            totalRounds={totalRoundsDisplay}
            elapsed={redditElapsedTime}
            actsCount={runStatus.reddit_actions_count || 0}
            availableActions={REDDIT_ACTIONS}
          />
        </div>

        <button
          disabled={phase !== 2 || isGeneratingReport}
          onClick={handleGenerateReport}
          className={cx(
            'inline-flex items-center gap-2 rounded bg-brand-900 px-5 py-2.5 text-[13px] font-semibold uppercase tracking-wide text-white transition-all',
            'hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-30',
          )}
        >
          {isGeneratingReport && (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          )}
          {isGeneratingReport ? 'Starting...' : 'Generate Report'}
          {!isGeneratingReport && <span aria-hidden="true">&rarr;</span>}
        </button>
      </div>

      {/* ---- Main Content: Timeline ---- */}
      <div ref={scrollContainerRef} className="relative flex-1 overflow-y-auto bg-white">
        {/* Timeline header stats */}
        {allActions.length > 0 && (
          <div className="sticky top-0 z-[5] flex justify-center border-b border-brand-100 bg-white/90 px-6 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-4 rounded-full bg-brand-50 px-3 py-1 text-[11px] text-brand-500">
              <span className="font-semibold text-brand-700">
                TOTAL EVENTS: <span className="font-mono">{allActions.length}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-brand-800">
                  <TwitterIcon size={12} />
                  <span className="font-mono">{twitterActionsCount}</span>
                </span>
                <span className="text-brand-300">/</span>
                <span className="flex items-center gap-1 text-brand-800">
                  <RedditIcon size={12} />
                  <span className="font-mono">{redditActionsCount}</span>
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Timeline feed */}
        <div className="relative mx-auto min-h-full max-w-[900px] py-6">
          {/* Central axis */}
          <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-brand-200" />

          {/* Show older actions button */}
          {allActions.length > visibleCount && (
            <div className="relative z-[3] mb-4 flex justify-center">
              <button
                onClick={() => setVisibleCount((c) => Math.min(c + 50, allActions.length))}
                className="rounded-full border border-brand-200 bg-white px-4 py-1.5 text-[11px] font-semibold text-brand-600 shadow-sm transition-all hover:bg-brand-50"
              >
                Show {Math.min(50, allActions.length - visibleCount)} older events
                <span className="ml-1 text-brand-400">({allActions.length - visibleCount} hidden)</span>
              </button>
            </div>
          )}

          {allActions.slice(-visibleCount).map((action) => (
            <div
              key={action._uniqueId}
              className={cx(
                'relative mb-8 flex w-full',
                action.platform === 'twitter' && 'justify-start pr-[50%]',
                action.platform === 'reddit' && 'justify-end pl-[50%]',
                action.platform !== 'twitter' && action.platform !== 'reddit' && 'justify-center',
              )}
            >
              {/* Marker dot on axis */}
              <div
                className={cx(
                  'absolute left-1/2 top-6 z-[2] flex h-2.5 w-2.5 -translate-x-1/2 items-center justify-center rounded-full bg-white',
                  action.platform === 'twitter' ? 'border border-brand-800' : 'border border-brand-800',
                )}
              >
                <div className="h-1 w-1 rounded-full bg-brand-800" />
              </div>

              {/* Card */}
              <div
                className={cx(
                  'relative rounded border border-brand-100 bg-white p-4 shadow-sm transition-all hover:border-brand-200 hover:shadow-md',
                  action.platform === 'twitter' && 'ml-auto mr-8 w-[calc(100%-48px)]',
                  action.platform === 'reddit' && 'ml-8 mr-auto w-[calc(100%-48px)]',
                  action.platform !== 'twitter' && action.platform !== 'reddit' && 'w-[calc(100%-48px)]',
                )}
              >
                {/* Card header */}
                <div className="mb-3 flex items-start justify-between border-b border-brand-50 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-xs font-bold uppercase text-white">
                      {(action.agent_name || 'A')[0]}
                    </div>
                    <span className="text-[13px] font-semibold text-brand-900">
                      {action.agent_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-brand-400">
                      {action.platform === 'twitter' ? (
                        <TwitterIcon size={12} />
                      ) : (
                        <RedditIcon size={12} />
                      )}
                    </span>
                    <span
                      className={cx(
                        'rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                        getActionBadgeClass(action.action_type),
                      )}
                    >
                      {getActionLabel(action.action_type)}
                    </span>
                  </div>
                </div>

                {/* Card body */}
                <ActionCardBody action={action} />

                {/* Card footer */}
                <div className="mt-3 flex justify-end font-mono text-[10px] text-brand-300">
                  R{action.round_num} &bull; {formatActionTime(action.timestamp)}
                </div>
              </div>
            </div>
          ))}

          {/* Waiting state when no actions yet */}
          {allActions.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="h-8 w-8 animate-ping rounded-full border border-brand-200" />
              <span className="text-xs uppercase tracking-widest text-brand-300">
                Waiting for agent actions...
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ---- Bottom System Logs ---- */}
      <div className="shrink-0 border-t border-brand-800 bg-brand-950 p-4 font-mono text-brand-200">
        <div className="mb-2 flex items-center justify-between border-b border-brand-800 pb-2 text-[10px] text-brand-500">
          <span>SIMULATION MONITOR</span>
          <span>{simulationId || 'NO_SIMULATION'}</span>
        </div>
        <div
          ref={logContentRef}
          className="flex h-[100px] flex-col gap-1 overflow-y-auto pr-1 [&::-webkit-scrollbar-thumb]:rounded-sm [&::-webkit-scrollbar-thumb]:bg-brand-700 [&::-webkit-scrollbar]:w-1"
        >
          {systemLogs.map((log, idx) => (
            <div key={idx} className="flex gap-3 text-[11px] leading-relaxed">
              <span className="shrink-0 text-brand-600" style={{ minWidth: 75 }}>
                {log.timestamp}
              </span>
              <span className="break-all text-brand-300">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
