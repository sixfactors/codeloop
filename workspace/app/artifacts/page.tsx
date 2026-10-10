'use client';

// Mocks and published pages, grouped by topic. Each one is an EntityCard (title, lineage line,
// kind / project chips, Open / Story in the menu); picking one previews it beside the list.

import { useMemo, useState } from 'react';
import { ExternalLink, Image as ImageIcon, Images, Kanban } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '@/components/shared/page-layout';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { EntityCard } from '@/components/shared/entity-card';
import { MetaChip } from '@/components/shared/meta-chip';
import { SavedViewTabs } from '@/components/shared/saved-view-tabs';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { isMissing, useArtifacts, useCards } from '@/hooks/use-api';
import { API_BASE, mockUrl } from '@/lib/api';
import { routes } from '@/lib/routes';
import type { Artifact } from '@/lib/types';

type ArtifactRow = Artifact & { href?: string; lineage?: string[] };
const hrefOf = (a: ArtifactRow) => a.url ?? (a.href ? `${API_BASE}${a.href}` : '');

export default function ArtifactsPage() {
  const artifacts = useArtifacts();
  const cards = useCards({ limit: 200 }, { all: true });
  const router = useRouter();
  const [open, setOpen] = useState<ArtifactRow | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  // Until /api/artifacts exists, the mocks on cards are the gallery.
  const items: ArtifactRow[] = useMemo(() => {
    if (artifacts.data?.length) return artifacts.data as ArtifactRow[];
    return cards.cards.filter((c) => c.mock).map((c) => ({
      id: c.id, kind: 'mock', project: c.lane, topic: c.initiative ?? 'board', cardId: c.id, title: c.title, url: mockUrl(c.mock!),
    }));
  }, [artifacts.data, cards.cards]);

  const topics = useMemo(() => {
    const m = new Map<string, ArtifactRow[]>();
    for (const a of items) m.set(a.topic ?? 'untitled', [...(m.get(a.topic ?? 'untitled') ?? []), a]);
    return [...m];
  }, [items]);
  const activeTopic = topic ?? topics[0]?.[0] ?? null;
  const list = topics.find(([t]) => t === activeTopic)?.[1] ?? [];

  const description = 'Mocks and published pages, by topic. Lineage shows which story each one came from.';
  const loading = artifacts.isLoading && cards.isLoading;
  if (loading) return <PageLayout icon={Images} title="Artifacts" description={description}><PageSkeleton statCards={0} tableRows={3} /></PageLayout>;
  if (artifacts.error && !isMissing(artifacts.error)) return <PageLayout icon={Images} title="Artifacts" description={description}><InlineError title="Artifacts failed to load" error={artifacts.error} onRetry={() => artifacts.refetch()} /></PageLayout>;

  const gallery = items.length === 0 ? (
    <EmptyState icon={Images} title="No artifacts yet" description={artifacts.error && isMissing(artifacts.error) ? 'GET /api/artifacts is being added. Mocks on stories show here meanwhile.' : 'A mock or a published page appears here once a story produces one.'} />
  ) : (
    <div className="flex flex-col gap-4">
      <SavedViewTabs
        presets={topics.map(([t, l]) => ({ id: t, label: `${t} · ${l.length}` }))}
        savedViews={[]}
        activePresetId={activeTopic}
        activeSavedViewId={null}
        onSelectPreset={setTopic}
        onSelectSavedView={() => {}}
        onSaveView={() => {}}
        onDeleteView={() => {}}
        canSave={false}
      />
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]">
        {list.map((a) => (
          <EntityCard
            key={a.id}
            name={a.title}
            description={a.lineage?.length ? `from ${a.lineage.slice(1).join(' ← ') || 'base'}` : a.from ? `from ${a.from}` : undefined}
            icon={ImageIcon}
            selected={open?.id === a.id}
            onClick={() => setOpen(a)}
            menuItems={[
              { label: 'Open in new tab', icon: ExternalLink, onClick: () => window.open(hrefOf(a), '_blank', 'noopener') },
              ...(a.cardId ? [{ label: `Story ${a.cardId}`, icon: Kanban, onClick: () => router.push(routes.card(a.cardId!)) }] : []),
            ]}
            footer={
              <div className="mt-3 flex flex-wrap gap-1">
                {a.kind ? <MetaChip label="Kind" value={a.kind} /> : null}
                {a.project ? <MetaChip label="Project" value={a.project} /> : null}
                {a.cardId ? <MetaChip label="Story" value={a.cardId} /> : null}
              </div>
            }
            data-testid={`artifact-${a.id}`}
          />
        ))}
      </div>
    </div>
  );

  return (
    <PageLayout icon={Images} title="Artifacts" description={description}>
      <div className="md:hidden">
        {open ? (
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(null)}>Back to gallery</Button>
            <iframe title={open.title} src={hrefOf(open)} className="h-[70vh] w-full rounded-xl border bg-white" />
          </div>
        ) : gallery}
      </div>
      <ResizablePanelGroup orientation="horizontal" className="hidden min-h-[70vh] rounded-xl border md:flex">
        <ResizablePanel defaultSize={45} minSize={30}><div className="h-full overflow-auto p-4">{gallery}</div></ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={55}>
          {open ? <iframe title={open.title} src={hrefOf(open)} className="h-full w-full bg-white" /> : (
            <EmptyState icon={ImageIcon} title="Pick an artifact" description="The preview opens here." />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </PageLayout>
  );
}
