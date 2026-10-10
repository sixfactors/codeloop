'use client';

// Copied from chanl-admin components/shared/search-and-filter.tsx, which composes a search Input,
// one DataTableFacetedFilter per facet and a Reset button (the DataTableToolbar layout). Change:
// filtering is done by the caller through `value` / `onChange` instead of an internal TanStack
// table, and the search box debounces 300 ms per the design contract (the raw text is kept so the
// input never lags).

import * as React from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import type { FacetOption } from '@/components/shared/data-table-faceted-filter';
import { Skeleton } from '@/components/ui/skeleton';

// The facet menus (popover + command list) are server-rendered but their script is a separate
// chunk, so the search box is interactive before cmdk arrives.
const DataTableFacetedFilter = dynamic(() => import('@/components/shared/data-table-faceted-filter').then((m) => m.DataTableFacetedFilter), { loading: () => <Skeleton className="h-8 w-24" /> });

export interface FacetDef {
  id: string;
  title: string;
  options: FacetOption[];
  searchable?: boolean;
}

export interface SearchAndFilterValue {
  q: string;
  facets: Record<string, string[]>;
}

export const EMPTY_SEARCH: SearchAndFilterValue = { q: '', facets: {} };

export function SearchAndFilter({
  value,
  onChange,
  facets,
  searchPlaceholder = 'Search…',
  trailing,
  onPending,
}: {
  value: SearchAndFilterValue;
  onChange: (next: SearchAndFilterValue) => void;
  facets: FacetDef[];
  searchPlaceholder?: string;
  /** True while typed text is waiting on the debounce — callers dim the previous results. */
  onPending?: (pending: boolean) => void;
  /** Right-aligned controls (view toggle, counts). */
  trailing?: React.ReactNode;
}) {
  const [text, setText] = React.useState(value.q);
  React.useEffect(() => setText(value.q), [value.q]);
  React.useEffect(() => {
    if (text === value.q) { onPending?.(false); return; }
    onPending?.(true);
    const t = setTimeout(() => onChange({ ...value, q: text }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const isFiltered = value.q.length > 0 || Object.values(value.facets).some((v) => v.length > 0);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2" data-testid="search-and-filter">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:flex-1">
        <Input
          placeholder={searchPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-8 w-full sm:w-[220px]"
          aria-label={searchPlaceholder}
          data-testid="card-grid-search"
        />
        {facets.filter((f) => f.options.length > 0).map((f) => (
          <DataTableFacetedFilter
            key={f.id}
            title={f.title}
            options={f.options}
            searchable={f.searchable}
            value={value.facets[f.id] ?? []}
            onChange={(vals) => onChange({ ...value, facets: { ...value.facets, [f.id]: vals } })}
          />
        ))}
        {isFiltered && (
          <Button variant="ghost" size="sm" className="h-8 px-2 lg:px-3" onClick={() => { setText(''); onChange(EMPTY_SEARCH); }} data-testid="card-grid-reset-filters">
            Reset
            <X className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
      {trailing ? <div className="flex min-w-0 flex-wrap items-center gap-2">{trailing}</div> : null}
    </div>
  );
}
