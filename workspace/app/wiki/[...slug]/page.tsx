import { Suspense } from 'react';
import { HydrationBoundary } from '@tanstack/react-query';
import { WikiBrowser } from '@/components/shared/wiki-browser';
import { pageQueryOptions, pagesQueryOptions } from '@/lib/queries';
import { dehydrated, getQueryClient } from '@/lib/query-server';

export const dynamic = 'force-dynamic';

export default async function WikiPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const path = (await params).slug.map(decodeURIComponent).join('/');
  const qc = getQueryClient();
  await Promise.all([qc.prefetchInfiniteQuery(pagesQueryOptions()), qc.prefetchQuery(pageQueryOptions(path))]);
  return (
    <HydrationBoundary state={dehydrated(qc)}>
      <Suspense><WikiBrowser path={path} /></Suspense>
    </HydrationBoundary>
  );
}
