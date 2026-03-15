import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSimulationHistory } from '../../api/simulation';
import type { HistorySimulation } from '../../api/types';
import { cx } from '../../utils/cx';

const CARDS_PER_ROW = 4;
const CARD_WIDTH = 280;
const CARD_HEIGHT = 280;
const CARD_GAP = 24;

function formatDate(dateStr?: string): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-CA');
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatSimulationId(id: string): string {
  return `SIM_${id.substring(0, 5).toUpperCase()}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function getFileTypeLabel(filename: string): string {
  const ext = filename.split('.').pop()?.toUpperCase() || 'FILE';
  return ext;
}

function getProgressClass(sim: HistorySimulation): string {
  if (sim.report_id) return 'completed';
  if (sim.current_round && sim.current_round > 0) return 'in-progress';
  return 'not-started';
}

export function HistoryDatabase() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<HistorySimulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveringCard, setHoveringCard] = useState<number | null>(null);
  const [selectedProject, setSelectedProject] = useState<HistorySimulation | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSimulationHistory(20);
      const d = res.data;
      setProjects(Array.isArray(d) ? d : d?.simulations || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio > 0.4) {
            setIsExpanded(true);
          } else {
            setIsExpanded(false);
          }
        });
      },
      { threshold: [0.4, 0.6, 0.8], rootMargin: '0px 0px -150px 0px' }
    );
    obs.observe(el);
    observerRef.current = obs;
    return () => {
      obs.disconnect();
    };
  }, [projects.length]);

  const rowCount = Math.ceil(projects.length / CARDS_PER_ROW);
  const containerHeight = isExpanded
    ? rowCount * (CARD_HEIGHT + CARD_GAP) + 80
    : Math.min(CARD_HEIGHT + 80, 360);

  function getCardStyle(index: number): React.CSSProperties {
    if (isExpanded) {
      const row = Math.floor(index / CARDS_PER_ROW);
      const col = index % CARDS_PER_ROW;
      const itemsInRow = Math.min(CARDS_PER_ROW, projects.length - row * CARDS_PER_ROW);
      const totalWidth = itemsInRow * CARD_WIDTH + (itemsInRow - 1) * CARD_GAP;
      const startX = (containerRef.current?.clientWidth || 1200) / 2 - totalWidth / 2;
      const x = startX + col * (CARD_WIDTH + CARD_GAP);
      const y = row * (CARD_HEIGHT + CARD_GAP) + 40;
      return {
        position: 'absolute',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        transform: `translate(${x}px, ${y}px) rotate(0deg) scale(1)`,
        opacity: 1,
        transition: 'all 700ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        zIndex: projects.length - index,
      };
    }

    const centerX = (containerRef.current?.clientWidth || 1200) / 2 - CARD_WIDTH / 2;
    const offset = index * 30;
    const rotation = (index - projects.length / 2) * 3;
    const scale = 1 - index * 0.02;
    return {
      position: 'absolute',
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      transform: `translate(${centerX + offset}px, 40px) rotate(${rotation}deg) scale(${scale})`,
      opacity: Math.max(0.3, 1 - index * 0.1),
      transition: 'all 700ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      zIndex: projects.length - index,
    };
  }

  return (
    <div
      ref={containerRef}
      className={cx('relative w-full overflow-hidden', projects.length === 0 && 'min-h-[100px]')}
      style={{ minHeight: containerHeight }}
    >
      <div className="mb-4 flex items-center gap-3 px-4">
        <div className="h-px flex-1 bg-brand-200" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-400">
          History Database
        </h2>
        <div className="h-px flex-1 bg-brand-200" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
        </div>
      ) : projects.length === 0 ? (
        <div className="py-12 text-center text-sm text-brand-400">
          No simulation history yet
        </div>
      ) : (
        <div className="relative">
          {projects.map((project, index) => (
            <div
              key={project.simulation_id}
              style={getCardStyle(index)}
              className={cx(
                'cursor-pointer rounded-2xl bg-white shadow-md',
                'border border-brand-100 p-4',
                'hover:shadow-lg hover:border-brand-300',
                hoveringCard === index && 'ring-2 ring-brand-500/30'
              )}
              onMouseEnter={() => setHoveringCard(index)}
              onMouseLeave={() => setHoveringCard(null)}
              onClick={() => setSelectedProject(project)}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-brand-600">
                  {formatSimulationId(project.simulation_id)}
                </span>
                <div className="flex gap-1 text-xs">
                  {project.project_id && <span className="text-brand-400" title="Graph available">&#9671;</span>}
                  {project.simulation_id && <span className="text-brand-500" title="Env available">&#9672;</span>}
                  {project.report_id && <span className="text-brand-600" title="Report available">&#9670;</span>}
                </div>
              </div>

              <div className="mb-2 space-y-1">
                {(project.files || []).slice(0, 3).map((f, fi) => (
                  <div key={fi} className="flex items-center gap-1.5">
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">
                      {getFileTypeLabel(f.filename)}
                    </span>
                    <span className="truncate text-xs text-brand-800">
                      {f.filename}
                    </span>
                  </div>
                ))}
                {(project.files || []).length > 3 && (
                  <span className="text-[10px] text-brand-400">
                    +{(project.files || []).length - 3} more
                  </span>
                )}
              </div>

              <p className="mb-3 text-xs leading-relaxed text-brand-700">
                {truncateText(project.simulation_requirement || '', 55)}
              </p>

              <div className="mt-auto flex items-center justify-between text-[10px] text-brand-400">
                <span>{formatDate(project.created_at)} {formatTime(project.created_at)}</span>
                <span
                  className={cx(
                    'rounded px-1.5 py-0.5 font-medium',
                    getProgressClass(project) === 'completed' && 'bg-green-50 text-green-600',
                    getProgressClass(project) === 'in-progress' && 'bg-brand-50 text-brand-600',
                    getProgressClass(project) === 'not-started' && 'bg-brand-50 text-brand-400'
                  )}
                >
                  {project.current_round && project.total_rounds
                    ? `${project.current_round}/${project.total_rounds}`
                    : getProgressClass(project) === 'completed'
                    ? 'Complete'
                    : 'Not started'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {selectedProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 backdrop-blur-sm"
          onClick={() => setSelectedProject(null)}
        >
          <div
            className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-mono text-sm font-bold text-brand-600">
                  {formatSimulationId(selectedProject.simulation_id)}
                </h3>
                <span
                  className={cx(
                    'mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium',
                    getProgressClass(selectedProject) === 'completed' && 'bg-green-50 text-green-600',
                    getProgressClass(selectedProject) === 'in-progress' && 'bg-brand-50 text-brand-600',
                    getProgressClass(selectedProject) === 'not-started' && 'bg-brand-50 text-brand-400'
                  )}
                >
                  {getProgressClass(selectedProject).replace('-', ' ')}
                </span>
              </div>
              <button
                onClick={() => setSelectedProject(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-brand-400 hover:bg-brand-50 hover:text-brand-600"
              >
                &times;
              </button>
            </div>

            <div className="mb-4">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-400">
                Simulation Requirement
              </h4>
              <p className="text-sm leading-relaxed text-brand-800">
                {selectedProject.simulation_requirement || 'N/A'}
              </p>
            </div>

            <div className="mb-4">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-400">
                Files
              </h4>
              <div className="space-y-1">
                {(selectedProject.files || []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">
                      {getFileTypeLabel(f.filename)}
                    </span>
                    <span className="text-sm text-brand-800">{f.filename}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4 h-px bg-brand-100" />

            <div className="flex flex-wrap gap-2">
              {selectedProject.project_id && (
                <button
                  onClick={() => {
                    setSelectedProject(null);
                    navigate(`/process/${selectedProject.project_id}`);
                  }}
                  className="rounded-[5px] bg-brand-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-brand-500"
                >
                  Step 1: Graph
                </button>
              )}
              {selectedProject.simulation_id && (
                <button
                  onClick={() => {
                    setSelectedProject(null);
                    navigate(`/simulation/${selectedProject.simulation_id}`);
                  }}
                  className="rounded-[5px] border border-brand-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-brand-600 hover:bg-brand-50"
                >
                  Step 2: Environment
                </button>
              )}
              {selectedProject.report_id && (
                <button
                  onClick={() => {
                    setSelectedProject(null);
                    navigate(`/report/${selectedProject.report_id}`);
                  }}
                  className="rounded-[5px] border border-brand-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-brand-600 hover:bg-brand-50"
                >
                  Step 4: Report
                </button>
              )}
            </div>

            <p className="mt-3 text-[10px] text-brand-400">
              Steps 3 and 5 require live execution and cannot be replayed from history.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
