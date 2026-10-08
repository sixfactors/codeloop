import { HydrationBoundary } from '@tanstack/react-query';
import { EvidencePage } from './evidence-page';
import { api } from '@/lib/api';
import { QK } from '@/lib/queries';
import { dehydrated, getQueryClient } from '@/lib/query-server';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ nnn: string }> }) {
  const nnn = decodeURIComponent((await params).nnn);
  const qc = getQueryClient();
  await qc.prefetchQuery({ queryKey: QK.evidence(nnn), queryFn: () => api.evidence(nnn), retry: false });
  return (
    <HydrationBoundary state={dehydrated(qc)}>
      <EvidencePage nnn={nnn} />
    </HydrationBoundary>
  );
}
