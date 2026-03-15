import { cx } from '@/utils/cx';

interface PollingIndicatorProps {
  isActive: boolean;
  label?: string;
  className?: string;
}

export function PollingIndicator({ isActive, label, className }: PollingIndicatorProps) {
  if (!isActive) return null;

  return (
    <div className={cx('flex items-center gap-2 text-xs text-brand-400', className)}>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
      </span>
      {label && <span>{label}</span>}
    </div>
  );
}
