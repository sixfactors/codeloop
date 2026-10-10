// Patches the query cache by entity instead of invalidating whole lists. The live stream and the
// mutations both land here, so a card moving on the board costs one GET /api/cards/:id and no
// list refetch. A list is only refetched when an id it does not hold appears, or on remove.

import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Card, CardsPage, PageSummary, PagesPage } from './types';

type ListData<P> = P | InfiniteData<P>;
const isInfinite = <P,>(d: ListData<P>): d is InfiniteData<P> => Array.isArray((d as InfiniteData<P>).pages);

function mapPages<P>(data: ListData<P>, fn: (p: P) => P): ListData<P> {
  return isInfinite(data) ? { ...data, pages: data.pages.map(fn) } : fn(data);
}

/** Replace `card` in every cached card list that holds its id. True when at least one list had it. */
export function patchCard(qc: QueryClient, card: Card): boolean {
  let found = false;
  for (const [key, data] of qc.getQueriesData<ListData<CardsPage>>({ queryKey: ['cards'] })) {
    if (!data) continue;
    let hit = false;
    const next = mapPages(data, (p) => {
      if (!p.cards?.some((c) => c.id === card.id)) return p;
      hit = true;
      return { ...p, cards: p.cards.map((c) => (c.id === card.id ? { ...c, ...card } : c)) };
    });
    if (hit) { found = true; qc.setQueryData(key, next); }
  }
  return found;
}

export function removeCard(qc: QueryClient, id: string) {
  for (const [key, data] of qc.getQueriesData<ListData<CardsPage>>({ queryKey: ['cards'] })) {
    if (!data) continue;
    qc.setQueryData(key, mapPages(data, (p) => (p.cards?.some((c) => c.id === id) ? { ...p, cards: p.cards.filter((c) => c.id !== id) } : p)));
  }
  qc.removeQueries({ queryKey: ['card', id] });
}

/** The newest copy of a card held by any list, for an instant drawer while GET /api/cards/:id runs. */
export function findCard(qc: QueryClient, id: string): Card | undefined {
  for (const [, data] of qc.getQueriesData<ListData<CardsPage>>({ queryKey: ['cards'] })) {
    if (!data) continue;
    const pages = isInfinite(data) ? data.pages : [data];
    for (const p of pages) {
      const c = p.cards?.find((x) => x.id === id);
      if (c) return c;
    }
  }
  return undefined;
}

export const invalidateCardLists = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ['cards'] });

export function patchPage(qc: QueryClient, page: PageSummary): boolean {
  let found = false;
  const { ...summary } = page as PageSummary & { body?: string };
  delete (summary as { body?: string }).body;
  for (const [key, data] of qc.getQueriesData<ListData<PagesPage>>({ queryKey: ['pages'] })) {
    if (!data) continue;
    let hit = false;
    const next = mapPages(data, (p) => {
      if (!p.pages?.some((x) => x.id === page.id)) return p;
      hit = true;
      return { ...p, pages: p.pages.map((x) => (x.id === page.id ? { ...x, ...summary } : x)) };
    });
    if (hit) { found = true; qc.setQueryData(key, next); }
  }
  return found;
}

export function removePage(qc: QueryClient, id: string) {
  for (const [key, data] of qc.getQueriesData<ListData<PagesPage>>({ queryKey: ['pages'] })) {
    if (!data) continue;
    qc.setQueryData(key, mapPages(data, (p) => (p.pages?.some((x) => x.id === id) ? { ...p, pages: p.pages.filter((x) => x.id !== id) } : p)));
  }
  qc.removeQueries({ queryKey: ['page', id] });
}

export const invalidatePageLists = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ['pages'] });
