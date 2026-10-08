'use client';

// The rail card at the top of a card's page and sheet: where the card is in its lane, and the two
// things the owner can do about it without a terminal. "Run check" is `codeloop next` through
// POST /api/cards/:id/advance, with the check's output shown here. "Run this stage" starts the
// configured agent through POST /api/cards/:id/run and follows the run's log.

import { useState } from 'react';
import { Bot, CheckCircle2, FileOutput, Layers, Play, Terminal, Wand2, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AttributeCard } from '@/components/shared/record-layout';
import { FieldRow } from '@/components/shared/field-row';
import { RunLogPane } from '@/components/shared/run-log-pane';
import { isMissing, useAdvance, useCardShow, useCards, useConfig, useRunStage, useSetupStatus } from '@/hooks/use-api';
import { isDropped, isProposed, isShipped } from '@/lib/cards';
import { toast } from '@/lib/toast';
import type { AdvanceReport, Card as CardT } from '@/lib/types';

/** A button that stays hoverable while disabled, so the tooltip can say why. */
function Why({ reason, children }: { reason?: string; children: React.ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" tabIndex={0} />}>{children}</TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function agentNames(cfg: unknown): string[] {
  const agents = (cfg as { agents?: Record<string, unknown> })?.agents;
  return agents && typeof agents === 'object' ? Object.keys(agents).filter((k) => k !== 'default') : [];
}

function CheckReport({ report, onDismiss }: { report: AdvanceReport; onDismiss: () => void }) {
  const ok = report.exitCode === 0;
  const outcome = report.result.outcome;
  const lines = report.lines.filter((l) => l.trim());
  return (
    <Alert variant={ok ? 'default' : 'destructive'} className="mt-3" data-testid="check-report" data-outcome={outcome}>
      {ok ? <CheckCircle2 /> : <XCircle />}
      <AlertTitle>{ok ? `Check passed · ${outcome}` : outcome === 'stuck' ? 'Check failed three times · stuck' : 'Check failed'}</AlertTitle>
      <AlertDescription className="min-w-0">
        {lines.length ? <div className="whitespace-pre-wrap">{lines.join('\n')}</div> : null}
        {report.result.output ? (
          <pre className="mt-2 max-h-60 w-full overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap text-foreground" data-testid="check-output">{report.result.output}</pre>
        ) : null}
        <div className="mt-2"><Button size="xs" variant="outline" onClick={onDismiss}>Dismiss</Button></div>
      </AlertDescription>
    </Alert>
  );
}

export function StageCard({ card }: { card: CardT }) {
  const { payload } = useCards();
  const owner = Boolean(payload?.owner);
  const show = useCardShow(card.id);
  const setup = useSetupStatus();
  const config = useConfig();
  const advance = useAdvance();
  const runStage = useRunStage();
  const [report, setReport] = useState<AdvanceReport | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runRouteMissing, setRunRouteMissing] = useState(false);

  if (isProposed(card) || isDropped(card) || isShipped(card)) return null;

  const brief = show.data?.brief ?? null;
  const showMissing = Boolean(show.error) && isMissing(show.error);
  // The stage from /api/cards/:id/show has every path substituted; the lane's raw stage is the fallback.
  const skill = brief?.skill;
  const output = brief?.output;
  const check = brief?.done;

  // Agent configured: setup status says so, or the config carries an agents block.
  const names = setup.data ? setup.data.agents : agentNames(config.data);
  const agentConfigured = setup.data ? setup.data.agentsConfigured > 0 : names.length > 0;
  const runReason = !owner ? 'Only the owner runs a stage' : runRouteMissing ? 'POST /api/cards/:id/run is not served yet' : !agentConfigured ? 'No agent configured. Settings › Agents shows the lines to add to .codeloop/config.yaml.' : undefined;
  const checkReason = !owner ? 'Only the owner runs the check' : undefined;

  const runCheck = () =>
    advance.mutate(
      { id: card.id },
      {
        onSuccess: (r) => { setReport(r); if (r.exitCode === 0) toast.success(`${card.id}: ${r.result.outcome}`); },
        onError: (e) => toast.error(`Run check failed: ${(e as Error).message}`),
      }
    );
  const runThis = () =>
    runStage.mutate(
      { id: card.id },
      {
        onSuccess: ({ runId: id }) => setRunId(id),
        onError: (e) => { if (isMissing(e)) setRunRouteMissing(true); toast.error(`Run this stage failed: ${(e as Error).message}`); },
      }
    );

  return (
    <AttributeCard title="Stage" icon={Layers} testId="stage-card">
      <FieldRow icon={Layers} label="Stage" value={card.stage} adornment={<span className="text-xs text-muted-foreground">{card.lane} lane</span>} />
      {!show.data && !show.error ? (
        <div className="space-y-2 py-2"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-3/4" /></div>
      ) : (
        <>
          <FieldRow icon={Wand2} label="Skill" value={skill ? `/${skill}` : undefined} emptyHint={showMissing ? 'from /api/cards/:id/show' : '—'} />
          <FieldRow icon={Terminal} label="Check" value={check} mono emptyHint={showMissing ? 'from /api/cards/:id/show' : 'event-driven'} />
          <FieldRow icon={FileOutput} label="Output" value={output} mono emptyHint={showMissing ? 'from /api/cards/:id/show' : 'no file for this stage'} />
        </>
      )}
      {owner ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Why reason={checkReason}>
            <Button size="sm" disabled={advance.isPending || Boolean(checkReason)} onClick={runCheck} data-testid="run-check"><Play />{advance.isPending ? 'Checking…' : 'Run check'}</Button>
          </Why>
          <Why reason={runReason}>
            <Button size="sm" variant="outline" disabled={runStage.isPending || Boolean(runReason) || Boolean(runId)} onClick={runThis} data-testid="run-stage" aria-disabled={Boolean(runReason)}>
              <Bot />{runStage.isPending ? 'Starting…' : 'Run this stage'}
            </Button>
          </Why>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Read only: the owner runs the check and the stage from their own board.</p>
      )}
      {runReason && owner ? <p className="mt-2 text-xs text-muted-foreground" data-testid="run-stage-reason">{runReason}</p> : null}
      {report ? <CheckReport report={report} onDismiss={() => setReport(null)} /> : null}
      {runId ? <RunLogPane runId={runId} onClose={() => setRunId(null)} /> : null}
    </AttributeCard>
  );
}
