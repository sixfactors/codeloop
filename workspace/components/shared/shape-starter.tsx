'use client';

// The board's first screen when the repo has no stories yet: one text box that starts the shape
// workflow (brief → interview → breakdown → rank) instead of a bare "nothing here" message.

import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCanWrite, useShapeProblem } from '@/hooks/use-api';
import { toast } from '@/lib/toast';

export function ShapeStarter({ onCreated, onNewStory }: { onCreated?: (id: string) => void; onNewStory?: () => void }) {
  const [problem, setProblem] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const shape = useShapeProblem();
  const { canWrite, reason } = useCanWrite();
  const canSubmit = canWrite && problem.trim().length > 0 && !shape.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    setRefusal(null);
    try {
      const made = await shape.mutateAsync(problem.trim());
      toast.success(`Started ${made.card.id}. ${made.hint}`);
      setProblem('');
      onCreated?.(made.card.id);
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : 'Could not start that');
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border bg-muted/30 px-6 py-10 text-center" data-testid="shape-starter">
      <Lightbulb className="size-8 text-muted-foreground" strokeWidth={1.5} />
      <div className="max-w-md">
        <p className="text-sm font-medium">Nothing here yet. Describe a problem and this gets you started.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A sentence is enough — who is stuck and on what. This breaks it into stories, the same way <code>codeloop shape</code> does from the terminal.
        </p>
      </div>
      <form className="flex w-full max-w-md flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Textarea
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          placeholder="Finance leads re-key invoice totals into the ledger by hand every month"
          rows={3}
          aria-label="Describe a problem"
          disabled={!canWrite}
          data-testid="shape-starter-input"
        />
        {!canWrite ? <p className="text-xs text-muted-foreground">{reason}</p> : null}
        {refusal ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="shape-starter-refusal">{refusal}</p> : null}
        <Button type="submit" disabled={!canSubmit} title={canWrite ? undefined : reason} data-testid="shape-starter-submit" className="self-center">
          {shape.isPending ? 'Starting…' : 'Describe a problem'}
        </Button>
      </form>
      {onNewStory ? (
        <p className="text-xs text-muted-foreground">
          Prefer a plain story instead? <button type="button" className="underline" onClick={onNewStory}>New story</button> skips the interview.
        </p>
      ) : null}
    </div>
  );
}
