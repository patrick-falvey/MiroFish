import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSimulation } from '@/api/simulation';
import type { LogEntry } from '@/components/shared/log-viewer';
import { cx } from '@/utils/cx';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OntologyAttribute {
  name: string;
  type?: string;
  description?: string;
}

interface OntologyEntityType {
  name: string;
  description?: string;
  attributes?: OntologyAttribute[];
  examples?: string[];
  [key: string]: unknown;
}

interface OntologyEdgeType {
  name: string;
  description?: string;
  attributes?: OntologyAttribute[];
  source_targets?: { source: string; target: string }[];
  [key: string]: unknown;
}

interface SelectedItem {
  name: string;
  description?: string;
  itemType: 'entity' | 'relation';
  attributes?: OntologyAttribute[];
  examples?: string[];
  source_targets?: { source: string; target: string }[];
  [key: string]: unknown;
}

interface Step1Props {
  currentPhase: number;
  projectData: {
    project_id: string;
    graph_id?: string;
    ontology?: {
      entity_types?: OntologyEntityType[];
      edge_types?: OntologyEdgeType[];
      relation_types?: OntologyEdgeType[];
    };
  } | null;
  ontologyProgress: { message: string } | null;
  buildProgress: { progress: number; message?: string } | null;
  graphData: {
    node_count?: number;
    edge_count?: number;
    nodes?: unknown[];
    edges?: unknown[];
  } | null;
  systemLogs: LogEntry[];
  onNextStep?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Badge({ status }: { status: 'completed' | 'processing' | 'pending' | 'accent'; label: string }) {
  return null; // rendered inline below for flexibility
}

function StepBadge({
  phase,
  stepIndex,
  progressLabel,
}: {
  phase: number;
  stepIndex: number;
  progressLabel?: string;
}) {
  if (phase > stepIndex) {
    return (
      <span className="rounded bg-green-50 px-2 py-1 text-[10px] font-semibold uppercase text-green-700">
        Completed
      </span>
    );
  }
  if (phase === stepIndex) {
    return (
      <span className="rounded bg-brand-600 px-2 py-1 text-[10px] font-semibold uppercase text-white">
        {progressLabel ?? 'Processing'}
      </span>
    );
  }
  return (
    <span className="rounded bg-neutral-100 px-2 py-1 text-[10px] font-semibold uppercase text-neutral-400">
      Pending
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Step1GraphBuild({
  currentPhase,
  projectData,
  ontologyProgress,
  buildProgress,
  graphData,
  systemLogs,
}: Step1Props) {
  const navigate = useNavigate();
  const [creatingSimulation, setCreatingSimulation] = useState(false);
  const [selectedOntologyItem, setSelectedOntologyItem] = useState<SelectedItem | null>(null);
  const logContentRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll logs */
  useEffect(() => {
    if (logContentRef.current) {
      logContentRef.current.scrollTop = logContentRef.current.scrollHeight;
    }
  }, [systemLogs.length]);

  /* Graph stats (derived) */
  const graphStats = {
    nodes: graphData?.node_count || graphData?.nodes?.length || 0,
    edges: graphData?.edge_count || graphData?.edges?.length || 0,
    types: projectData?.ontology?.entity_types?.length || 0,
  };

  /* Create simulation and navigate */
  const handleEnterEnvSetup = async () => {
    if (!projectData?.project_id || !projectData?.graph_id) {
      console.error('Missing project or graph information');
      return;
    }

    setCreatingSimulation(true);

    try {
      const res = await createSimulation({
        project_id: projectData.project_id,
        graph_id: projectData.graph_id,
        enable_twitter: true,
        enable_reddit: true,
      });

      if (res.success && res.data?.simulation_id) {
        navigate(`/simulation/${res.data.simulation_id}`);
      } else {
        console.error('Failed to create simulation:', res.error);
        alert('Failed to create simulation: ' + (res.error || 'Unknown error'));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error creating simulation:', err);
      alert('Error creating simulation: ' + message);
    } finally {
      setCreatingSimulation(false);
    }
  };

  const selectOntologyItem = (item: OntologyEntityType | OntologyEdgeType, type: 'entity' | 'relation') => {
    setSelectedOntologyItem({ ...item, itemType: type } as SelectedItem);
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex h-full flex-col overflow-hidden bg-neutral-50">
      {/* Scrollable step cards */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
        {/* ============================================================ */}
        {/* Step 01 - Ontology Generation                                */}
        {/* ============================================================ */}
        <div
          className={cx(
            'relative rounded-lg border bg-white p-5 shadow-sm transition-all',
            currentPhase === 0 && 'border-brand-600 shadow-md shadow-brand-600/[.08]',
            currentPhase > 0 && 'border-neutral-200',
            currentPhase < 0 && 'border-neutral-200',
          )}
        >
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={cx(
                  'font-mono text-xl font-bold',
                  currentPhase >= 0 ? 'text-neutral-900' : 'text-neutral-300',
                )}
              >
                01
              </span>
              <span className="text-sm font-semibold tracking-wide">Ontology Generation</span>
            </div>
            <StepBadge phase={currentPhase} stepIndex={0} progressLabel="Generating" />
          </div>

          {/* Card content */}
          <div>
            <p className="mb-2 font-mono text-[10px] text-neutral-400">
              POST /api/graph/ontology/generate
            </p>
            <p className="mb-4 text-xs leading-relaxed text-neutral-500">
              LLM analyses document content and simulation requirements to extract real seeds and
              automatically generate an appropriate ontology structure.
            </p>

            {/* Progress spinner */}
            {currentPhase === 0 && ontologyProgress && (
              <div className="mb-3 flex items-center gap-2.5 text-xs text-brand-600">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
                <span>{ontologyProgress.message || 'Analysing documents...'}</span>
              </div>
            )}

            {/* Detail overlay */}
            {selectedOntologyItem && (
              <div className="absolute inset-x-5 bottom-5 top-[60px] z-10 flex animate-in fade-in slide-in-from-bottom-1 flex-col overflow-hidden rounded-md border border-neutral-200 bg-white/[.98] shadow-lg backdrop-blur-sm">
                {/* Overlay header */}
                <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-sm bg-neutral-900 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      {selectedOntologyItem.itemType === 'entity' ? 'Entity' : 'Relation'}
                    </span>
                    <span className="font-mono text-sm font-bold">{selectedOntologyItem.name}</span>
                  </div>
                  <button
                    onClick={() => setSelectedOntologyItem(null)}
                    className="text-lg leading-none text-neutral-400 hover:text-neutral-700"
                  >
                    &times;
                  </button>
                </div>

                {/* Overlay body */}
                <div className="flex-1 overflow-y-auto p-4">
                  {selectedOntologyItem.description && (
                    <p className="mb-4 border-b border-dashed border-neutral-200 pb-3 text-xs leading-relaxed text-neutral-600">
                      {selectedOntologyItem.description}
                    </p>
                  )}

                  {/* Attributes */}
                  {selectedOntologyItem.attributes && selectedOntologyItem.attributes.length > 0 && (
                    <div className="mb-4">
                      <span className="mb-2 block text-[10px] font-semibold text-neutral-400">
                        ATTRIBUTES
                      </span>
                      <div className="flex flex-col gap-1.5">
                        {selectedOntologyItem.attributes.map((attr) => (
                          <div
                            key={attr.name}
                            className="flex flex-wrap items-baseline gap-1.5 rounded bg-neutral-50 p-1.5 text-[11px]"
                          >
                            <span className="font-mono font-semibold text-neutral-900">
                              {attr.name}
                            </span>
                            {attr.type && (
                              <span className="text-[10px] text-neutral-400">({attr.type})</span>
                            )}
                            {attr.description && (
                              <span className="min-w-[150px] flex-1 text-neutral-500">
                                {attr.description}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Examples (entity) */}
                  {selectedOntologyItem.examples && selectedOntologyItem.examples.length > 0 && (
                    <div className="mb-4">
                      <span className="mb-2 block text-[10px] font-semibold text-neutral-400">
                        EXAMPLES
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedOntologyItem.examples.map((ex) => (
                          <span
                            key={ex}
                            className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-500"
                          >
                            {ex}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Connections (relation) */}
                  {selectedOntologyItem.source_targets &&
                    selectedOntologyItem.source_targets.length > 0 && (
                      <div className="mb-4">
                        <span className="mb-2 block text-[10px] font-semibold text-neutral-400">
                          CONNECTIONS
                        </span>
                        <div className="flex flex-col gap-1.5">
                          {selectedOntologyItem.source_targets.map((conn, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 rounded bg-neutral-100 p-1.5 font-mono text-[11px]"
                            >
                              <span className="font-semibold text-neutral-700">{conn.source}</span>
                              <span className="text-neutral-300">{'->'}</span>
                              <span className="font-semibold text-neutral-700">{conn.target}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Entity type tags */}
            {projectData?.ontology?.entity_types && (
              <div
                className={cx(
                  'mt-3 transition-opacity',
                  selectedOntologyItem && 'pointer-events-none opacity-30',
                )}
              >
                <span className="mb-2 block text-[10px] font-semibold text-neutral-400">
                  GENERATED ENTITY TYPES
                </span>
                <div className="flex flex-wrap gap-2">
                  {projectData.ontology.entity_types.map((entity) => (
                    <button
                      key={entity.name}
                      onClick={() => selectOntologyItem(entity, 'entity')}
                      className="cursor-pointer rounded border border-neutral-200 bg-neutral-100 px-2.5 py-1 font-mono text-[11px] text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-200"
                    >
                      {entity.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Relation / edge type tags */}
            {(projectData?.ontology?.edge_types || projectData?.ontology?.relation_types) && (
              <div
                className={cx(
                  'mt-3 transition-opacity',
                  selectedOntologyItem && 'pointer-events-none opacity-30',
                )}
              >
                <span className="mb-2 block text-[10px] font-semibold text-neutral-400">
                  GENERATED RELATION TYPES
                </span>
                <div className="flex flex-wrap gap-2">
                  {(projectData.ontology.edge_types || projectData.ontology.relation_types || []).map((rel) => (
                    <button
                      key={rel.name}
                      onClick={() => selectOntologyItem(rel, 'relation')}
                      className="cursor-pointer rounded border border-neutral-200 bg-neutral-100 px-2.5 py-1 font-mono text-[11px] text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-200"
                    >
                      {rel.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* Step 02 - GraphRAG Build                                     */}
        {/* ============================================================ */}
        <div
          className={cx(
            'rounded-lg border bg-white p-5 shadow-sm transition-all',
            currentPhase === 1 && 'border-brand-600 shadow-md shadow-brand-600/[.08]',
            currentPhase !== 1 && 'border-neutral-200',
          )}
        >
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={cx(
                  'font-mono text-xl font-bold',
                  currentPhase >= 1 ? 'text-neutral-900' : 'text-neutral-300',
                )}
              >
                02
              </span>
              <span className="text-sm font-semibold tracking-wide">GraphRAG Build</span>
            </div>
            <StepBadge
              phase={currentPhase}
              stepIndex={1}
              progressLabel={`${buildProgress?.progress || 0}%`}
            />
          </div>

          <div>
            <p className="mb-2 font-mono text-[10px] text-neutral-400">POST /api/graph/build</p>
            <p className="mb-4 text-xs leading-relaxed text-neutral-500">
              Based on the generated ontology, documents are automatically chunked and Zep is called
              to build a knowledge graph, extract entities and relations, and form temporal memory
              with community summaries.
            </p>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3 rounded-md bg-neutral-50 p-4">
              <div className="text-center">
                <span className="block font-mono text-xl font-bold text-neutral-900">
                  {graphStats.nodes}
                </span>
                <span className="mt-1 block text-[9px] uppercase text-neutral-400">Nodes</span>
              </div>
              <div className="text-center">
                <span className="block font-mono text-xl font-bold text-neutral-900">
                  {graphStats.edges}
                </span>
                <span className="mt-1 block text-[9px] uppercase text-neutral-400">Edges</span>
              </div>
              <div className="text-center">
                <span className="block font-mono text-xl font-bold text-neutral-900">
                  {graphStats.types}
                </span>
                <span className="mt-1 block text-[9px] uppercase text-neutral-400">
                  Schema Types
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Step 03 - Build Complete                                      */}
        {/* ============================================================ */}
        <div
          className={cx(
            'rounded-lg border bg-white p-5 shadow-sm transition-all',
            currentPhase === 2 && 'border-brand-600 shadow-md shadow-brand-600/[.08]',
            currentPhase !== 2 && 'border-neutral-200',
          )}
        >
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={cx(
                  'font-mono text-xl font-bold',
                  currentPhase >= 2 ? 'text-neutral-900' : 'text-neutral-300',
                )}
              >
                03
              </span>
              <span className="text-sm font-semibold tracking-wide">Build Complete</span>
            </div>
            {currentPhase >= 2 && (
              <span className="rounded bg-brand-600 px-2 py-1 text-[10px] font-semibold uppercase text-white">
                Ready
              </span>
            )}
          </div>

          <div>
            <p className="mb-2 font-mono text-[10px] text-neutral-400">
              POST /api/simulation/create
            </p>
            <p className="mb-4 text-xs leading-relaxed text-neutral-500">
              Graph construction is complete. Proceed to the next step to set up the simulation
              environment.
            </p>

            <button
              disabled={currentPhase < 2 || creatingSimulation}
              onClick={handleEnterEnvSetup}
              className={cx(
                'w-full rounded bg-neutral-900 px-4 py-3.5 text-xs font-semibold text-white transition-opacity',
                'hover:opacity-80',
                'disabled:cursor-not-allowed disabled:bg-neutral-300',
              )}
            >
              {creatingSimulation ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-400 border-t-white" />
                  Creating...
                </span>
              ) : (
                'Enter Environment Setup \u27B6'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* System Logs Dashboard                                           */}
      {/* ============================================================== */}
      <div className="shrink-0 border-t border-neutral-800 bg-neutral-950 p-4 font-mono text-neutral-300">
        <div className="mb-2 flex items-center justify-between border-b border-neutral-800 pb-2 text-[10px] text-neutral-500">
          <span>SYSTEM DASHBOARD</span>
          <span>{projectData?.project_id || 'NO_PROJECT'}</span>
        </div>
        <div
          ref={logContentRef}
          className="flex h-20 flex-col gap-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-neutral-800"
        >
          {systemLogs.map((log, idx) => (
            <div key={idx} className="flex gap-3 text-[11px] leading-relaxed">
              <span className="shrink-0 text-neutral-600" style={{ minWidth: 75 }}>
                {log.timestamp}
              </span>
              <span className="break-all text-neutral-400">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
