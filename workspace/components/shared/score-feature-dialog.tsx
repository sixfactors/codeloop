'use client';

// RICE on a feature: reach, impact and confidence on 1–10, effort in weeks. POST /api/features/:id/score
// writes the block; the API derives the feature's score and band, and every story's, on the next read.

import { useState } from 'react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useScoreFeature } from '@/hooks/use-api';
import type { Rice, TreeFeature } from '@/lib/types';

const FIELDS: { key: keyof Rice; label: string; hint: string; min: number; max?: number; step: number }[] = [
  { key: 'reach', label: 'Reach', hint: 'How many users it touches, 1–10', min: 1, max: 10, step: 1 },
  { key: 'impact', label: 'Impact', hint: 'How much it moves the metric, 1–10', min: 1, max: 10, step: 1 },
  { key: 'confidence', label: 'Confidence', hint: 'How sure the estimate is, 1–10', min: 1, max: 10, step: 1 },
  { key: 'effort', label: 'Effort', hint: 'Person-weeks, above 0', min: 0.25, step: 0.25 },
];

export function ScoreFeatureDialog({ feature, open, onOpenChange }: { feature: TreeFeature; open: boolean; onOpenChange: (o: boolean) => void }) {
  const score = useScoreFeature();
  const [rice, setRice] = useState<Record<keyof Rice, string>>({
    reach: String(feature.rice?.reach ?? 5), impact: String(feature.rice?.impact ?? 5), confidence: String(feature.rice?.confidence ?? 5), effort: String(feature.rice?.effort ?? 1),
  });
  const [refusal, setRefusal] = useState<string | null>(null);
  const parsed: Rice = { reach: Number(rice.reach), impact: Number(rice.impact), confidence: Number(rice.confidence), effort: Number(rice.effort) };
  const valid = FIELDS.every((f) => Number.isFinite(parsed[f.key]) && parsed[f.key] >= f.min && (f.max === undefined || parsed[f.key] <= f.max));
  const preview = valid ? Math.round(((parsed.reach * parsed.impact * parsed.confidence) / parsed.effort) * 10) / 10 : null;

  const submit = async () => {
    if (!valid || score.isPending) return;
    setRefusal(null);
    try {
      await score.mutateAsync({ id: feature.id, rice: parsed });
      toast.success(`Scored ${feature.id}`);
      onOpenChange(false);
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : 'Score failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]" data-testid="score-feature-dialog">
        <DialogHeader>
          <DialogTitle>Score {feature.title}</DialogTitle>
          <DialogDescription>Reach × impact × confidence ÷ effort. The band (P1–P4) and every story&apos;s rank follow from it.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-2">
                <Label htmlFor={`rice-${f.key}`}>{f.label}</Label>
                <Input id={`rice-${f.key}`} type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step} value={rice[f.key]} onChange={(e) => setRice({ ...rice, [f.key]: e.target.value })} data-testid={`rice-${f.key}`} />
                <p className="text-xs text-muted-foreground">{f.hint}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="rice-preview">{preview !== null ? `Score ${preview}` : 'Each value must be in range.'}</p>
          {refusal ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{refusal}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid || score.isPending} data-testid="rice-save">{score.isPending ? 'Saving…' : 'Save score'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
