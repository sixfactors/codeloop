import { WorkTree } from '@/components/shared/work-tree';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  return <WorkTree root={{ kind: 'feature', id }} />;
}
