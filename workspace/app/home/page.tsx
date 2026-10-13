import { HydrationBoundary } from '@tanstack/react-query';
import { HomeView } from '@/components/shared/home-view';
import { homeQueryOptions } from '@/lib/queries';
import { dehydrated, getQueryClient } from '@/lib/query-server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const qc = getQueryClient();
  await qc.prefetchQuery(homeQueryOptions());
  return (
    <HydrationBoundary state={dehydrated(qc)}>
      <HomeView />
    </HydrationBoundary>
  );
}
