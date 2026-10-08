import { cn } from '@/lib/utils';

/** Stories done over total, as the tree rows and the initiatives table print it. Full is success, not alarm. */
export function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={`${done} of ${total} stories done`}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Stories done">
        <span className={cn('block h-full rounded-full', pct >= 100 ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">{done}/{total}</span>
    </span>
  );
}
