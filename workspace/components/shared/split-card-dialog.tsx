'use client';

// Split a story into two or three siblings under the same feature (docs/terminology.md: each gets
// `split_from`). On success the feature page opens, where the siblings now sit. A server without
// the route shows the CLI line instead.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CliFallback } from '@/components/shared/cli-fallback';
import { isMissing, useSplit } from '@/hooks/use-api';
import { routes } from '@/lib/routes';
import { toast } from '@/lib/toast';
import type { Card as CardT } from '@/lib/types';

const MAX = 3;
const quote = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

export function SplitCardDialog({ card, open, onOpenChange }: { card: CardT; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const split = useSplit();
  const [titles, setTitles] = useState<string[]>(['', '']);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [routeMissing, setRouteMissing] = useState(false);
  const clean = titles.map((t) => t.trim()).filter(Boolean);
  const canSubmit = clean.length >= 2 && clean.length === titles.length && !split.isPending && !routeMissing;
  const command = `codeloop card split ${card.id} ${clean.map(quote).join(' ')}`;

  const submit = async () => {
    if (!canSubmit) return;
    setRefusal(null);
    try {
      const made = await split.mutateAsync({ id: card.id, titles: clean });
      const ids = (made.cards ?? []).map((c) => c.id).join(', ');
      toast.success(`Split ${card.id} into ${ids || `${clean.length} stories`}`);
      onOpenChange(false);
      const feature = card.feature;
      if (feature) router.push(routes.feature(feature));
    } catch (e) {
      if (isMissing(e)) setRouteMissing(true);
      setRefusal(e instanceof Error ? e.message : 'Split failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]" data-testid="split-card-dialog">
        <DialogHeader>
          <DialogTitle>Split {card.id}</DialogTitle>
          <DialogDescription>Two or three sibling stories under {card.feature ? `the ${card.feature} feature` : 'the same feature'}, each a slice a user could use in under a week. Titles say what the user can now do.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {titles.map((t, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Label htmlFor={`split-title-${i}`}>Story {i + 1}</Label>
              <div className="flex items-center gap-2">
                <Input id={`split-title-${i}`} value={t} onChange={(e) => setTitles(titles.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? 'Export one month of invoices as CSV' : 'Pick the columns the export carries'} autoFocus={i === 0} data-testid={`split-title-${i}`} />
                {titles.length > 2 ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove story ${i + 1}`} onClick={() => setTitles(titles.filter((_, j) => j !== i))}><X /></Button> : null}
              </div>
            </div>
          ))}
          {titles.length < MAX ? <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setTitles([...titles, ''])} data-testid="split-add"><Plus />Add a third</Button> : null}
          {routeMissing ? <CliFallback reason="POST /api/cards/:id/split is not served yet; run this instead" command={command} /> : refusal ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="split-refusal">{refusal}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit} data-testid="split-submit">{split.isPending ? 'Splitting…' : `Split into ${Math.max(clean.length, 2)}`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
