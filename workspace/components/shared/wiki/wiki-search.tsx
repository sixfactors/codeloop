'use client';

// /wiki?q= — wiki-only search results with an excerpt and the folder as a chip. Composed from
// SearchAndFilter (search box + faceted folder filter) and ui/item rows.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { EMPTY_SEARCH, SearchAndFilter, type SearchAndFilterValue } from '@/components/shared/search-and-filter';
import { useWikiSearch } from '@/hooks/use-wiki-search';
import { routes } from '@/lib/routes';
import { folderIcon, folderLabel, pageFolder } from '@/lib/wiki';

export function WikiSearch({ q, onQueryChange }: { q: string; onQueryChange: (q: string) => void }) {
  const [value, setValue] = useState<SearchAndFilterValue>({ ...EMPTY_SEARCH, q });
  const search = useWikiSearch(value.q);
  const folders = useMemo(() => [...new Set(search.hits.map(pageFolder))].sort(), [search.hits]);
  const selected = value.facets.folder ?? [];
  const shown = selected.length ? search.hits.filter((h) => selected.includes(pageFolder(h))) : search.hits;

  return (
    <div className="flex flex-col gap-4" data-testid="wiki-search">
      <SearchAndFilter
        value={value}
        onChange={(next) => { setValue(next); if (next.q !== value.q) onQueryChange(next.q); }}
        searchPlaceholder="Search the wiki…"
        facets={[{ id: 'folder', title: 'Folder', options: folders.map((f) => ({ label: folderLabel(f), value: f })) }]}
        trailing={search.enabled && !search.isLoading ? <span className="text-xs text-muted-foreground">{search.total} {search.total === 1 ? 'page' : 'pages'}</span> : null}
      />
      {!search.enabled ? (
        <EmptyState compact icon={SearchX} title="Type two letters or more" description="Titles and bodies of every wiki page are searched." />
      ) : search.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : search.error ? (
        <InlineError title="Search failed" error={search.error} onRetry={() => search.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState compact icon={SearchX} title={`Nothing matches “${value.q}”`} description="Search looks at titles and bodies. Try a different word, or clear the folder filter." />
      ) : (
        <ItemGroup className="gap-0 rounded-xl border bg-card">
          {shown.map((h) => {
            const Icon = folderIcon(pageFolder(h));
            return (
              <Item key={h.id} render={<Link href={routes.wiki(h.id)} />} className="border-b last:border-b-0" data-testid="wiki-search-hit">
                <ItemMedia variant="icon"><Icon /></ItemMedia>
                <ItemContent>
                  <ItemTitle className="flex flex-wrap items-center gap-2"><span className="truncate">{h.title}</span><Badge variant="outline">{folderLabel(pageFolder(h))}</Badge></ItemTitle>
                  <ItemDescription>{h.excerpt || <span className="italic">Loading excerpt…</span>}</ItemDescription>
                </ItemContent>
              </Item>
            );
          })}
        </ItemGroup>
      )}
    </div>
  );
}
