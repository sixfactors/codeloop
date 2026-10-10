'use client';

// The roadmap per docs/terminology.md: columns are releases (`next`, the tagged ones, then
// unscheduled for features naming no release); rows are initiative › epic › feature with the
// band chip, stories folded under their feature. The trees come from one request per initiative
// (`/api/initiatives/:id/tree`), the way the initiative pages read them; a feature naming no
// initiative comes from `/api/features` and sits under "No initiative" without its stories.

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Flag, Layers, Map, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BandChip, fmtScore } from '@/components/shared/band-chip';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { MetaChip } from '@/components/shared/meta-chip';
import { PageLayout } from '@/components/shared/page-layout';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { FeatureRow } from '@/components/shared/work-tree';
import { isMissing, useConfig, useFeatures, useInitiativeList, useInitiativeTrees } from '@/hooks/use-api';
import { routes } from '@/lib/routes';
import type { FeatureRow as FeatureListRow, InitiativeTree, TreeFeature } from '@/lib/types';

const CardDrawer = dynamic(() => import('@/components/shared/card-drawer').then((m) => m.CardDrawer), { ssr: false });

const UNSCHEDULED = 'unscheduled';
const releaseOf = (f: { release?: string | null }) => (f.release ? String(f.release) : UNSCHEDULED);
/** `next` first, tags in order, unscheduled last. */
function sortReleases(a: string, b: string) {
  if (a === b) return 0;
  if (a === 'next') return -1;
  if (b === 'next') return 1;
  if (a === UNSCHEDULED) return 1;
  if (b === UNSCHEDULED) return -1;
  return a.localeCompare(b);
}

type Row = { initiative: { id: string; title: string; score?: number }; epics: { id: string; title: string; loose?: boolean; features: TreeFeature[] }[] };

function rowsFor(trees: InitiativeTree[], loose: FeatureListRow[], release: string): Row[] {
  const rows: Row[] = [];
  for (const t of trees) {
    const epics = t.epics.map((e) => ({ id: e.id, title: e.title, features: e.features.filter((f) => releaseOf(f) === release) })).filter((e) => e.features.length);
    const noEpic = t.features.filter((f) => releaseOf(f) === release);
    if (noEpic.length) epics.push({ id: '', title: 'No epic', features: noEpic });
    if (epics.length) rows.push({ initiative: { id: t.id, title: t.title, score: t.score }, epics });
  }
  const orphans = loose.filter((f) => releaseOf(f) === release);
  if (orphans.length) rows.push({ initiative: { id: '', title: 'No initiative' }, epics: [{ id: '', title: 'No epic', loose: true, features: orphans.map((f) => ({ ...f, stories: [], done: 0, total: 0 })) }] });
  return rows;
}

export default function RoadmapPage() {
  const initiatives = useInitiativeList();
  const ids = useMemo(() => (initiatives.data ?? []).map((b) => b.id), [initiatives.data]);
  const trees = useInitiativeTrees(ids);
  const features = useFeatures();
  const config = useConfig();
  const [open, setOpen] = useState<string | null>(null);
  const cfg = config.data as { northStar?: string; north_star?: string } | undefined;
  const northStar = cfg?.northStar ?? cfg?.north_star;
  const description = northStar ? `North star: ${northStar}` : 'Releases across the top; initiative › epic › feature down the side, stories folded under each feature.';

  const loaded = useMemo(() => trees.map((t) => t.data).filter((t): t is InitiativeTree => Boolean(t)), [trees]);
  const treesPending = trees.some((t) => t.isPending);
  // Features naming no initiative: the list has them; the trees do not.
  const loose = useMemo(() => {
    const inTrees = new Set(loaded.flatMap((t) => [...t.epics.flatMap((e) => e.features.map((f) => f.id)), ...t.features.map((f) => f.id)]));
    return (features.data ?? []).filter((f) => !f.initiative && !inTrees.has(f.id));
  }, [features.data, loaded]);
  const releases = useMemo(() => {
    const all = new Set<string>();
    for (const t of loaded) for (const f of [...t.epics.flatMap((e) => e.features), ...t.features]) all.add(releaseOf(f));
    for (const f of loose) all.add(releaseOf(f));
    if (all.size === 0) all.add(UNSCHEDULED);
    return [...all].sort(sortReleases);
  }, [loaded, loose]);
  const storyIds = useMemo(() => loaded.flatMap((t) => [...t.epics.flatMap((e) => e.features), ...t.features].flatMap((f) => f.stories.map((s) => s.id))), [loaded]);

  if (initiatives.isPending || (treesPending && !loaded.length)) return <PageLayout icon={Map} title="Roadmap" description={description}><PageSkeleton statCards={3} showToolbar={false} tableRows={2} /></PageLayout>;
  if (initiatives.error) {
    return (
      <PageLayout icon={Map} title="Roadmap" description={description}>
        {isMissing(initiatives.error)
          ? <EmptyState icon={Map} title="Initiatives are not served yet" description="GET /api/initiatives is being added. Releases × initiative › epic › feature land here." />
          : <InlineError title="Initiatives failed to load" error={initiatives.error} onRetry={() => initiatives.refetch()} />}
      </PageLayout>
    );
  }

  const empty = loaded.every((t) => !t.epics.length && !t.features.length) && !loose.length;

  return (
    <PageLayout icon={Map} title="Roadmap" description={description} actions={<Button size="sm" variant="outline" nativeButton={false} render={<Link href={routes.initiatives} />}><Layers />Initiatives</Button>}>
      {empty ? (
        <EmptyState icon={Map} title="No features yet" description="Write a feature under .codeloop/wiki/features naming its initiative and a release: and it appears in that release's column." />
      ) : (
        <div className="-mx-1 overflow-x-auto px-1 pb-2">
          <div className="grid min-w-full gap-4 lg:auto-cols-[minmax(320px,1fr)] lg:grid-flow-col" data-testid="roadmap">
            {releases.map((release) => {
              const rows = rowsFor(loaded, loose, release);
              const count = rows.reduce((n, r) => n + r.epics.reduce((m, e) => m + e.features.length, 0), 0);
              return (
                <section key={release} className="flex min-w-0 flex-col gap-2.5" data-testid={`release-${release}`}>
                  <div className="flex items-baseline gap-2 border-b-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    {release === UNSCHEDULED ? 'Unscheduled' : release === 'next' ? 'Next release' : release}
                    <b className="font-semibold text-foreground tabular-nums">{count}</b>
                  </div>
                  {rows.length === 0 ? (
                    <EmptyState compact icon={Flag} title={release === UNSCHEDULED ? 'Everything is scheduled' : `Nothing in ${release}`} description="Set release: on a feature page to place it here." />
                  ) : rows.map((row) => (
                    <div key={row.initiative.id || 'none'} className="rounded-xl border bg-card" data-testid={`roadmap-initiative-${row.initiative.id || 'none'}`}>
                      <div className="flex min-w-0 items-center gap-2 border-b px-3 py-2">
                        <Target className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        {row.initiative.id ? <Link href={routes.initiative(row.initiative.id)} className="truncate text-sm font-medium hover:underline">{row.initiative.title}</Link> : <span className="truncate text-sm font-medium text-muted-foreground">{row.initiative.title}</span>}
                        {row.initiative.score !== undefined ? <MetaChip label="Score" value={fmtScore(row.initiative.score)} className="ml-auto hidden sm:inline-flex" /> : null}
                      </div>
                      {row.epics.map((epic) => (
                        <div key={epic.id || 'none'} className="border-b last:border-b-0">
                          <div className="flex min-w-0 items-center gap-2 bg-muted/30 px-3 py-1.5">
                            <Flag className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            {epic.id ? <Link href={routes.epic(epic.id)} className="truncate text-xs font-medium hover:underline">{epic.title}</Link> : <span className="truncate text-xs font-medium text-muted-foreground">{epic.title}</span>}
                            <Badge variant="outline" className="ml-auto rounded-full text-[10px]">{epic.features.length}</Badge>
                          </div>
                          {epic.loose ? (
                            epic.features.map((f) => (
                              <div key={f.id} className="flex min-w-0 items-center gap-2 border-t border-border/60 py-2 pr-3 pl-8" data-testid={`roadmap-feature-${f.id}`}>
                                <Link href={routes.feature(f.id)} className="truncate text-sm hover:underline">{f.title}</Link>
                                <BandChip band={f.band} score={f.score} />
                                <span className="ml-auto w-10 text-right text-xs font-medium tabular-nums">{fmtScore(f.score)}</span>
                              </div>
                            ))
                          ) : epic.features.map((f) => <FeatureRow key={f.id} feature={f} defaultOpen={false} link compact onOpen={setOpen} />)}
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      )}
      {open ? <CardDrawer id={open} onClose={() => setOpen(null)} ids={storyIds} onNavigate={setOpen} /> : null}
    </PageLayout>
  );
}
