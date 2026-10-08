import { HydrationBoundary } from '@tanstack/react-query';
import { Kanban } from 'lucide-react';
import { Board } from '@/components/shared/board';
import { backlogQuery, filtersFromUrl, laneColumns, toQuery } from '@/lib/board-columns';
import { PageLayout } from '@/components/shared/page-layout';
import { api } from '@/lib/api';
import { deriveLanes } from '@/lib/cards';
import { cardCountQueryOptions, cardsQueryOptions, QK } from '@/lib/queries';
import { dehydrated, getQueryClient } from '@/lib/query-server';
import type { Lane } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const initial = filtersFromUrl(await searchParams);
  const base = toQuery(initial);
  const qc = getQueryClient();
  // The first page of cards is prefetched by the layout (the shell needs it too). The board draws
  // one small page per column, so the same column queries are filled here, 50 rows each.
  const [lanes] = await Promise.all([
    qc.fetchQuery({ queryKey: QK.lanes, queryFn: api.lanes, retry: false }).catch(() => [] as Lane[]),
    qc.prefetchQuery({ queryKey: QK.facets, queryFn: api.cardFacets, retry: false }),
  ]);
  const first = qc.getQueryData<{ pages: { lanes?: Lane[] }[] }>(cardsQueryOptions().queryKey)?.pages[0];
  const known = deriveLanes([], lanes.length ? lanes : first?.lanes);
  const columns = [backlogQuery(base), ...known.flatMap((lane) => laneColumns(lane, base, Boolean(initial.facets.dropped?.length)).map((c) => c.query))];
  await Promise.all([...columns.map((q) => qc.prefetchInfiniteQuery(cardsQueryOptions(q))), qc.prefetchQuery(cardCountQueryOptions(base))]);
  return (
    <HydrationBoundary state={dehydrated(qc)}>
      <PageLayout icon={Kanban} title="Board" description="Every card by lane and stage. Proposed cards wait in the backlog.">
        <Board initial={initial} />
      </PageLayout>
    </HydrationBoundary>
  );
}
