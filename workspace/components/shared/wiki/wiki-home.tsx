'use client';

// /wiki home, kept quiet: a title, a row of space tiles (icon, name, count), the most recently
// updated pages as a plain list, and a short line for card specs. No cards inside cards; the
// reading column and the type do the work.

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, FolderOpen } from 'lucide-react';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { routes } from '@/lib/routes';
import { byRecent, folderById, folderIcon, folderLabel, isSpec, pageFolder, updatedAt, WIKI_FOLDERS } from '@/lib/wiki';
import type { PageSummary } from '@/lib/types';

export function WikiHome({ pages, loading, onNew }: { pages: PageSummary[]; loading?: boolean; onNew?: () => void }) {
  const { sections, specCount, recent } = useMemo(() => {
    const byFolder = new Map<string, PageSummary[]>();
    const specDirs = new Set<string>();
    for (const p of pages) {
      const f = pageFolder(p);
      if (isSpec(p)) specDirs.add(f);
      else byFolder.set(f, [...(byFolder.get(f) ?? []), p]);
    }
    const order = (f: string) => { const i = WIKI_FOLDERS.findIndex((w) => w.id === f); return i === -1 ? 99 : i; };
    const sections = [...byFolder.entries()].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b)).map(([id, items]) => ({ id, items: [...items].sort(byRecent) }));
    const recent = pages.filter((p) => !isSpec(p)).sort(byRecent).slice(0, 10);
    return { sections, specCount: specDirs.size, recent };
  }, [pages]);

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
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Wiki</h1>
        <p className="max-w-prose text-muted-foreground">What the product is, why it works the way it does, and what the team learned. Agents read these pages before a stage and write to them after.</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Spaces</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sections.map(({ id, items }) => {
            const Icon = folderIcon(id);
            const meta = folderById(id);
            return (
              <Link
                key={id}
                href={routes.wiki(items[0].id)}
                className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-card-foreground transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                data-testid={`wiki-section-${id}`}
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{folderLabel(id)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{items.length} {items.length === 1 ? 'page' : 'pages'}</span>
                </span>
                {meta?.description ? <span className="line-clamp-2 text-xs text-muted-foreground/80">{meta.description}</span> : null}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Recently updated</h2>
        <ItemGroup className="gap-0">
          {recent.map((p) => {
            const when = updatedAt(p);
            return (
              <Item key={p.id} size="sm" render={<Link href={routes.wiki(p.id)} />} className="rounded-lg border-0 px-2 hover:bg-accent/60">
                <ItemContent className="flex-row items-baseline gap-3">
                  <ItemTitle className="min-w-0 truncate font-normal">{p.title}</ItemTitle>
                  <ItemDescription className="shrink-0 text-xs">{folderLabel(pageFolder(p))}</ItemDescription>
                </ItemContent>
                {when ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{when}</span> : null}
              </Item>
            );
          })}
        </ItemGroup>
      </section>

      {specCount ? (
        <p className="flex flex-wrap items-center gap-2 border-t pt-6 text-sm text-muted-foreground" data-testid="wiki-section-specs">
          {specCount} stories have working files: research, spec, plan and tasks. They live on each story.
          <Link href={routes.board} className="inline-flex items-center gap-1 text-foreground hover:underline">Open the board<ArrowRight className="size-3.5" /></Link>
        </p>
      ) : null}
    </div>
  );
}
