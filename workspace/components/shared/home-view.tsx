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
import { useHome } from '@/hooks/use-api';
import { useRoutes } from '@/components/providers/project-provider';
import type { BoardStory } from '@/lib/types';

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
              <div className="flex flex-col">
                {data.agents.map((a) => (
                  <FieldRow
                    key={a.session}
                    label={a.session}
                    value={<Link href={routes.card(a.card)} className="truncate hover:underline">{a.title ?? a.card}</Link>}
                    valueLeading={<Holder agent={a.session} />}
                    testId={`home-agent-row-${a.session}`}
                  />
                ))}
              </div>
            ) : <EmptyState compact icon={Bot} title="No agent is working" description="A session working a story shows up here while it runs." />}
          </AttributeCard>

          <AttributeCard title="Shipped this week" icon={CheckCircle2} testId="home-shipped">
            {data.shipped.length ? (
              <div className="flex flex-col">
                {data.shipped.map((s) => <FieldRow key={s.id} label={s.id} value={s.title} href={routes.card(s.id)} testId={`home-shipped-row-${s.id}`} />)}
              </div>
            ) : <EmptyState compact icon={CheckCircle2} title="Nothing shipped yet" description="Stories that reach done or ship in the last 7 days show here." />}
          </AttributeCard>
        </div>
      </div>
      {open ? <CardDrawer id={open} onClose={() => setOpen(null)} ids={allIds} onNavigate={setOpen} /> : null}
    </PageLayout>
  );
}
