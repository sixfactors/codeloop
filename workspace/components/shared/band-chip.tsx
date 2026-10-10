import { Badge } from '@/components/ui/badge';
import type { Band } from '@/lib/types';
import { cn } from '@/lib/utils';

// One chip for the RICE band everywhere it shows (card, tree row, inbox group). P1 is the loudest,
// P4 is muted, so a glance down a column reads the priority order without the numbers.
const BAND_STYLE: Record<Band, string> = {
  P1: 'border-transparent bg-destructive/15 font-semibold text-destructive',
  P2: 'border-transparent bg-warning/15 font-medium text-warning-foreground dark:text-warning',
  P3: 'border-transparent bg-muted text-foreground',
  P4: 'border-border bg-transparent text-muted-foreground',
};

export const BAND_LABEL: Record<Band, string> = { P1: 'P1 · do now', P2: 'P2 · next', P3: 'P3 · later', P4: 'P4 · someday' };

export function BandChip({ band, score, className }: { band?: Band | null; score?: number | null; className?: string }) {
  if (!band) return null;
  const title = score !== undefined && score !== null ? `${BAND_LABEL[band]} · score ${score}` : BAND_LABEL[band];
  return (
    <Badge variant="outline" className={cn('shrink-0 rounded-full px-1.5 tabular-nums', BAND_STYLE[band], className)} title={title} data-testid={`band-${band}`}>
      {band}
    </Badge>
  );
}

/** A score as the tables print it: one decimal, or an em-dash before the API ranks the row. */
export const fmtScore = (score?: number | null) => (score === undefined || score === null ? '—' : Number.isInteger(score) ? String(score) : score.toFixed(1));
