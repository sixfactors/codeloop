import { HydrationBoundary } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { InitiativesTable } from '@/components/shared/initiatives-table';
import { PageLayout } from '@/components/shared/page-layout';
import { api } from '@/lib/api';
import { QK } from '@/lib/queries';
import { dehydrated, getQueryClient } from '@/lib/query-server';

export const dynamic = 'force-dynamic';

export default async function InitiativesPage() {
  const qc = getQueryClient();
  await qc.prefetchQuery({ queryKey: QK.initiatives, queryFn: api.initiativesList, retry: false });
  return (
    <HydrationBoundary state={dehydrated(qc)}>
      <PageLayout icon={Layers} title="Initiatives" description="Every initiative with its epics, features and stories. Open one to see which features belong to which epic.">
        <InitiativesTable />
      </PageLayout>
    </HydrationBoundary>
  );
}
