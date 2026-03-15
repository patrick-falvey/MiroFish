import { useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePendingUpload } from '../stores/pending-upload';
import { HistoryDatabase } from '../components/shared/history-database';
import { cx } from '../utils/cx';

const ACCEPTED_EXTENSIONS = ['.pdf', '.md', '.txt'];

export function Home() {
  const navigate = useNavigate();
  const { setPendingUpload } = usePendingUpload();

  const [files, setFiles] = useState<File[]>([]);
  const [simulationRequirement, setSimulationRequirement] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = useMemo(
    () => files.length > 0 && simulationRequirement.trim().length > 0 && !loading,
    [files, simulationRequirement, loading]
  );

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const valid = Array.from(newFiles).filter((f) =>
      ACCEPTED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    if (valid.length > 0) {
      setFiles((prev) => [...prev, ...valid]);
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files);
      e.target.value = '';
    },
    [addFiles]
  );

  const startSimulation = useCallback(() => {
    if (!canSubmit) return;
    setLoading(true);
    setPendingUpload(files, simulationRequirement);
    navigate('/process/new');
  }, [canSubmit, files, simulationRequirement, setPendingUpload, navigate]);

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-brand-100 bg-white/80 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <img src="/assets/nclouds-icon.svg" alt="nClouds" className="h-7 w-7" />
          <span className="text-lg font-bold text-brand-950">nVision</span>
        </div>
        <span className="text-[11px] text-brand-400">by nClouds</span>
      </nav>

      <main className="mx-auto max-w-7xl px-6 pt-20">
        {/* Hero Section */}
        <section className="grid grid-cols-1 gap-12 py-16 lg:grid-cols-2">
          <div className="flex flex-col justify-center">
            <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-brand-50 px-3 py-1">
              <span className="text-xs font-medium text-brand-600">v1.0</span>
            </div>
            <h1 className="mb-4 text-4xl font-bold leading-tight text-brand-950">
              Upload Any Report,<br />
              <span style={{ color: 'var(--color-nclouds-teal)' }}>Simulate the Future</span>
            </h1>
            <p className="mb-6 text-base leading-relaxed text-brand-700">
              nVision is an AI-powered social simulation engine. Upload documents,
              define requirements, and watch as AI agents interact in realistic
              social environments.
            </p>
          </div>

          <div className="flex items-center justify-center">
            <div className="flex h-64 w-64 items-center justify-center rounded-2xl bg-brand-50">
              <img src="/assets/nclouds-icon.svg" alt="nVision" className="h-40 w-40" />
            </div>
          </div>
        </section>

        {/* Dashboard Section */}
        <section className="grid grid-cols-1 gap-8 pb-16 lg:grid-cols-2">
          {/* Left Panel - Info */}
          <div className="rounded-2xl bg-white p-6 shadow-md">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-xs font-medium text-brand-400">System Online</span>
            </div>
            <h2 className="mb-2 text-xl font-bold text-brand-950">Workflow</h2>
            <p className="mb-6 text-sm text-brand-600">
              Five-step simulation pipeline
            </p>

            <div className="space-y-3">
              {[
                { step: '01', title: 'Graph Build', desc: 'Upload documents and generate knowledge ontology' },
                { step: '02', title: 'Environment Setup', desc: 'Create agent profiles and configure simulation' },
                { step: '03', title: 'Simulation', desc: 'Run multi-agent social simulation' },
                { step: '04', title: 'Report', desc: 'Generate comprehensive analysis report' },
                { step: '05', title: 'Interaction', desc: 'Chat with agents and explore results' },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3 rounded-lg bg-brand-25 p-3">
                  <span className="shrink-0 rounded bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-brand-900">{item.title}</h3>
                    <p className="text-xs text-brand-600">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel - Console/Upload */}
          <div className="rounded-2xl border-2 border-brand-200 bg-white p-1">
            <div className="rounded-xl bg-brand-950 p-6">
              {/* Upload Zone */}
              <div className="mb-4">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-brand-300">
                  Upload Documents
                </label>
                <div
                  className={cx(
                    'flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors',
                    isDragOver
                      ? 'border-brand-400 bg-brand-900'
                      : 'border-brand-700 bg-brand-900/50 hover:border-brand-500'
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.md,.txt"
                    multiple
                    onChange={handleFileSelect}
                  />
                  <span className="mb-1 text-2xl text-brand-400">+</span>
                  <span className="text-xs text-brand-400">
                    Drop files here or click to browse
                  </span>
                  <span className="mt-1 text-[10px] text-brand-500">
                    PDF, Markdown, Text
                  </span>
                </div>

                {files.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {files.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded bg-brand-900 px-3 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-brand-700 px-1.5 py-0.5 text-[10px] font-bold text-brand-300">
                            {f.name.split('.').pop()?.toUpperCase()}
                          </span>
                          <span className="text-xs text-brand-200">{f.name}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(i);
                          }}
                          className="text-xs text-brand-500 hover:text-brand-300"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="my-4 h-px bg-brand-800" />

              {/* Simulation Requirement */}
              <div className="mb-4">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-brand-300">
                  Simulation Requirement
                </label>
                <textarea
                  value={simulationRequirement}
                  onChange={(e) => setSimulationRequirement(e.target.value)}
                  placeholder="Describe your simulation scenario..."
                  className="w-full resize-none rounded-lg border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-brand-100 placeholder-brand-500 focus:border-brand-500 focus:outline-none"
                  rows={4}
                  disabled={loading}
                />
              </div>

              {/* Start Button */}
              <button
                onClick={startSimulation}
                disabled={!canSubmit}
                className={cx(
                  'w-full rounded-[5px] py-3 text-sm font-semibold uppercase tracking-wider transition-colors',
                  canSubmit
                    ? 'bg-brand-600 text-white hover:bg-brand-500'
                    : 'cursor-not-allowed bg-brand-800 text-brand-500'
                )}
              >
                {loading ? 'Launching...' : 'Start Engine'}
              </button>
            </div>
          </div>
        </section>

        {/* History Section */}
        <section className="pb-16">
          <HistoryDatabase />
        </section>
      </main>
    </div>
  );
}
