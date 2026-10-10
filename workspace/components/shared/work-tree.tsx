'use client';

// The initiative › epic › feature › story tree, one component for three roots: /initiatives/[id]
// draws every epic (and the features naming no epic), /epics/[id] one epic, /features/[id] one
// feature. Epic and feature rows are collapsibles; stories stay folded under their feature and open
// the card sheet when expanded. "Show on board" narrows the board to that container through its
// URL. The tree is one request (`/api/initiatives/:id/tree`, `/api/epics/:id/tree`,
// `/api/features/:id`); every count and score on the page is the API's.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ChevronRight, Flag, Gauge, Kanban, Layers, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BandChip, fmtScore } from '@/components/shared/band-chip';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { MetaChip } from '@/components/shared/meta-chip';
import { PageLayout, type PageBreadcrumb } from '@/components/shared/page-layout';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { ProgressBar } from '@/components/shared/progress-bar';
import { RecordStatRow } from '@/components/shared/record-layout';
import { isMissing, useEpicTree, useFeature, useInitiativeTree } from '@/hooks/use-api';
import { isShipped } from '@/lib/cards';
import { routes } from '@/lib/routes';
import type { Card as CardT, TreeEpic, TreeFeature, TreeStory } from '@/lib/types';
import { cn } from '@/lib/utils';

const CardDrawer = dynamic(() => import('@/components/shared/card-drawer').then((m) => m.CardDrawer), { ssr: false });
const ScoreFeatureDialog = dynamic(() => import('@/components/shared/score-feature-dialog').then((m) => m.ScoreFeatureDialog), { ssr: false });

export type TreeRoot = { kind: 'initiative' | 'epic' | 'feature'; id: string };

/** A row group the tree draws: a real epic, or the "no epic" group holding an initiative's loose features. */
type EpicGroup = Pick<TreeEpic, 'id' | 'title' | 'features'> & Partial<Pick<TreeEpic, 'status' | 'goal' | 'score'>> & { loose?: boolean };

interface TreeView {
  title: string;
  status?: string;
  metric?: string;
  goal?: string;
  score?: number;
  initiative?: string;
  epic?: string;
  release?: string;
  epics: EpicGroup[];
  feature?: TreeFeature;
}

function useTree(root: TreeRoot) {
  const initiative = useInitiativeTree(root.kind === 'initiative' ? root.id : '');
  const epic = useEpicTree(root.kind === 'epic' ? root.id : '');
  const feature = useFeature(root.kind === 'feature' ? root.id : '');
  const served = root.kind === 'initiative' ? initiative : root.kind === 'epic' ? epic : feature;
  const view = useMemo<TreeView | undefined>(() => {
    if (root.kind === 'initiative' && initiative.data) {
      const t = initiative.data;
      const epics: EpicGroup[] = [...t.epics];
      if (t.features.length) epics.push({ id: '', title: 'No epic', features: t.features, loose: true });
      return { title: t.title, status: t.status, metric: t.metric, goal: t.goal, score: t.score, epics };
    }
    if (root.kind === 'epic' && epic.data) {
      const t = epic.data;
      return { title: t.title, status: t.status, goal: t.goal, score: t.score, initiative: t.initiative, epics: [t] };
    }
    if (root.kind === 'feature' && feature.data) {
      const f = feature.data;
      return { title: f.title, status: f.status, score: f.score, initiative: f.initiative, epic: f.epic, release: f.release, feature: f, epics: [{ id: f.epic ?? '', title: f.epic ?? 'No epic', features: [f], loose: !f.epic }] };
    }
    return undefined;
  }, [root.kind, initiative.data, epic.data, feature.data]);
  return { view, isLoading: served.isLoading, error: served.error, refetch: served.refetch };
}

const shipped = (s: TreeStory) => isShipped({ stage: s.stage } as CardT);
const stageTone = (s: TreeStory) => (shipped(s) ? 'bg-success/15 text-success' : s.gate || s.awaiting ? 'bg-warning/15 text-warning-foreground dark:text-warning' : '');

function StoriesTable({ stories, onOpen }: { stories: TreeStory[]; onOpen: (id: string) => void }) {
  if (!stories.length) return <p className="px-3 py-2 text-xs text-muted-foreground">No stories yet.</p>;
  return (
    <Table className="text-[13px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 w-20">Id</TableHead>
          <TableHead className="h-8">Story</TableHead>
          <TableHead className="h-8 w-24">Stage</TableHead>
          <TableHead className="h-8 w-28">Gate</TableHead>
          <TableHead className="h-8 w-16">Band</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stories.map((s) => (
          <TableRow key={s.id} className="cursor-pointer" tabIndex={0} role="button" aria-label={`${s.id} ${s.title}`} onClick={() => onOpen(s.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(s.id); } }} data-testid={`tree-story-${s.id}`}>
            <TableCell className="py-1.5 font-mono text-xs text-muted-foreground">{s.id}</TableCell>
            <TableCell className="max-w-[28rem] py-1.5"><span className="block truncate" title={s.title}>{s.title}</span></TableCell>
            <TableCell className="py-1.5"><Badge variant="secondary" className={cn('rounded-full', stageTone(s))}>{s.stage}</Badge></TableCell>
            <TableCell className="py-1.5">{s.gate || s.awaiting ? <Badge variant="secondary" className="max-w-[7rem] truncate rounded-full bg-warning/15 text-warning-foreground dark:text-warning" title={String(s.gate ?? s.awaiting)}>{s.gate ?? s.awaiting}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
            <TableCell className="py-1.5"><BandChip band={s.band} score={s.score} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RowShell({ depth, open, children, trailing, testId }: { depth: 0 | 1; open: boolean; children: React.ReactNode; trailing: React.ReactNode; testId?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2 py-2', depth === 0 ? 'px-3' : 'pr-3 pl-8')} data-testid={testId} data-open={open}>
      <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        {children}
      </CollapsibleTrigger>
      <span className="flex shrink-0 items-center gap-2">{trailing}</span>
    </div>
  );
}

/** `compact`: a narrow column (the roadmap), no release chip, Board or Open; the title keeps the width. */
export function FeatureRow({ feature, defaultOpen, link, onOpen, compact }: { feature: TreeFeature; defaultOpen: boolean; link: boolean; onOpen: (id: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border/60">
      <RowShell depth={1} open={open} testId={`tree-feature-${feature.id}`} trailing={
        <>
          {feature.release && !compact ? <MetaChip label="Release" value={feature.release} className="hidden sm:inline-flex" /> : null}
          <ProgressBar done={feature.done} total={feature.total} className="hidden sm:inline-flex" />
          <span className="w-10 text-right text-xs font-medium tabular-nums">{fmtScore(feature.score)}</span>
          {!compact ? <Button size="xs" variant="ghost" className="hidden sm:inline-flex" nativeButton={false} render={<Link href={routes.boardFor('feature', feature.id)} />} title="Board, narrowed to this feature"><Kanban />Board</Button> : null}
          {link && !compact ? <Button size="xs" variant="ghost" className="hidden sm:inline-flex" nativeButton={false} render={<Link href={routes.feature(feature.id)} />}>Open</Button> : null}
        </>
      }>
        {compact ? <Link href={routes.feature(feature.id)} className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={(e) => e.stopPropagation()} title={feature.title}>{feature.title}</Link> : <span className="min-w-0 flex-1 truncate text-sm">{feature.title}</span>}
        <BandChip band={feature.band} score={feature.score} />
        {feature.status ? <Badge variant="outline" className="hidden rounded-full md:inline-flex">{feature.status}</Badge> : null}
        <span className="text-xs text-muted-foreground tabular-nums sm:hidden">{feature.done}/{feature.total}</span>
      </RowShell>
      <CollapsibleContent className="pb-2 pl-8">
        <StoriesTable stories={feature.stories} onOpen={onOpen} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function EpicRow({ epic, defaultOpen, link, onOpen, featuresOpen }: { epic: EpicGroup; defaultOpen: boolean; link: boolean; onOpen: (id: string) => void; featuresOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const done = epic.features.reduce((n, f) => n + f.done, 0);
  const total = epic.features.reduce((n, f) => n + f.total, 0);
  const score = epic.score ?? epic.features.reduce((n, f) => n + (f.score ?? 0), 0);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border bg-card">
      <RowShell depth={0} open={open} testId={`tree-epic-${epic.id || 'none'}`} trailing={
        <>
          <ProgressBar done={done} total={total} className="hidden sm:inline-flex" />
          <span className="w-10 text-right text-xs font-medium tabular-nums">{fmtScore(score)}</span>
          {!epic.loose ? <Button size="xs" variant="ghost" className="hidden sm:inline-flex" nativeButton={false} render={<Link href={routes.boardFor('epic', epic.id)} />} title="Board, narrowed to this epic"><Kanban />Board</Button> : null}
          {!epic.loose && link ? <Button size="xs" variant="ghost" className="hidden sm:inline-flex" nativeButton={false} render={<Link href={routes.epic(epic.id)} />}>Open</Button> : null}
        </>
      }>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{epic.title}</span>
        {epic.status ? <Badge variant="outline" className="hidden rounded-full md:inline-flex">{epic.status}</Badge> : null}
        <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">{epic.features.length} features</span>
        <span className="text-xs text-muted-foreground tabular-nums sm:hidden">{done}/{total}</span>
      </RowShell>
      <CollapsibleContent>
        {epic.features.length ? epic.features.map((f) => <FeatureRow key={f.id} feature={f} defaultOpen={featuresOpen} link={link} onOpen={onOpen} />) : <p className="border-t px-3 py-2 text-xs text-muted-foreground">No features yet.</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}

const KIND_TITLE = { initiative: 'Initiative', epic: 'Epic', feature: 'Feature' } as const;

export function WorkTree({ root }: { root: TreeRoot }) {
  const { view, isLoading, error, refetch } = useTree(root);
  const [open, setOpen] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const ids = useMemo(() => view?.epics.flatMap((e) => e.features.flatMap((f) => f.stories.map((s) => s.id))) ?? [], [view]);

  const crumbs: PageBreadcrumb[] = [{ label: 'Initiatives', href: routes.initiatives }];
  if (view?.initiative && root.kind !== 'initiative') crumbs.push({ label: view.initiative, href: routes.initiative(view.initiative) });
  if (view?.epic && root.kind === 'feature') crumbs.push({ label: view.epic, href: routes.epic(view.epic) });
  crumbs.push({ label: view?.title ?? root.id });

  const header = { icon: root.kind === 'feature' ? Target : Layers, backHref: root.kind === 'feature' && view?.epic ? routes.epic(view.epic) : root.kind !== 'initiative' && view?.initiative ? routes.initiative(view.initiative) : routes.initiatives };

  if (isLoading || !view) {
    return (
      <PageLayout {...header} title={root.id} breadcrumbs={crumbs} description={`${KIND_TITLE[root.kind]}`}>
        {error ? (
          isMissing(error)
            ? <EmptyState icon={Layers} title={`No ${root.kind} named ${root.id}`} description={`Nothing under .codeloop/wiki/${root.kind}s has that slug.`} action={{ label: 'All initiatives', href: routes.initiatives }} />
            : <InlineError title={`${KIND_TITLE[root.kind]} failed to load`} error={error} onRetry={() => refetch()} />
        ) : <PageSkeleton statCards={4} showToolbar={false} tableRows={3} />}
      </PageLayout>
    );
  }

  const features = view.epics.reduce((n, e) => n + e.features.length, 0);
  const total = view.epics.reduce((n, e) => n + e.features.reduce((m, f) => m + f.total, 0), 0);
  const done = view.epics.reduce((n, e) => n + e.features.reduce((m, f) => m + f.done, 0), 0);
  const description = [view.metric ? `Metric: ${view.metric}` : null, view.goal ? `Goal: ${view.goal}` : null].filter(Boolean).join(' · ') || `${KIND_TITLE[root.kind]} ${root.id}`;
  const rice = view.feature?.rice;

  return (
    <PageLayout
      {...header}
      title={view.title}
      description={description}
      breadcrumbs={crumbs}
      badge={
        <>
          <Badge variant="outline" className="rounded-full">{KIND_TITLE[root.kind]}</Badge>
          {view.status ? <Badge variant="secondary" className="rounded-full">{view.status}</Badge> : null}
          {view.feature ? <BandChip band={view.feature.band} score={view.feature.score} /> : null}
          <MetaChip label="Score" value={fmtScore(view.score)} tone={view.score ? 'good' : 'default'} />
          {view.release ? <MetaChip label="Release" value={view.release} /> : null}
          {rice ? <MetaChip label="RICE" value={`${rice.reach} · ${rice.impact} · ${rice.confidence} / ${rice.effort}w`} className="hidden md:inline-flex" /> : null}
        </>
      }
      actions={
        <>
          {view.feature ? <Button size="sm" onClick={() => setScoring(true)} data-testid="feature-score"><Gauge />{rice ? 'Rescore' : 'Score'}</Button> : null}
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={routes.boardFor(root.kind, root.id)} />} data-testid="tree-show-on-board"><Kanban />Show on board</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RecordStatRow
          testId="tree-stats"
          stats={[
            ...(root.kind === 'initiative' ? [{ label: 'Epics', value: view.epics.filter((e) => !e.loose).length }] : []),
            ...(root.kind !== 'feature' ? [{ label: 'Features', value: features }] : []),
            { label: 'Stories done', value: `${done}/${total}` },
            { label: 'Score', value: fmtScore(view.score) },
          ]}
        />
        {view.epics.length === 0 ? (
          <EmptyState icon={root.kind === 'initiative' ? Flag : Gauge} title="Nothing under this yet" description={root.kind === 'initiative' ? 'Epics and features that name this initiative appear here; a story names its feature, a feature its initiative.' : 'Stories naming this appear here once a story carries it.'} />
        ) : (
          <div className="flex flex-col gap-3" data-testid="work-tree">
            {view.epics.map((e) => <EpicRow key={e.id || 'none'} epic={e} defaultOpen link={root.kind === 'initiative'} featuresOpen={root.kind === 'feature'} onOpen={setOpen} />)}
          </div>
        )}
      </div>
      {open ? <CardDrawer id={open} onClose={() => setOpen(null)} ids={ids} onNavigate={setOpen} /> : null}
      {scoring && view.feature ? <ScoreFeatureDialog feature={view.feature} open onOpenChange={(o) => { if (!o) setScoring(false); }} /> : null}
    </PageLayout>
  );
}
