import { useEffect, useRef } from 'react';
import { cx } from '@/utils/cx';

export interface LogEntry {
  timestamp: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

interface LogViewerProps {
  logs: LogEntry[];
  className?: string;
  maxHeight?: string;
  title?: string;
}

export function LogViewer({ logs, className, maxHeight = '200px', title }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className={cx('rounded-lg bg-brand-950 text-brand-100 overflow-hidden', className)}>
      {title && (
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b border-brand-800 text-brand-300">
          {title}
        </div>
      )}
      <div ref={containerRef} className="overflow-y-auto p-3 font-mono text-xs" style={{ maxHeight }}>
        {logs.length === 0 ? (
          <div className="text-brand-400 italic">No logs yet...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-2 mb-0.5">
              <span className="text-brand-400 shrink-0">{log.timestamp}</span>
              <span
                className={cx(
                  log.type === 'error' && 'text-brand-300',
                  log.type === 'success' && 'text-green-400',
                  log.type === 'warning' && 'text-yellow-400'
                )}
              >
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function formatLogTimestamp(): string {
  const now = new Date();
  return (
    now.toLocaleTimeString('en-US', { hour12: false }) +
    '.' +
    String(now.getMilliseconds()).padStart(3, '0')
  );
}
