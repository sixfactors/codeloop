import { Suspense } from 'react';
import { HydrationBoundary } from '@tanstack/react-query';
import { WikiBrowser } from '@/components/shared/wiki-browser';
import { pagesQueryOptions } from '@/lib/queries';
import { dehydrated, getQueryClient } from '@/lib/query-server';

export const dynamic = 'force-dynamic';

export default async function WikiIndex() {
  const qc = getQueryClient();
  await qc.prefetchInfiniteQuery(pagesQueryOptions());
  // Suspense: useSearchParams (the ?q= and ?edit= state) needs a boundary.
  return (
    <HydrationBoundary state={dehydrated(qc)}>
      <Suspense><WikiBrowser path="" /></Suspense>
    </HydrationBoundary>
  );
}
