'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Variant definitions
// ---------------------------------------------------------------------------

const barVariants = cva('h-full rounded-full transition-all', {
  variants: {
    severity: {
      normal: 'bg-primary',
      warning: 'bg-warning/100',
      critical: 'bg-destructive',
    },
  },
  defaultVariants: {
    severity: 'normal',
  },
});

const trackVariants = cva('w-full overflow-hidden rounded-full', {
  variants: {
    size: {
      sm: 'h-1.5',
      md: 'h-2',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsageBarProps {
  /** Display label, e.g."Voice Minutes" */
  label: string;
  /** Current usage value */
  current: number;
  /** Plan limit. Use -1 for unlimited. */
  limit: number;
  /** Optional unit suffix, e.g."min","agents" */
  unit?: string;
  /** Whether to show the label row. @default true */
  showLabel?: boolean;
  /** Bar height variant. @default'md' */
  size?: 'sm' | 'md';
  /** Additional class names for the root container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSeverity(current: number, limit: number): VariantProps<typeof barVariants>['severity'] {
  if (limit === -1) return 'normal'; // unlimited
  if (limit === 0) return current > 0 ? 'critical' : 'normal'; // no included — any usage is over
  const pct = current / limit;
  if (pct > 0.9) return 'critical';
  if (pct >= 0.7) return 'warning';
  return 'normal';
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function toKebab(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * UsageBar -- reusable progress bar showing usage vs limit with color coding.
 *
 * ```
 * Voice Minutes [========--] 450/500 min
 * ```
 */
export function UsageBar({
  label,
  current,
  limit,
  unit,
  showLabel = true,
  size = 'md',
  className,
}: UsageBarProps) {
  const isUnlimited = limit === -1;
  const clampedPct = isUnlimited
    ? 0
    : limit === 0
      ? current > 0
        ? 100
        : 0
      : Math.min((current / limit) * 100, 100);
  const severity = getSeverity(current, limit);

  const countText = isUnlimited
    ? `${formatNumber(current)}${unit ? ` ${unit}` : ''}`
    : `${formatNumber(current)}/${formatNumber(limit)}${unit ? ` ${unit}` : ''}`;

  return (
    <div className={cn('space-y-1.5', className)} data-testid={`usage-bar-${toKebab(label)}`}>
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-sm font-medium tabular-nums">{countText}</span>
        </div>
      )}

      <div
        className={cn('bg-muted', trackVariants({ size }))}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={isUnlimited ? undefined : limit}
        aria-label={`${label}: ${countText}`}
      >
        {!isUnlimited && (
          <div className={barVariants({ severity })} style={{ width: `${clampedPct}%` }} />
        )}
      </div>
    </div>
  );
}
