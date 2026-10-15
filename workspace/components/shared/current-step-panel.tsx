'use client';

// The one panel under the journey: what is happening in the current phase and what can be done
// about it, in one of three shapes chosen by who holds the story (the API's `journey.holder`):
//   agent  - the live activity feed, elapsed time, Stop and Open brief
//   you    - the check in one sentence, then Approve/Reject at a gate, or the open questions
//   nobody - the check output as a sentence, then Run with orchestrator, Brief a person, Work on it
//            myself, Park, Check now
// The caller keys it by card id, so moving the drawer to another story starts it fresh.

import { useEffect, useState } from 'react';
import { Bot, Check, CheckCircle2, FileText, Hand, Lock, ParkingSquare, Play, Square, UserRound, Workflow, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AttributeCard } from '@/components/shared/record-layout';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { CopyButton } from '@/components/shared/copy-button';
import { Holder } from '@/components/shared/holder';
import { Questions } from '@/components/shared/questions';
import { RunLogPane } from '@/components/shared/run-log-pane';
import { phaseTimeText, since } from '@/components/shared/journey-stepper';
import { StatePill } from '@/components/shared/state-pill';
import { RubricRows } from '@/components/shared/rubric-rows';
import { useAdvance, useBrief, useCanWrite, useDecide, useOrch, useOrchRun, usePark, useSetupStatus } from '@/hooks/use-api';
import { toast } from '@/lib/toast';
import type { Card as CardT, Journey, StageRubric, StoryState } from '@/lib/types';

function Why({ reason, children }: { reason?: string; children: React.ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" tabIndex={0} />}>{children}</TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function useElapsed(from?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!from) return undefined;
  const s = Math.max(0, Math.floor((now - Date.parse(from)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function CheckLine({ journey }: { journey: Journey }) {
  const check = journey.check;
  if (!check) return null;
  return (
    <Alert variant={check.pass ? 'default' : 'destructive'} data-testid="check-sentence" data-pass={check.pass}>
      {check.pass ? <CheckCircle2 /> : <XCircle />}
      <AlertTitle className="flex flex-wrap items-start gap-2">{check.stale ? <Badge variant="outline" className="rounded-full" data-testid="check-stale">stale</Badge> : null}<span>{check.sentence}</span></AlertTitle>
      {!check.pass && check.output && check.output.trim() !== check.sentence ? (
        <AlertDescription><pre className="max-h-32 w-full overflow-auto font-mono text-[11px] whitespace-pre-wrap">{check.output.trim()}</pre></AlertDescription>
      ) : null}
    </Alert>
  );
}

function BriefBox({ cardId }: { cardId: string }) {
  const brief = useBrief(cardId, true);
  return (
    <pre className="max-h-60 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap" data-testid="brief">
      {brief.data ?? (brief.error ? `Brief unavailable: ${(brief.error as Error).message}` : 'Loading the brief…')}
    </pre>
  );
}

function AgentShape({ card, journey }: { card: CardT; journey: Journey }) {
  const holder = journey.holder;
  const elapsed = useElapsed(holder.since);
  const [brief, setBrief] = useState(false);
  const [runOpen, setRunOpen] = useState(true);
  return (
    <AttributeCard title="Agent working" icon={Bot} testId="panel-agent">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Holder agent={holder.agent} />
        <span className="font-medium">{holder.agent}</span>
        {elapsed ? <span className="text-xs text-muted-foreground tabular-nums">{elapsed}</span> : null}
      </div>
      <CheckLine journey={journey} />
      <ActivityFeed cardId={card.id} limit={12} className="mt-1" />
      {holder.runId && runOpen ? <RunLogPane runId={holder.runId} onClose={() => setRunOpen(false)} /> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Why reason="Stopping a session from the board is not built yet; stop it in the terminal it runs in.">
          <Button size="sm" variant="outline" disabled data-testid="agent-stop"><Square />Stop</Button>
        </Why>
        <Button size="sm" variant="ghost" onClick={() => setBrief((b) => !b)} data-testid="open-brief"><FileText />{brief ? 'Hide brief' : 'Open brief'}</Button>
      </div>
      {brief ? <BriefBox cardId={card.id} /> : null}
    </AttributeCard>
  );
}

function YouShape({ card, journey, rubric }: { card: CardT; journey: Journey; rubric?: StageRubric | null }) {
  const decide = useDecide();
  const { canWrite, reason } = useCanWrite();
  const [note, setNote] = useState('');
  const holder = journey.holder;
  const act = (action: 'approve' | 'reject') =>
    decide.mutate(
      { id: card.id, action, note: note || undefined },
      { onSuccess: () => { toast.success(`${action === 'approve' ? 'Approved' : 'Rejected'} ${card.id}`); setNote(''); }, onError: (e) => toast.error(`${action === 'approve' ? 'Approve' : 'Reject'} failed: ${(e as Error).message}`) }
    );
  return (
    <AttributeCard title={holder.gate ? `Waiting for you at ${holder.gate}` : 'Questions for you'} icon={holder.gate ? Lock : Hand} className="border-warning/50" testId="panel-you">
      <CheckLine journey={journey} />
      {holder.gate ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground" data-testid="gate-explain">
            {holder.gate === 'stuck'
              ? 'The check failed three times. Approve unsticks it: it clears the three fails and keeps the stage, so the next run starts fresh. Reject parks it.'
              : `Gate ${holder.gate}, approved by the ${holder.awaiting ?? 'owner'}.`}
          </p>
          {rubric?.rows.length ? <RubricRows rubric={rubric} /> : null}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" rows={2} aria-label="Gate note" disabled={!canWrite} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!canWrite || decide.isPending} title={canWrite ? undefined : reason} onClick={() => act('approve')} data-testid="gate-approve"><Check />{holder.gate === 'stuck' ? 'Approve: unstick' : 'Approve'}</Button>
            <Button size="sm" variant="outline" disabled={!canWrite || decide.isPending} title={canWrite ? undefined : reason} onClick={() => act('reject')} data-testid="gate-reject"><X />Reject</Button>
          </div>
          {!canWrite ? <p className="text-xs text-muted-foreground">{reason}</p> : null}
        </div>
      ) : null}
      {holder.openQuestions ? <div className="mt-2"><Questions cardId={card.id} compact /></div> : null}
    </AttributeCard>
  );
}

function NobodyShape({ card, journey }: { card: CardT; journey: Journey }) {
  const { canWrite, reason } = useCanWrite();
  const setup = useSetupStatus();
  const advance = useAdvance();
  const orchRun = useOrchRun();
  const orch = useOrch(card.id);
  const park = usePark();
  const [mine, setMine] = useState(false);
  const [briefed, setBriefed] = useState(false);
  // The person's brief and report-back line come from the orchestration record once the turn is written.
  const latest = orch.data?.details.at(-1);
  const personBrief = briefed && latest?.handbackLine ? latest : undefined;
  const run = (builder: 'agent' | 'person') =>
    orchRun.mutate(
      { id: card.id, builder, ...(builder === 'person' ? { wait: false as const } : {}) },
      {
        onSuccess: ({ turn }) => { if (builder === 'person') setBriefed(true); toast.success(builder === 'agent' ? `Turn ${turn.n} started on ${card.id}` : `Brief written for turn ${turn.n}`); },
        onError: (e) => toast.error(`${builder === 'agent' ? 'Run with orchestrator' : 'Brief a person'} failed: ${(e as Error).message}`),
      }
    );
  const noAgent = setup.data && setup.data.agentsConfigured === 0 ? 'No agent configured. Settings › Agents shows the lines to add to .codeloop/config.yaml.' : undefined;
  const command = `codeloop card activate ${card.id}`;
  return (
    <AttributeCard title="Nobody is on this" icon={Hand} testId="panel-nobody">
      {journey.check ? <CheckLine journey={journey} /> : <p className="text-sm text-muted-foreground">No check has run in this phase yet.</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setMine((m) => !m)} data-testid="work-myself"><Hand />Work on it myself</Button>
      {canWrite ? (
        <>
          <Why reason={noAgent}>
            <Button size="sm" disabled={Boolean(noAgent) || orchRun.isPending} onClick={() => run('agent')} data-testid="run-orchestrator"><Workflow />Run with orchestrator</Button>
          </Why>
          <Button size="sm" variant="outline" disabled={orchRun.isPending} onClick={() => run('person')} data-testid="brief-person"><UserRound />Brief a person</Button>
          <Button size="sm" variant="outline" disabled={park.isPending} onClick={() => park.mutate({ id: card.id }, { onSuccess: () => toast.success(`Parked ${card.id}`), onError: (e) => toast.error(`Park failed: ${(e as Error).message}`) })} data-testid="park"><ParkingSquare />Park</Button>
          <Button size="sm" variant="ghost" disabled={advance.isPending} onClick={() => advance.mutate({ id: card.id }, { onError: (e) => toast.error(`Check failed to run: ${(e as Error).message}`) })} data-testid="check-now"><Play />{advance.isPending ? 'Checking…' : 'Check now'}</Button>
        </>
      ) : null}
      </div>
      {!canWrite ? <p className="mt-2 text-xs text-muted-foreground">{reason}</p> : null}
      {mine ? (
        <div className="mt-2 flex flex-col gap-2" data-testid="work-myself-box">
          <p className="text-xs text-muted-foreground">In the terminal or assistant session you work in, take the story, then follow its brief:</p>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs"><span className="min-w-0 flex-1 truncate">{command}</span><CopyButton text={command} /></div>
          <BriefBox cardId={card.id} />
        </div>
      ) : null}
      {personBrief ? (
        <div className="mt-2 flex flex-col gap-2" data-testid="person-brief-box">
          <p className="text-xs text-muted-foreground">Give {personBrief.brief ? <span className="font-mono">{personBrief.brief}</span> : 'the brief'} to the person doing the work. They report back with:</p>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 font-mono text-[11px]"><span className="min-w-0 flex-1 break-all">{personBrief.handbackLine}</span><CopyButton text={personBrief.handbackLine!} /></div>
        </div>
      ) : briefed ? <p className="mt-2 text-xs text-muted-foreground">Writing the brief…</p> : null}
    </AttributeCard>
  );
}

export function CurrentStepPanel({ card, journey, display, rubric }: { card: CardT; journey?: Journey; display?: StoryState; rubric?: StageRubric | null }) {
  if (!journey) return null;
  const current = journey.steps.find((s) => s.state === 'current' || s.state === 'gate');
  if (!current) return null;
  const shape = journey.holder.kind;
  const time = phaseTimeText(current.id, current.activeMinutes, current.idleMinutes);
  return (
    <div data-testid="current-step-panel" data-card={card.id} data-shape={shape} className="flex flex-col gap-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {display ? <StatePill display={display} agent={journey.holder.agent} /> : null}
        <span>{current.id}{current.enteredAt ? ` since ${since(current.enteredAt)}` : ''}</span>
        {time ? <span className="tabular-nums" data-testid="step-time">{time}</span> : null}
      </p>
      {shape === 'agent' ? <AgentShape card={card} journey={journey} /> : shape === 'you' ? <YouShape card={card} journey={journey} rubric={rubric} /> : <NobodyShape card={card} journey={journey} />}
    </div>
  );
}
