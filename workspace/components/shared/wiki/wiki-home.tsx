'use client';

// /wiki home: start-here.md's body (what this is, how to run it, the three common tasks), then
// the sections the server's wiki shape lists - in its order, titled as it says, every empty
// section and every storage folder (initiatives, epics, features, cards) already left out by the
// server, not recomputed here. Reference sits last, collapsed. Then recently updated pages, and a
// short line for card specs.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronRight, FolderOpen } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { routes } from '@/lib/routes';
import { byRecent, folderIcon, isSpec, pageFolder, updatedAt } from '@/lib/wiki';
import type { Page, PageSummary, WikiShapeCount } from '@/lib/types';
import { WikiMarkdown } from './wiki-markdown-lazy';

function SectionTile({ section, items }: { section: WikiShapeCount; items: PageSummary[] }) {
  const Icon = folderIcon(section.id);
  return (
    <Link
      href={routes.wiki(items[0].id)}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-card-foreground transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      data-testid={`wiki-section-${section.id}`}
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span>
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{section.title}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{section.count} {section.count === 1 ? 'page' : 'pages'}</span>
      </span>
      {section.holds ? <span className="line-clamp-2 text-xs text-muted-foreground/80">{section.holds}</span> : null}
    </Link>
  );
}

export function WikiHome({ pages, shape, startHere, loading, onNew }: { pages: PageSummary[]; shape: WikiShapeCount[]; startHere?: Page; loading?: boolean; onNew?: () => void }) {
  const [refOpen, setRefOpen] = useState(false);
  const { sections, reference, specCount, recent } = useMemo(() => {
    const byFolder = new Map<string, PageSummary[]>();
    const specDirs = new Set<string>();
    for (const p of pages) {
      const f = pageFolder(p);
      if (isSpec(p)) specDirs.add(f);
      else byFolder.set(f, [...(byFolder.get(f) ?? []), p]);
    }
    // Order, titles, purpose and visibility all come from the server's shape; a section it left
    // out (empty, a storage folder, or unrecognized) never renders here, however many raw pages
    // the full list happens to carry for it.
    const withItems = shape.map((s) => ({ section: s, items: (byFolder.get(s.id) ?? []).sort(byRecent) })).filter((s) => s.items.length > 0);
    const sections = withItems.filter((s) => !s.section.collapsed);
    const reference = withItems.filter((s) => s.section.collapsed);
    // Only pages in the visible sections: planning records, reference and legacy filler stay out of it.
    const visible = new Set(sections.map((s) => s.section.id));
    const recent = pages.filter((p) => !isSpec(p) && visible.has(pageFolder(p))).sort(byRecent).slice(0, 10);
    return { sections, reference, specCount: specDirs.size, recent };
  }, [pages, shape]);

  if (loading) {
    return (
      <div className="flex flex-col gap-10" aria-busy="true">
        <div className="flex flex-col gap-2"><Skeleton className="h-9 w-40" /><Skeleton className="h-4 w-72" /></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>
        <div className="flex flex-col gap-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
      </div>
    );
  }
  if (!pages.length) {
    return <EmptyState icon={FolderOpen} title="The wiki is empty" description="Pages under .codeloop/wiki and one per story appear here. New page writes the first one." action={onNew ? { label: 'New page', onClick: onNew } : undefined} />;
  }

  return (
    <div className="flex flex-col gap-10" data-testid="wiki-home">
      <header className="flex flex-col gap-2" data-testid="wiki-start-here">
        {startHere?.body.trim() ? <WikiMarkdown>{startHere.body}</WikiMarkdown> : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">Wiki</h1>
            <p className="max-w-prose text-muted-foreground">
              Run <code>codeloop wiki build</code> to write start-here.md: what this is, how to run it, and the three things you&apos;ll actually do here.
            </p>
          </>
        )}
      </header>

      {sections.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Sections</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sections.map(({ section, items }) => <SectionTile key={section.id} section={section} items={items} />)}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Recently updated</h2>
        <ItemGroup className="gap-0">
          {recent.map((p) => {
            const when = updatedAt(p);
            return (
              <Item key={p.id} size="sm" render={<Link href={routes.wiki(p.id)} />} className="rounded-lg border-0 px-2 hover:bg-accent/60">
                <ItemContent className="flex-row items-baseline gap-3">
                  <ItemTitle className="min-w-0 truncate font-normal">{p.title}</ItemTitle>
                  <ItemDescription className="shrink-0 text-xs">{shape.find((s) => s.id === pageFolder(p))?.title ?? pageFolder(p)}</ItemDescription>
                </ItemContent>
                {when ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{when}</span> : null}
              </Item>
            );
          })}
        </ItemGroup>
      </section>

      {reference.length ? (
        <Collapsible open={refOpen} onOpenChange={setRefOpen} className="flex flex-col gap-3 border-t pt-6" data-testid="wiki-section-reference">
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            <ChevronRight className={`size-3.5 transition-transform ${refOpen ? 'rotate-90' : ''}`} />
            Reference
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {reference.map(({ section, items }) => <SectionTile key={section.id} section={section} items={items} />)}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {specCount ? (
        <p className="flex flex-wrap items-center gap-2 border-t pt-6 text-sm text-muted-foreground" data-testid="wiki-section-specs">
          {specCount} stories have working files: research, spec, plan and tasks. They live on each story.
          <Link href={routes.board} className="inline-flex items-center gap-1 text-foreground hover:underline">Open the board<ArrowRight className="size-3.5" /></Link>
        </p>
      ) : null}
    </div>
  );
}
