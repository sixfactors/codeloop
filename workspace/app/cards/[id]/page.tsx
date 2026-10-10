import { HydrationBoundary } from '@tanstack/react-query';
import { CardPage } from './card-page';
import { cardQueryOptions } from '@/lib/queries';
import { dehydrated, getQueryClient } from '@/lib/query-server';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const qc = getQueryClient();
  await qc.prefetchQuery(cardQueryOptions(id, qc));
  return (
    <HydrationBoundary state={dehydrated(qc)}>
      <CardPage id={id} />
    </HydrationBoundary>
  );
}
