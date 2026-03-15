import { useState, useEffect, useRef, useCallback } from 'react';
import type { GraphNode, GraphEdge } from '@/api/types';
import { cx } from '@/utils/cx';
import { useGraph, type GraphData, type SelectedItem } from './use-graph';

interface GraphPanelProps {
  graphData: GraphData | null;
  loading?: boolean;
  currentPhase?: number;
  isSimulating?: boolean;
  onRefresh?: () => void;
  onToggleMaximize?: () => void;
}

function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

export function GraphPanel({
  graphData,
  loading = false,
  currentPhase = 0,
  isSimulating = false,
  onRefresh,
  onToggleMaximize,
}: GraphPanelProps) {
  const {
    svgRef,
    containerRef,
    selectedItem,
    setSelectedItem,
    entityTypes,
    showEdgeLabels,
    setShowEdgeLabels,
    closeDetail,
    renderGraph,
  } = useGraph(graphData);

  const [expandedSelfLoops, setExpandedSelfLoops] = useState<Set<string | number>>(new Set());
  const [showSimFinishedHint, setShowSimFinishedHint] = useState(false);
  const wasSimulatingRef = useRef(false);

  useEffect(() => {
    if (wasSimulatingRef.current && !isSimulating) {
      setShowSimFinishedHint(true);
    }
    wasSimulatingRef.current = isSimulating;
  }, [isSimulating]);

  const toggleSelfLoop = useCallback((id: string | number) => {
    setExpandedSelfLoops((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCloseDetail = useCallback(() => {
    closeDetail();
    setExpandedSelfLoops(new Set());
  }, [closeDetail]);

  const showBuildingHint = currentPhase === 1 || isSimulating;
  const hasGraphData = graphData && graphData.nodes && graphData.nodes.length > 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-brand-50" style={{
      backgroundImage: 'radial-gradient(rgba(0,0,0,0.08) 1.5px, transparent 1.5px)',
      backgroundSize: '24px 24px',
    }}>
      {/* Panel Header */}
      <div className="pointer-events-none absolute top-0 right-0 left-0 z-10 flex items-center justify-between px-5 py-4" style={{
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(255,255,255,0))',
      }}>
        <span className="pointer-events-auto text-sm font-semibold text-brand-950">
          Graph Relationship Visualization
        </span>
        <div className="pointer-events-auto flex items-center gap-2.5">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-md border border-brand-200 bg-white px-3 text-xs text-brand-600 shadow-sm transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-950 disabled:opacity-50"
          >
            <span className={cx('inline-block text-base', loading && 'animate-spin')}>↻</span>
            <span>Refresh</span>
          </button>
          <button
            onClick={onToggleMaximize}
            className="flex h-8 items-center justify-center rounded-md border border-brand-200 bg-white px-3 text-base text-brand-600 shadow-sm transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-950"
            title="Maximize / Restore"
          >
            ⛶
          </button>
        </div>
      </div>

      {/* Graph Container */}
      <div ref={containerRef} className="h-full w-full">
        {hasGraphData ? (
          <div className="relative h-full w-full">
            <svg ref={svgRef} className="block h-full w-full" />

            {/* Building / Simulating Hint */}
            {showBuildingHint && (
              <div className="absolute bottom-40 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/10 bg-black/65 px-5 py-2.5 text-sm font-medium tracking-wide text-white shadow-lg backdrop-blur-sm">
                <div className="animate-pulse">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px] text-green-500">
                    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-4.04z" />
                    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-4.04z" />
                  </svg>
                </div>
                {isSimulating ? 'GraphRAG memory updating in real-time' : 'Updating in real-time...'}
              </div>
            )}

            {/* Simulation Finished Hint */}
            {showSimFinishedHint && (
              <div className="absolute bottom-40 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/10 bg-black/65 px-5 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>Some content still processing. Refresh graph manually.</span>
                <button
                  onClick={() => setShowSimFinishedHint(false)}
                  className="ml-2 flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-all hover:scale-110 hover:bg-white/35"
                  title="Dismiss"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}

            {/* Detail Panel (right side) */}
            {selectedItem && (
              <div className="absolute top-[60px] right-5 z-20 flex max-h-[calc(100%-100px)] w-80 flex-col overflow-hidden rounded-xl border border-brand-100 bg-white text-sm shadow-lg">
                {/* Detail Header */}
                <div className="flex flex-shrink-0 items-center justify-between border-b border-brand-100 bg-brand-50 px-4 py-3.5">
                  <span className="text-sm font-semibold text-brand-950">
                    {selectedItem.type === 'node' ? 'Node Details' : 'Relationship'}
                  </span>
                  {selectedItem.type === 'node' && (
                    <span
                      className="ml-auto mr-3 rounded-full px-2.5 py-1 text-[11px] font-medium text-white"
                      style={{ background: selectedItem.color }}
                    >
                      {selectedItem.entityType}
                    </span>
                  )}
                  <button
                    onClick={handleCloseDetail}
                    className="text-xl leading-none text-brand-400 transition-colors hover:text-brand-950"
                  >
                    &times;
                  </button>
                </div>

                {/* Detail Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {selectedItem.type === 'node' ? (
                    <NodeDetail data={selectedItem.data} />
                  ) : (
                    <EdgeDetail
                      data={selectedItem.data}
                      expandedSelfLoops={expandedSelfLoops}
                      onToggleSelfLoop={toggleSelfLoop}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ) : loading ? (
          /* Loading State */
          <div className="absolute inset-0 flex flex-col items-center justify-center text-brand-400">
            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600" />
            <p>Loading graph data...</p>
          </div>
        ) : (
          /* Empty / Waiting State */
          <div className="absolute inset-0 flex flex-col items-center justify-center text-brand-400">
            <div className="mb-4 text-5xl opacity-20">❖</div>
            <p>Waiting for ontology generation...</p>
          </div>
        )}
      </div>

      {/* Legend Bar (bottom left) */}
      {hasGraphData && entityTypes.length > 0 && (
        <div className="absolute bottom-6 left-6 z-10 rounded-lg border border-brand-100 bg-white/95 px-4 py-3 shadow-md">
          <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-600">
            Entity Types
          </span>
          <div className="flex max-w-xs flex-wrap gap-x-4 gap-y-2.5">
            {entityTypes.map((t) => (
              <div key={t.name} className="flex items-center gap-1.5 text-xs text-brand-600">
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ background: t.color }}
                />
                <span className="whitespace-nowrap">{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edge Labels Toggle (top right, below header) */}
      {hasGraphData && (
        <div className="absolute top-[60px] right-5 z-10 flex items-center gap-2.5 rounded-full border border-brand-200 bg-white px-3.5 py-2 shadow-sm">
          {/* Only show if no detail panel is open (detail panel takes this position) */}
          {!selectedItem && (
            <>
              <label className="relative inline-block h-[22px] w-10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showEdgeLabels}
                  onChange={(e) => setShowEdgeLabels(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="absolute inset-0 rounded-full bg-brand-200 transition-colors peer-checked:bg-brand-600" />
                <span className="absolute bottom-[3px] left-[3px] h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-[18px]" />
              </label>
              <span className="text-xs text-brand-600">Show Edge Labels</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Node Detail Sub-component ──────────────────────────────────── */

function NodeDetail({ data }: { data: GraphNode }) {
  return (
    <div>
      <DetailRow label="Name:" value={data.name} />
      <DetailRow label="UUID:" value={data.uuid} mono />
      {data.created_at && (
        <DetailRow label="Created:" value={formatDateTime(data.created_at)} />
      )}

      {/* Properties */}
      {data.attributes && Object.keys(data.attributes).length > 0 && (
        <div className="mt-4 border-t border-brand-100 pt-3.5">
          <div className="mb-2.5 text-xs font-semibold text-brand-600">Properties:</div>
          <div className="flex flex-col gap-2">
            {Object.entries(data.attributes).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="min-w-[90px] text-xs font-medium text-brand-400">{key}:</span>
                <span className="flex-1 text-xs text-brand-950">{String(value ?? 'None')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {data.summary && (
        <div className="mt-4 border-t border-brand-100 pt-3.5">
          <div className="mb-2.5 text-xs font-semibold text-brand-600">Summary:</div>
          <div className="text-xs leading-relaxed text-brand-700">{data.summary}</div>
        </div>
      )}

      {/* Labels */}
      {data.labels && data.labels.length > 0 && (
        <div className="mt-4 border-t border-brand-100 pt-3.5">
          <div className="mb-2.5 text-xs font-semibold text-brand-600">Labels:</div>
          <div className="flex flex-wrap gap-2">
            {data.labels.map((label) => (
              <span
                key={label}
                className="inline-block rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] text-brand-600"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Edge Detail Sub-component ──────────────────────────────────── */

interface EdgeDetailProps {
  data: any;
  expandedSelfLoops: Set<string | number>;
  onToggleSelfLoop: (id: string | number) => void;
}

function EdgeDetail({ data, expandedSelfLoops, onToggleSelfLoop }: EdgeDetailProps) {
  if (data.isSelfLoopGroup) {
    return (
      <div>
        {/* Self-loop group header */}
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-gradient-to-br from-green-50 to-lime-50 p-3 text-sm font-medium text-brand-950">
          <span className="break-words">{data.source_name} - Self Relations</span>
          <span className="ml-auto whitespace-nowrap rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-brand-600">
            {data.selfLoopCount} items
          </span>
        </div>

        {/* Self-loop list */}
        <div className="flex flex-col gap-2.5">
          {(data.selfLoopEdges || []).map((loop: any, idx: number) => {
            const loopId = loop.uuid || idx;
            const isExpanded = expandedSelfLoops.has(loopId);
            return (
              <div
                key={loopId}
                className={cx(
                  'rounded-lg border border-brand-100 bg-brand-50',
                  isExpanded && 'border-brand-200'
                )}
              >
                <button
                  onClick={() => onToggleSelfLoop(loopId)}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-t-lg px-3 py-2.5 text-left transition-colors hover:bg-brand-100',
                    isExpanded ? 'bg-brand-200/50' : 'bg-brand-100/50'
                  )}
                >
                  <span className="rounded bg-brand-200 px-1.5 py-0.5 text-[10px] font-semibold text-brand-500">
                    #{idx + 1}
                  </span>
                  <span className="flex-1 text-xs font-medium text-brand-950">
                    {loop.name || loop.fact_type || 'RELATED'}
                  </span>
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-200 text-sm font-semibold text-brand-500 transition-all">
                    {isExpanded ? '−' : '+'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-brand-100 p-3">
                    {loop.uuid && (
                      <DetailRow label="UUID:" value={loop.uuid} mono small />
                    )}
                    {loop.fact && (
                      <DetailRow label="Fact:" value={loop.fact} small fact />
                    )}
                    {loop.fact_type && (
                      <DetailRow label="Type:" value={loop.fact_type} small />
                    )}
                    {loop.created_at && (
                      <DetailRow label="Created:" value={formatDateTime(loop.created_at)} small />
                    )}
                    {loop.episodes && loop.episodes.length > 0 && (
                      <div className="mt-2">
                        <span className="text-[11px] font-medium text-brand-400">Episodes:</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {loop.episodes.map((ep: string) => (
                            <span
                              key={ep}
                              className="inline-block break-all rounded-md border border-brand-100 bg-brand-50 px-1.5 py-0.5 font-mono text-[9px] text-brand-600"
                            >
                              {ep}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Normal edge detail
  return (
    <div>
      {/* Edge relation header */}
      <div className="mb-4 break-words rounded-lg bg-brand-50 p-3 text-sm font-medium leading-relaxed text-brand-950">
        {data.source_name} → {data.name || 'RELATED_TO'} → {data.target_name}
      </div>

      <DetailRow label="UUID:" value={data.uuid} mono />
      <DetailRow label="Label:" value={data.name || 'RELATED_TO'} />
      <DetailRow label="Type:" value={data.fact_type || 'Unknown'} />
      {data.fact && <DetailRow label="Fact:" value={data.fact} fact />}

      {/* Episodes */}
      {data.episodes && data.episodes.length > 0 && (
        <div className="mt-4 border-t border-brand-100 pt-3.5">
          <div className="mb-2.5 text-xs font-semibold text-brand-600">Episodes:</div>
          <div className="flex flex-col gap-1.5">
            {data.episodes.map((ep: string) => (
              <span
                key={ep}
                className="inline-block break-all rounded-md border border-brand-100 bg-brand-50 px-2.5 py-1.5 font-mono text-[10px] text-brand-600"
              >
                {ep}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.created_at && (
        <DetailRow label="Created:" value={formatDateTime(data.created_at)} />
      )}
      {data.valid_at && (
        <DetailRow label="Valid From:" value={formatDateTime(data.valid_at)} />
      )}
    </div>
  );
}

/* ─── Shared Detail Row ──────────────────────────────────────────── */

function DetailRow({
  label,
  value,
  mono,
  fact,
  small,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  fact?: boolean;
  small?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={cx('mb-3 flex flex-wrap gap-1', small && 'mb-2')}>
      <span className={cx(
        'font-medium text-brand-400',
        small ? 'min-w-[60px] text-[11px]' : 'min-w-[80px] text-xs'
      )}>
        {label}
      </span>
      <span className={cx(
        'flex-1 break-words text-brand-950',
        small ? 'text-xs' : 'text-xs',
        mono && 'font-mono text-[11px] text-brand-500',
        fact && 'leading-relaxed text-brand-700'
      )}>
        {value}
      </span>
    </div>
  );
}
