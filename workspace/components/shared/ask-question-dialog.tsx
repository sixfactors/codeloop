'use client';

// "Ask a question" on a card: the question and a recommended answer, posted the way `codeloop ask`
// posts them. The owner answers it from the Questions tab or the inbox, or accepts the recommendation.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAsk } from '@/hooks/use-api';
import { toast } from '@/lib/toast';
import type { Card as CardT } from '@/lib/types';

export function AskQuestionDialog({ card, open, onOpenChange }: { card: CardT; open: boolean; onOpenChange: (o: boolean) => void }) {
  const ask = useAsk();
  const [question, setQuestion] = useState('');
  const [recommended, setRecommended] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const canSubmit = question.trim().length > 0 && !ask.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    setRefusal(null);
    try {
      const made = await ask.mutateAsync({ id: card.id, items: [{ question: question.trim(), ...(recommended.trim() ? { recommended: recommended.trim() } : {}) }] });
      toast.success(`Asked #${made.added[0]?.n ?? ''} on ${card.id}`);
      onOpenChange(false);
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : 'Ask failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]" data-testid="ask-question-dialog">
        <DialogHeader>
          <DialogTitle>Ask a question on {card.id}</DialogTitle>
          <DialogDescription>It lands in the inbox with the recommended answer, which the owner can accept in one click.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ask-question">Question</Label>
            <Textarea id="ask-question" value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} placeholder="Which export format do finance leads expect first?" autoFocus data-testid="ask-question-text" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ask-recommended">Recommended answer <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="ask-recommended" value={recommended} onChange={(e) => setRecommended(e.target.value)} placeholder="CSV; XLSX in a later card" data-testid="ask-question-recommended" />
          </div>
          {refusal ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="ask-question-refusal">{refusal}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit} data-testid="ask-question-submit">{ask.isPending ? 'Asking…' : 'Ask'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
