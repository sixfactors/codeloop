import { HydrationBoundary } from '@tanstack/react-query';
import { Kanban } from 'lucide-react';
import { Board } from '@/components/shared/board';
import { HubHome } from '@/components/shared/hub-home';
import { backlogQuery } from '@/lib/board-columns';
import { PageLayout } from '@/components/shared/page-layout';
import { boardQueryOptions, cardsQueryOptions } from '@/lib/queries';
import { dehydrated, getQueryClient } from '@/lib/query-server';
import { currentProjectServer, hubModeServer } from '@/lib/project';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  // The hub's bare `/` (no project in the URL) has no board to show; list every registered
  // project and what needs a person across all of them instead.
  if ((await hubModeServer()) && !(await currentProjectServer())) return <HubHome />;
  const qc = getQueryClient();
  // GET /api/board carries the four state columns already grouped; the backlog strip is the one
  // thing it only counts, not lists, so its own card page is prefetched alongside it.
  await Promise.all([
    qc.prefetchQuery(boardQueryOptions()),
    qc.prefetchInfiniteQuery(cardsQueryOptions(backlogQuery({}))),
  ]);
  return (
    <HydrationBoundary state={dehydrated(qc)}>
      <PageLayout icon={Kanban} title="Board" description="Each story in the phase it has reached, grouped by who holds it: you, an agent, or nobody yet.">
        <Board />
      </PageLayout>
    </HydrationBoundary>
  );
}
