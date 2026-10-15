'use client';

// One card, two presentations (design contract §6): the full page (push from a link) wraps the body
// in PageLayout; the board opens the same body inside DetailSheet. Body = RecordLayout: an
// AttributeCard rail of FieldRows (facts) and a gate card, then RecordStatRow + tabs in the main.

import { useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays, ClipboardList, ExternalLink, FileText, Flag, Gauge, Hash, Ruler, Target, User, Waypoints, BookOpen, FolderOpen,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { AttributeCard, RecordLayout } from '@/components/shared/record-layout';
import { FieldRow, FieldSectionLabel } from '@/components/shared/field-row';
import { MetaChip } from '@/components/shared/meta-chip';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { BandChip } from '@/components/shared/band-chip';
import { ToneBadge } from '@/components/shared/board-card';
import { Questions } from '@/components/shared/questions';
import { Markdown } from '@/components/shared/markdown';
import { JourneyStepper } from '@/components/shared/journey-stepper';
import { CurrentStepPanel } from '@/components/shared/current-step-panel';
import { TasksAndCommits } from '@/components/shared/tasks-commits';
import { OrchestrationSection } from '@/components/shared/orchestration-section';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { CardOutputTab } from '@/components/shared/card-output-tab';
import { CardActionMenu } from '@/components/shared/card-action-menu';
import { useCard, useCardFull, useCardOutput, isMissing } from '@/hooks/use-api';
import { mockUrl } from '@/lib/api';
import { evidenceId } from '@/lib/routes';
import { useRoutes } from '@/components/providers/project-provider';
import type { Card as CardT, EvidenceFile } from '@/lib/types';

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : undefined);

export function storyLine(card: CardT): string | undefined {
  const s = card.story;
  if (s?.as || s?.can || s?.so) return `As a ${s.as ?? '-'}, I can ${s.can ?? '-'}, so that ${s.so ?? '-'}.`;
  return card.description;
}

export function CardHeaderTags({ card }: { card: CardT }) {
  return (
    <>
      <Badge variant="secondary" className="rounded-full">{card.stage}</Badge>
      <BandChip band={card.band} score={card.score} />
      <ToneBadge card={card} />
    </>
  );
}

export function CardActions({ card, inSheet }: { card: CardT; inSheet?: boolean }) {
  const routes = useRoutes();
  return (
    <>
      {card.mock ? <Button size="sm" variant="outline" nativeButton={false} render={<a href={mockUrl(card.mock)} target="_blank" rel="noreferrer" />}><ExternalLink />Mock</Button> : null}
      <Button size="sm" variant="outline" nativeButton={false} render={<Link href={routes.wiki(`.codeloop/wiki/cards/${card.id}.md`)} />}><BookOpen />Wiki</Button>
      <Button size="sm" variant="outline" nativeButton={false} render={<Link href={routes.evidence(evidenceId(card.id))} />}><FolderOpen />Evidence</Button>
      {inSheet ? <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={routes.card(card.id)} />}>Open page</Button> : null}
      <CardActionMenu card={card} />
    </>
  );
}

export function CardDetailSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]" aria-busy="true">
      <div className="space-y-2 rounded-xl border bg-card p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** What the current phase has produced: its output file rendered, evidence and questions, each once. The tasks are in the Tasks and commits panel. */
function ProducedByStep({ card, full }: { card: CardT; full: ReturnType<typeof useCardFull> }) {
  const routes = useRoutes();
  const output = useCardOutput(card.id);
  const [editing, setEditing] = useState(false);
  const evidence: (EvidenceFile | string)[] = full.data?.evidence ?? card.evidence ?? [];
  const answeredCount = (full.data?.questions ?? []).filter((q) => q.answer).length;
  // What earlier phases wrote (the card's own evidence list), shown when this phase has written nothing yet.
  const earlier = (card.evidence ?? []).filter((p) => p !== output.data?.path);
  return (
    <div className="flex flex-col gap-4" data-testid="produced">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">Output</h3>
          {output.data?.path ? <span className="font-mono text-xs text-muted-foreground break-all">{output.data.path}</span> : null}
          <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setEditing((e) => !e)} data-testid="edit-output">{editing ? 'Done editing' : 'Edit'}</Button>
        </div>
        {editing ? <CardOutputTab card={card} />
          : output.data?.text ? <div className="rounded-xl border bg-card p-4"><Markdown>{output.data.text}</Markdown></div>
          : !output.data && !output.error ? <Skeleton className="h-16 w-full" />
          : earlier.length ? (
            <div className="flex flex-col gap-1.5 rounded-xl border bg-card p-3" data-testid="earlier-evidence">
              <p className="text-xs text-muted-foreground">{output.data?.path ? `This phase writes ${output.data.path}; until it does, here is what earlier phases produced.` : 'This phase writes no file; here is what earlier phases produced.'}</p>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase">Earlier evidence</h4>
              <ul className="flex flex-col gap-1">{earlier.map((p) => <li key={p} className="font-mono text-xs break-all">{p}</li>)}</ul>
            </div>
          )
          : <EmptyState compact icon={FileText} title="Nothing written in this phase yet" description={output.data?.path ? `This phase writes ${output.data.path}.` : 'This phase has no output file.'} />}
      </section>
      {evidence.length ? (
        <section className="flex flex-col gap-2" data-testid="evidence">
          <div className="flex items-center gap-2"><h3 className="text-sm font-medium">Evidence</h3><Button size="xs" variant="ghost" className="ml-auto" nativeButton={false} render={<Link href={routes.evidence(evidenceId(card.id))} />}>Open folder</Button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {evidence.map((e, i) => {
              const f = typeof e === 'string' ? { name: e } : e;
              const image = f.path && /\.(png|jpe?g)$/i.test(f.name);
              return (
                <figure key={`${f.name}-${i}`} className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-2">
                  {/* Evidence is served as files by the API; next/image would need it configured as a remote. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {image ? <a href={f.path} target="_blank" rel="noreferrer"><img src={f.path} alt={f.name} className="max-h-48 w-full rounded object-contain" /></a> : null}
                  <figcaption className="truncate font-mono text-xs text-muted-foreground" title={f.name}>{f.name}</figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      ) : null}
      {answeredCount ? (
        <section className="flex flex-col gap-2"><h3 className="text-sm font-medium">Answered questions</h3><Questions cardId={card.id} answered /></section>
      ) : null}
    </div>
  );
}

export function CardDetailBody({ card, stacked }: { card: CardT; stacked?: boolean }) {
  const routes = useRoutes();
  const full = useCardFull(card.id);
  const fullMissing = full.error && isMissing(full.error);
  const journey = full.data?.journey;
  const phases = journey?.steps.filter((s) => s.state !== 'ahead' && s.state !== 'skipped').map((s) => s.id) ?? [];

  const rail = (
    <AttributeCard title="Details" icon={ClipboardList} testId="card-details">
      <FieldRow icon={Hash} label="Id" value={card.id} mono />
      <FieldRow icon={Waypoints} label="Lane" value={card.lane} />
      <FieldRow icon={Target} label="Initiative" value={card.initiative} />
      <FieldRow icon={Flag} label="Epic" value={card.epic} href={card.epic ? routes.card(card.epic) : undefined} />
      <FieldRow icon={FileText} label="Feature" value={card.feature} />
      <FieldRow icon={Gauge} label="Metric" value={card.metric} />
      <FieldSectionLabel>Sizing</FieldSectionLabel>
      <FieldRow icon={Ruler} label="Size" value={card.size} />
      <FieldRow icon={Ruler} label="Points" value={card.points !== undefined ? String(card.points) : undefined} mono />
      <FieldRow icon={User} label="Persona" value={card.persona} />
      <FieldSectionLabel>Dates</FieldSectionLabel>
      <FieldRow icon={CalendarDays} label="Created" value={fmtDate(card.createdAt)} />
      <FieldRow icon={CalendarDays} label="Updated" value={fmtDate(card.updatedAt)} />
    </AttributeCard>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {journey ? <JourneyStepper journey={journey} /> : !full.data && !full.error ? <Skeleton className="h-12 w-full rounded-lg" /> : null}
      {/* Above the rail, so on a narrow screen what to do next comes before the story's details.
          Keyed by card: the drawer pager moving to another story must not carry this one's panel over. */}
      <CurrentStepPanel key={card.id} card={card} journey={journey} display={full.data?.card.display} rubric={full.data?.rubric} />
      <OrchestrationSection cardId={card.id} />
      {full.data ? <TasksAndCommits tasks={full.data.tasks ?? []} counts={full.data.journey?.tasks} commits={full.data.commits ?? []} /> : null}
      <RecordLayout rail={rail} className={stacked ? 'lg:grid-cols-1' : undefined}>
        <div className="flex min-w-0 flex-col gap-4">
          <Tabs defaultValue="output" key={`tabs-${card.id}`}>
            <TabsList className="h-auto w-full flex-wrap justify-start">
              <TabsTrigger value="output" data-testid="tab-output">Output</TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
              <TabsTrigger value="spec">Spec</TabsTrigger>
            </TabsList>
            <TabsContent value="output" className="pt-2"><ProducedByStep card={card} full={full} /></TabsContent>
            <TabsContent value="activity" className="pt-2"><ActivityFeed cardId={card.id} phases={phases} /></TabsContent>
            <TabsContent value="spec" className="pt-2">
              {full.data?.spec ? <Markdown>{full.data.spec}</Markdown>
                : !full.data && !full.error ? <Skeleton className="h-16 w-full" />
                : full.error && !fullMissing ? <InlineError title="Spec failed to load" error={full.error} onRetry={() => full.refetch()} />
                : <EmptyState compact icon={FileText} title="No spec yet" description={`The spec phase writes it${card.spec ? ` to ${card.spec}` : ''}.`} />}
            </TabsContent>
          </Tabs>
        </div>
      </RecordLayout>
    </div>
  );
}

/** Sheet body: loading → ready | missing | error, same body as the page. */
export function CardDetail({ id, stacked }: { id: string; stacked?: boolean }) {
  const routes = useRoutes();
  const { data: card, isLoading, error, refetch } = useCard(id);
  if (isLoading) return <CardDetailSkeleton />;
  if (error) return <InlineError title="Story failed to load" error={error} onRetry={() => refetch()} />;
  if (!card) return <EmptyState icon={Hash} title={`No story ${id}`} description="It may have been dropped or renamed." action={{ label: 'Back to board', href: routes.board }} />;
  return <CardDetailBody card={card} stacked={stacked} />;
}

export function CardSizingChips({ card }: { card: CardT }) {
  const sizing = card.points !== undefined ? `${card.points} pt` : card.size;
  return (
    <>
      {sizing ? <MetaChip label="Size" value={sizing} /> : null}
      {card.persona ? <MetaChip label="For" value={card.persona} /> : null}
      {card.initiative ? <MetaChip label="Initiative" value={card.initiative} /> : null}
    </>
  );
}
