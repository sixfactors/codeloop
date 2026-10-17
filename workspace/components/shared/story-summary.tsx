'use client';

// The top of the story page (c-311): what the story needs, what is done and what you must do, each
// with who wrote it and when. The API joins it; "what you must do" always comes from the board.
// Waiting and stuck read in amber with an hourglass; red is kept for a real failure.

import { useState } from 'react';
import { Clock, Hourglass, Pencil, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { AttributeCard } from '@/components/shared/record-layout';
import { FieldSectionLabel } from '@/components/shared/field-row';
import { useCanWrite, useSaveSummary } from '@/hooks/use-api';
import { whoLine } from '@/lib/story-folds';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { SummaryView, SummaryViewLine } from '@/lib/types';

const MARK = {
  unwritten: 'Not yet written by an agent',
  stale: 'Written before the latest step',
} as const;

function Line({ l, extra }: { l: SummaryViewLine; extra?: React.ReactNode }) {
  return (
    <span className="grid min-w-0 gap-0.5 whitespace-normal">
      <span className="wrap-anywhere">{l.text}</span>
      {extra}
      <span className="text-xs text-muted-foreground" data-testid="summary-who">{whoLine(l)}</span>
    </span>
  );
}

/** A label over its line, full width: the three lines stay short enough on a phone for the buttons under them to show. */
function Row({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-1 pb-1 text-[13px]" data-testid={testId}>
      <FieldSectionLabel className="px-0 pt-1">{label}</FieldSectionLabel>
      {children}
    </div>
  );
}

export function StorySummary({ cardId, summary, waiting, extra }: { cardId: string; summary?: SummaryView; /** Something waits on the founder: the action line reads amber. */ waiting?: boolean; /** Under the action line: the stuck explanation's facts. */ extra?: React.ReactNode }) {
  const { canWrite, reason } = useCanWrite();
  const save = useSaveSummary();
  const [editing, setEditing] = useState(false);
  const [needed, setNeeded] = useState('');
  const [done, setDone] = useState('');
  if (!summary) return <Skeleton className="h-36 w-full rounded-xl" data-testid="story-summary-loading" />;
  const start = () => { setNeeded(summary.needed.text); setDone(summary.done.text); setEditing(true); };
  const submit = () =>
    save.mutate(
      { id: cardId, ...(needed.trim() !== summary.needed.text ? { needed } : {}), ...(done.trim() !== summary.done.text ? { done } : {}) },
      { onSuccess: () => { setEditing(false); toast.success('Summary saved'); }, onError: (e) => toast.error(`Saving the summary failed: ${(e as Error).message}`) }
    );
  return (
    <AttributeCard
      title="Summary"
      icon={Sparkles}
      testId="story-summary"
      action={editing ? null : <Button size="sm" variant="ghost" disabled={!canWrite} title={canWrite ? undefined : reason} onClick={start} data-testid="summary-edit"><Pencil />Edit</Button>}
    >
      <div className="flex min-w-0 flex-col gap-2">
        {summary.mark ? <Badge variant="outline" className="w-fit gap-1 rounded-full border-transparent bg-warning/15 text-warning-foreground dark:text-warning" data-testid="summary-mark" data-mark={summary.mark}><Clock className="size-3" aria-hidden />{MARK[summary.mark]}</Badge> : null}
        {editing ? (
          <div className="flex flex-col gap-2" data-testid="summary-editor">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="summary-needed">What it needs</label>
            <Textarea id="summary-needed" value={needed} onChange={(e) => setNeeded(e.target.value)} rows={2} />
            <label className="text-xs font-medium text-muted-foreground" htmlFor="summary-done">What is done</label>
            <Textarea id="summary-done" value={done} onChange={(e) => setDone(e.target.value)} rows={2} />
            <p className="text-xs text-muted-foreground">What you must do comes from the board, so it is not edited here.</p>
            <div className="flex gap-2">
              <Button size="sm" disabled={save.isPending} onClick={submit} data-testid="summary-save">Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <Row label="What it needs" testId="summary-needed"><Line l={summary.needed} /></Row>
            <Row label="What is done" testId="summary-done"><Line l={summary.done} /></Row>
          </>
        )}
        <div className={cn('rounded-md', waiting && 'bg-warning/10 px-1 ring-1 ring-warning/40')} data-testid="summary-you-wrap" data-waiting={waiting || undefined}>
          <Row label="What you must do" testId="summary-you"><span className="flex min-w-0 items-start gap-1.5">{waiting ? <Hourglass className="mt-0.5 size-3.5 shrink-0 text-warning" aria-label="Waiting on you" /> : null}<Line l={summary.you} extra={extra} /></span></Row>
        </div>
      </div>
    </AttributeCard>
  );
}
