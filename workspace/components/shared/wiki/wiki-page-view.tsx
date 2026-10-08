'use client';

// One wiki page: properties block from the frontmatter, body, sticky table of contents (WikiToc,
// hidden under xl), "Pages linking here" and the last-updated line. Backlinks cost one request:
// GET /api/pages?q=<slug> searches bodies server-side.

import { Fragment, useMemo } from 'react';
import Link from 'next/link';
import { FileText, Link2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
// Static, not next/dynamic: a lazily re-imported renderer swaps the server-rendered body for a
// skeleton on every client navigation until its chunk arrives. Every wiki page needs it anyway;
// only the editor stays lazy.
import WikiMarkdown from './wiki-markdown';
import { WikiToc } from './wiki-toc';
import { isMissing, usePage, usePages, useSavePage } from '@/hooks/use-api';
import { routes } from '@/lib/routes';
import { folderLabel, headingsOf, pageFolder, pageSlug, properties, updatedAt } from '@/lib/wiki';
import type { Page } from '@/lib/types';

function Backlinks({ page }: { page: Page }) {
  const slug = pageSlug(page.id);
  const hits = usePages({ q: slug, limit: 50 });
  const links = useMemo(() => hits.pages.filter((p) => p.id !== page.id), [hits.pages, page.id]);
  return (
    <section className="flex flex-col gap-2 border-t pt-6" data-testid="wiki-backlinks">
      <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase"><Link2 className="size-3.5" />Pages linking here</h3>
      {hits.isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : hits.error ? (
        <InlineError title="Backlinks failed to load" error={hits.error} onRetry={() => hits.refetch()} />
      ) : links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No other page mentions <code className="rounded bg-muted px-1 font-mono text-xs">{slug}</code> yet.</p>
      ) : (
        <ItemGroup className="gap-0">
          {links.map((p) => (
            <Item key={p.id} size="sm" render={<Link href={routes.wiki(p.id)} />} className="rounded-lg border-0 px-2 hover:bg-accent/60">
              <ItemMedia variant="icon"><FileText /></ItemMedia>
              <ItemContent>
                <ItemTitle className="truncate">{p.title}</ItemTitle>
                <ItemDescription>{folderLabel(pageFolder(p))}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
    </section>
  );
}

export function WikiPageView({ path, onEdit, canEdit }: { path: string; onEdit: () => void; canEdit: boolean }) {
  const { data, isLoading, error, refetch } = usePage(path);
  const create = useSavePage();
  const toc = useMemo(() => headingsOf(data?.body ?? ''), [data?.body]);
  const props = useMemo(() => properties(data?.frontmatter).filter(([k]) => k !== 'updated'), [data?.frontmatter]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-7 w-1/2" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error) {
    // A card's wiki page is written when the card ships; before that the link from the card lands
    // here, so offer to start the page instead of calling it missing.
    const cardId = path.match(/^\.codeloop\/wiki\/cards\/([^/]+)\.md$/)?.[1];
    if (isMissing(error) && cardId) {
      return (
        <EmptyState
          icon={FileText}
          title={`No wiki page for ${cardId} yet`}
          description="The engine writes a card's page when it ships: story, decisions at each gate, evidence and the pages it touched. Until then you can start it by hand."
          action={canEdit ? { label: 'Start the card page', onClick: () => void create.mutateAsync({ path, write: { frontmatter: { title: cardId, card: cardId, status: 'open' }, body: `## Story\n\n## Decisions\n\n## Links\n\n- card: /cards/${cardId}/\n` } }).then(onEdit) } : undefined}
          secondaryAction={{ label: 'Open the card', href: routes.card(cardId) }}
        />
      );
    }
    return isMissing(error)
      ? <EmptyState icon={FileText} title="No page at this path" description={`${path} is not in the wiki. It may have been deleted or renamed.`} action={{ label: 'Back to the wiki', href: routes.wiki() }} />
      : <InlineError title="Page failed to load" error={error} onRetry={() => refetch()} />;
  }
  if (!data) return null;
  const when = updatedAt(data);

  return (
    <>
      <div className="flex gap-10" data-testid="wiki-page">
        <article className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">{folderLabel(pageFolder(data))}{when ? <> · Updated {when}</> : null}</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance" data-testid="wiki-page-title">{data.title}</h1>
            {props.length ? (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm" data-testid="wiki-properties">
                {props.map(([k, v]) => (
                  <Fragment key={k}>
                    <dt className="text-muted-foreground capitalize">{k}</dt>
                    <dd className="min-w-0 break-words">{v}</dd>
                  </Fragment>
                ))}
              </dl>
            ) : null}
          </header>
          {data.body.trim() ? <WikiMarkdown>{data.body}</WikiMarkdown> : (
            <p className="text-sm text-muted-foreground">This page has no body yet.{canEdit ? <> <button type="button" className="underline" onClick={onEdit}>Write one.</button></> : null}</p>
          )}
          <Backlinks page={data} />
        </article>
        {toc.length ? (
          <aside className="sticky top-6 hidden w-52 shrink-0 self-start xl:block" data-testid="wiki-toc">
            <h3 className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">On this page</h3>
            <WikiToc items={toc} />
          </aside>
        ) : null}
      </div>
    </>
  );
}
