import { cn } from '@/lib/utils';

/**
 * MetaChip — the standard "label value" pill used across the customer +
 * conversation surfaces (signals, relationship rollup, session cards).
 *
 * ONE definition so every chip reads the same: a bold foreground label + a
 * value tinted by tone. Default = bordered/neutral; good/warn/bad carry a soft
 * tint. Part of the shared primitive set — do not hand-roll chips.
 */
export type MetaChipTone = 'default' | 'good' | 'warn' | 'bad';

const TONE_BG: Record<MetaChipTone, string> = {
  default: 'border border-border',
  good: 'bg-success/10',
  warn: 'bg-warning/10',
  bad: 'bg-destructive/10',
};

const TONE_VALUE: Record<MetaChipTone, string> = {
  default: 'text-muted-foreground',
  good: 'font-medium text-success',
  warn: 'font-medium text-warning',
  bad: 'font-medium text-destructive',
};

export function MetaChip({
  label,
  value,
  tone = 'default',
  className,
}: {
  label: string;
  value: string;
  tone?: MetaChipTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
        TONE_BG[tone],
        className
      )}
    >
      <span className="font-semibold text-foreground">{label}</span>
      <span className={TONE_VALUE[tone]}>{value}</span>
    </span>
  );
}
