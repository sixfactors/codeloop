'use client';

// What the orchestrator did on a story, for the owner: the paragraph it reports (what works, the
// proof, what is left, the next gate), then one row per turn (stage, builder, started, outcome,
// merge) that opens to the builder's hand-back and the gate's verdict. GET /api/cards/:id/orch
// returns each turn with its hand-back and gate already matched, so this draws and joins nothing.

import { ChevronRight, GitMerge, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { AttributeCard } from '@/components/shared/record-layout';
import { CopyButton } from '@/components/shared/copy-button';
import { FieldRow } from '@/components/shared/field-row';
import { InlineError } from '@/components/shared/inline-error';
import { useOrch } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import type { OrchTurn, OrchTurnDetail } from '@/lib/types';

const OUTCOME: Record<OrchTurn['outcome'], string> = {
  merged: 'border-transparent bg-success/15 text-success',
  failed: 'border-transparent bg-destructive/15 text-destructive',
  stuck: 'border-transparent bg-destructive/15 text-destructive',
  briefed: 'border-transparent bg-warning/15 text-warning-foreground dark:text-warning',
  'merge-failed': 'border-transparent bg-warning/15 text-warning-foreground dark:text-warning',
  questions: 'border-transparent bg-warning/15 text-warning-foreground dark:text-warning',
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

function Output({ text }: { text: string }) {
  return text.trim() ? <pre className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap">{text.trim()}</pre> : null;
}

function TurnRow({ turn, detail }: { turn: OrchTurn; detail?: OrchTurnDetail }) {
  const running = !turn.endedAt && turn.outcome !== 'briefed';
  const hb = detail?.handback;
  const gate = detail?.gate;
  return (
    <Collapsible className="rounded-lg border bg-card" data-testid={`orch-turn-${turn.n}`} data-outcome={running ? 'running' : turn.outcome}>
      <CollapsibleTrigger className="group flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm">
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" aria-hidden />
        <span className="font-mono text-xs text-muted-foreground">#{turn.n}</span>
        <span className="font-medium">{turn.stage}</span>
        <span className="min-w-0 truncate text-muted-foreground">{detail?.builder ?? turn.agent}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{when(turn.startedAt)}</span>
        <span className="ml-auto flex items-center gap-2">
          {turn.merge ? <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground"><GitMerge className="size-3" aria-hidden />{turn.merge.sha.slice(0, 7)}</span> : null}
          <Badge variant="outline" className={cn('rounded-full', running ? 'border-transparent bg-ai/15 text-ai' : OUTCOME[turn.outcome])}>{running ? 'running' : turn.outcome}</Badge>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 border-t px-3 py-2 text-sm">
        {detail?.handbackLine ? (
          <div className="flex flex-col gap-1.5" data-testid="orch-briefed">
            <p className="text-xs text-muted-foreground">Handed to {detail.builder}{detail.brief ? <> with the brief at <span className="font-mono">{detail.brief}</span></> : null}. When the work is done, report back with:</p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 font-mono text-[11px]"><span className="min-w-0 flex-1 break-all">{detail.handbackLine}</span><CopyButton text={detail.handbackLine} /></div>
          </div>
        ) : null}
        {hb ? (
          <section className="flex flex-col" data-testid="orch-handback">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Hand-back</h4>
            <FieldRow label="Branch" value={hb.branch} mono />
            <FieldRow label="Head" value={hb.head.slice(0, 12)} mono />
            <FieldRow label="Proof" value={hb.proof.cmd} mono adornment={<Badge variant="outline" className={cn('rounded-full', hb.proof.exit === 0 ? OUTCOME.merged : OUTCOME.failed)}>exit {hb.proof.exit}</Badge>} />
            <Output text={hb.proof.output} />
            <FieldRow label="Left" value={hb.left || undefined} />
            <FieldRow label="Blocked" value={hb.blocked || undefined} />
          </section>
        ) : turn.handback ? (
          <p className="text-xs text-muted-foreground">Hand-back at {turn.handback.head.slice(0, 12)}, proof exit {turn.handback.proofExit}.</p>
        ) : !detail?.handbackLine ? <p className="text-xs text-muted-foreground">{running ? 'The builder is working; no hand-back yet.' : 'No hand-back was recorded.'}</p> : null}
        {gate ? (
          <section className="flex flex-col" data-testid="orch-gate">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Gate</h4>
            <FieldRow label="Verdict" value={gate.verdict} adornment={<Badge variant="outline" className={cn('rounded-full', gate.verdict === 'pass' ? OUTCOME.merged : OUTCOME.failed)}>{gate.verdict}</Badge>} />
            {gate.claim ? <FieldRow label="Claim" value={gate.claim.path} mono adornment={<span className="text-xs text-muted-foreground">{gate.claim.found ? 'found on the branch' : 'not on the branch'}</span>} /> : null}
            {gate.findings.length ? <ul className="mt-1 list-disc pl-5 text-xs">{gate.findings.map((f, i) => <li key={i}>{f}</li>)}</ul> : <p className="text-xs text-muted-foreground">No findings.</p>}
          </section>
        ) : turn.findings.length ? <ul className="list-disc pl-5 text-xs">{turn.findings.map((f, i) => <li key={i}>{f}</li>)}</ul> : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Shown only once a story has been orchestrated; the newest turn is first. */
export function OrchestrationSection({ cardId }: { cardId: string }) {
  const { data, error, refetch } = useOrch(cardId);
  if (!data && !error) return <Skeleton className="h-10 w-full rounded-lg" />;
  if (error) return <InlineError title="Orchestration failed to load" error={error} onRetry={() => refetch()} />;
  const turns = data?.record.turns ?? [];
  if (!turns.length) return null;
  const details = new Map((data?.details ?? []).map((d) => [d.n, d] as const));
  return (
    <AttributeCard title="Orchestration" icon={Workflow} testId="orchestration">
      <p className="text-sm" data-testid="orch-report">{data!.report.text}</p>
      <div className="mt-2 flex flex-col gap-2">
        {[...turns].reverse().map((t) => <TurnRow key={t.n} turn={t} detail={details.get(t.n)} />)}
      </div>
    </AttributeCard>
  );
}
