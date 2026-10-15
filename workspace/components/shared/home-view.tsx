'use client';

// Home: what needs you, what is moving, which agents are working, what shipped
// (docs/artifacts/codeloop-ui-design.html §5 "Home"). Replaces the Inbox as the first thing a
// person sees, the Inbox route still exists (nothing links to it from the nav any more), this
// is the one GET /api/home that already groups and computes every list on the server.

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AlertCircle, Bot, CheckCircle2, Home as HomeIcon, HelpCircle, Lock, Workflow } from 'lucide-react';
import { useState } from 'react';
import { PageLayout } from '@/components/shared/page-layout';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { AttributeCard } from '@/components/shared/record-layout';
import { FieldRow } from '@/components/shared/field-row';
import { Holder } from '@/components/shared/holder';
import { StatePill } from '@/components/shared/state-pill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { cn } from '@/lib/utils';
import type { AgentTile } from '@/lib/types';
import { useHome, useOrchStatus } from '@/hooks/use-api';
import { useRoutes } from '@/components/providers/project-provider';
import type { BoardStory } from '@/lib/types';

const AGENT_STATE: Record<AgentTile['state'], string> = {
  working: 'border-transparent bg-ai/15 text-ai',
  'check failing': 'border-transparent bg-destructive/15 text-destructive',
  stalled: 'border-transparent bg-warning/15 text-warning',
  idle: 'text-muted-foreground',
  stopped: 'text-muted-foreground',
};

/** "40s ago", "12 min ago", "3h ago". */
const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)}h ago`;
};

const ORCH_OUTCOME: Record<string, string> = {
  merged: 'border-transparent bg-success/15 text-success',
  failed: 'border-transparent bg-destructive/15 text-destructive',
  stuck: 'border-transparent bg-destructive/15 text-destructive',
  briefed: 'border-transparent bg-warning/15 text-warning-foreground dark:text-warning',
  questions: 'border-transparent bg-warning/15 text-warning-foreground dark:text-warning',
  'merge-failed': 'border-transparent bg-destructive/15 text-destructive',
};

/** Every story the orchestrator has taken: its stage, how many turns, the last outcome, who built it, how long it has been quiet. */
function OrchestratingTiles() {
  const routes = useRoutes();
  const { data, error } = useOrchStatus();
  return (
    <AttributeCard title="Orchestrating" icon={Workflow} testId="home-orchestrating">
      {error ? <p className="text-xs text-muted-foreground">Orchestration status unavailable: {(error as Error).message}</p>
        : data?.length ? (
          <ItemGroup className="gap-2">
            {data.map((r) => (
              <Item key={r.card} variant="outline" size="sm" className="flex-col items-stretch" render={<Link href={routes.card(r.card)} />} data-testid={`home-orch-tile-${r.card}`} data-stalled={r.stalled || undefined}>
                <ItemContent className="min-w-0">
                  <ItemTitle className="flex w-full min-w-0 items-center gap-2">
                    <span className="truncate">{r.card} {r.title}</span>
                    {r.stalled ? <Badge variant="outline" className="ml-auto shrink-0 rounded-full border-transparent bg-warning/15 text-warning-foreground dark:text-warning">stalled</Badge> : null}
                    {r.lastOutcome ? <Badge variant="outline" className={cn('shrink-0 rounded-full', !r.stalled && 'ml-auto', ORCH_OUTCOME[r.lastOutcome])}>{r.lastOutcome}</Badge> : null}
                  </ItemTitle>
                  <ItemDescription className="truncate">
                    {r.stage}{r.gate ? ` · waiting at ${r.gate}` : ''} · {r.turns} turn{r.turns === 1 ? '' : 's'}{r.builderLabel ? ` · ${r.builderLabel}` : ''}{r.idleMinutes ? ` · quiet ${r.idleMinutes} min` : ''}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        ) : <EmptyState compact icon={Workflow} title="Nothing orchestrated" description="Run with orchestrator on a story's page hands it to a builder and merges what passes the gate." />}
    </AttributeCard>
  );
}

const CardDrawer = dynamic(() => import('@/components/shared/card-drawer').then((m) => m.CardDrawer), { ssr: false });

/** The questions-open bubble (board-card.tsx's same badge, repeated here rather than imported:
 * that one is typed against the full Card, this one against the slimmer BoardStory row). */
function QuestionsBubble({ n }: { n: number }) {
  if (!n) return null;
  return (
    <Badge variant="secondary" className="shrink-0 gap-1 rounded-full" title={`${n} open question${n === 1 ? '' : 's'}`}>
      <HelpCircle className="size-3" />{n}
    </Badge>
  );
}

function NeedsYouRow({ story, onOpen, cardHref }: { story: BoardStory; onOpen: (id: string) => void; cardHref: string }) {
  const asking = story.display.waitingOn === 'questions';
  return (
    <FieldRow
      label={story.id}
      value={<button type="button" className="truncate text-left hover:underline" onClick={() => onOpen(story.id)}>{story.title}</button>}
      adornment={
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          <StatePill display={story.display} />
          <QuestionsBubble n={story.openQuestions} />
          <Button size="xs" variant="outline" nativeButton={false} render={<Link href={cardHref} />}>Review</Button>
          {asking ? <Button size="xs" nativeButton={false} render={<Link href={cardHref} />}>Answer</Button> : null}
        </span>
      }
      testId={`home-needs-you-row-${story.id}`}
    />
  );
}

export function HomeView() {
  const routes = useRoutes();
  const { data, isLoading, error, refetch } = useHome();
  const [open, setOpen] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <PageLayout icon={HomeIcon} title="Home" description="What needs you, what is moving, what shipped.">
        {error ? <InlineError title="Home failed to load" error={error} onRetry={() => refetch()} /> : <PageSkeleton statCards={0} showToolbar={false} tableRows={4} />}
      </PageLayout>
    );
  }

  const { summary } = data;
  const title = summary.needsYou === 0 ? 'Nothing needs you' : `${summary.needsYou} thing${summary.needsYou === 1 ? '' : 's'} need${summary.needsYou === 1 ? 's' : ''} you`;
  const description = [
    `${summary.shippedThisWeek} shipped this week`,
    `${summary.inProgress} in progress`,
    summary.failing > 0 ? `${summary.failing} failing` : null,
    `${summary.agentsWorking} agent${summary.agentsWorking === 1 ? '' : 's'} working`,
  ].filter(Boolean).join(' · ');

  const allIds = [...data.needsYou, ...data.failing, ...data.inProgress, ...data.shipped].map((s) => s.id);

  return (
    <PageLayout icon={HomeIcon} title={title} description={description}>
      <div className="flex flex-col gap-6">
        <AttributeCard title="Needs you" icon={Lock} testId="home-needs-you">
          {data.needsYou.length ? (
            <div className="flex flex-col">
              {data.needsYou.map((s) => <NeedsYouRow key={s.id} story={s} onOpen={setOpen} cardHref={routes.card(s.id)} />)}
            </div>
          ) : <EmptyState compact icon={CheckCircle2} title="Nothing needs you" description="A gate, a question or a failing check waiting on a person shows up here." />}
        </AttributeCard>

        {data.failing.length > 0 ? (
          <AttributeCard title="Failing" icon={AlertCircle} testId="home-failing">
            <div className="flex flex-col">
              {data.failing.map((s) => (
                <FieldRow
                  key={s.id}
                  label={s.id}
                  value={<button type="button" className="truncate text-left hover:underline" onClick={() => setOpen(s.id)}>{s.title}</button>}
                  adornment={<StatePill display={s.display} />}
                  testId={`home-failing-row-${s.id}`}
                />
              ))}
            </div>
          </AttributeCard>
        ) : null}

        <AttributeCard title="In progress" icon={Workflow} testId="home-in-progress">
          {data.inProgress.length ? (
            <div className="flex flex-col">
              {data.inProgress.map((s) => (
                <FieldRow
                  key={s.id}
                  label={s.id}
                  value={<button type="button" className="truncate text-left hover:underline" onClick={() => setOpen(s.id)}>{s.title}</button>}
                  valueLeading={<Holder agent={s.agent} />}
                  adornment={<StatePill display={s.display} agent={s.agent} />}
                  testId={`home-in-progress-row-${s.id}`}
                />
              ))}
            </div>
          ) : <EmptyState compact icon={Workflow} title="Nothing in progress" description="A story an agent or a person has picked up shows up here." />}
        </AttributeCard>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <AttributeCard title="Agents now" icon={Bot} testId="home-agents">
            {data.agents.length ? (
              <ItemGroup className="gap-2">
                {data.agents.map((a) => (
                  <Item key={a.session} variant="outline" size="sm" className="flex-col items-stretch" render={<Link href={routes.card(a.card)} />} data-testid={`home-agent-tile-${a.card}`} data-stalled={a.stalled || undefined}>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="flex w-full min-w-0 items-center gap-2">
                        <Holder agent={a.label} />
                        <span className="truncate">{a.label}</span>
                        <Badge variant="outline" className={cn('ml-auto shrink-0 rounded-full', AGENT_STATE[a.state])}>{a.state}</Badge>
                      </ItemTitle>
                      <ItemDescription className="truncate text-foreground">{a.card} {a.title}{a.stage ? <span className="text-muted-foreground"> · {a.stage}</span> : null}</ItemDescription>
                      {a.last ? <ItemDescription className="truncate">{a.last.text} · {ago(a.last.at)}</ItemDescription> : null}
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            ) : <EmptyState compact icon={Bot} title="No agent is working" description="A session working a story shows up here while it runs." />}
          </AttributeCard>

          <OrchestratingTiles />

          <AttributeCard title="Shipped this week" icon={CheckCircle2} testId="home-shipped">
            {data.shipped.length ? (
              <div className="flex flex-col">
                {data.shipped.map((s) => <FieldRow key={s.id} label={s.id} value={<Link href={routes.card(s.id)} className="truncate hover:underline">{s.title}</Link>} testId={`home-shipped-row-${s.id}`} />)}
              </div>
            ) : <EmptyState compact icon={CheckCircle2} title="Nothing shipped yet" description="Stories that reach done or ship in the last 7 days show here." />}
          </AttributeCard>
        </div>
      </div>
      {open ? <CardDrawer id={open} onClose={() => setOpen(null)} ids={allIds} onNavigate={setOpen} /> : null}
    </PageLayout>
  );
}
