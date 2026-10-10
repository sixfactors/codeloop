import { HydrationBoundary } from '@tanstack/react-query';
import { InboxView } from '@/components/shared/inbox-view';
import { cardCountQueryOptions, inboxQueryOptions, inboxSince } from '@/lib/queries';
import { dehydrated, getQueryClient } from '@/lib/query-server';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const qc = getQueryClient();
  // Three lists of 50 and the per-lane numbers in one request, plus the backlog count.
  await Promise.all([qc.prefetchQuery(inboxQueryOptions({ shippedSince: inboxSince(), sort: 'score' })), qc.prefetchQuery(cardCountQueryOptions({ stage: ['proposed'] }))]);
  return (
    <HydrationBoundary state={dehydrated(qc)}>
      <InboxView />
    </HydrationBoundary>
  );
}
