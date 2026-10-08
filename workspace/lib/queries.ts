// Query keys and option builders shared by the server prefetch and the client hooks, so a
// dehydrated entry matches the key the hook asks for. Not a client module: server components import it.

import type { QueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { Card, CardsPage, CardsQuery, InboxQuery, PagesQuery } from './types';
import { CARD_FACETS } from './types';
import { findCard } from './live-cache';

/** Page lists are fetched in pages of this size and walked to the end; the server caps at its own limit. */
export const PAGE_SIZE = 200;
/** Card lists: a board column, the backlog grid and the shell's first page each start with this many rows; more arrive on scroll. */
export const CARD_PAGE_SIZE = 50;
/** The inbox serves this many rows per list. */
export const INBOX_LIMIT = 50;

/** A query with the keys in a fixed order and empty facets dropped, so two equal filters share a cache entry. */
export function normaliseCardsQuery(q: CardsQuery = {}): CardsQuery {
  const out: CardsQuery = {};
  if (q.q?.trim()) out.q = q.q.trim();
  for (const k of CARD_FACETS) if (q[k]?.length) out[k] = [...q[k]!].sort();
  if (q.gate) out.gate = q.gate;
  if (q.questions) out.questions = q.questions;
  if (q.shippedSince) out.shippedSince = q.shippedSince;
  if (q.stuck) out.stuck = true;
  if (q.needsMe) out.needsMe = true;
  if (q.sort) out.sort = q.sort;
  out.limit = q.limit ?? CARD_PAGE_SIZE;
  return out;
}

export const QK = {
  cards: (q: CardsQuery = {}) => ['cards', normaliseCardsQuery(q)] as const,
  // Under the 'cards' prefix so a card write invalidates counts with the lists (live-cache tolerates a number).
  count: (q: CardsQuery = {}) => ['cards', normaliseCardsQuery({ ...q, limit: 1 }), 'count'] as const,
  inbox: (q: InboxQuery = {}) => ['inbox', { shippedSince: q.shippedSince ?? '', limit: q.limit ?? INBOX_LIMIT, band: q.band ?? '', epic: q.epic ?? '', initiative: q.initiative ?? '', feature: q.feature ?? '', needsMe: Boolean(q.needsMe), sort: q.sort ?? '' }] as const,
  facets: ['cards-facets'] as const,
  lanes: ['lanes'] as const,
  card: (id: string) => ['card', id] as const,
  questions: (id: string) => ['card', id, 'questions'] as const,
  full: (id: string) => ['card', id, 'full'] as const,
  initiatives: ['initiatives'] as const,
  initiativeTree: (id: string) => ['initiatives', id, 'tree'] as const,
  epicTree: (id: string) => ['epics', id, 'tree'] as const,
  feature: (id: string) => ['features', id] as const,
  pages: (p: PagesQuery = {}) => ['pages', { folder: p.folder ?? '', q: p.q ?? '', limit: p.limit ?? PAGE_SIZE }] as const,
  page: (path: string) => ['page', path] as const,
  evidence: (nnn: string) => ['evidence', nnn] as const,
  artifacts: ['artifacts'] as const,
  stats: ['stats'] as const,
  config: ['config'] as const,
  show: (id: string) => ['card', id, 'show'] as const,
  output: (id: string) => ['card', id, 'output'] as const,
  run: (runId: string) => ['runs', runId] as const,
  features: ['features'] as const,
  setup: ['setup'] as const,
};

export const isMissing = (err: unknown) => err instanceof ApiError && err.status === 404;
export const isConflict = (err: unknown) => err instanceof ApiError && err.status === 409;

/** Query options shared by the server prefetch and the client hook so the dehydrated entry matches. */
export const cardsQueryOptions = (q: CardsQuery = {}) => {
  const query = normaliseCardsQuery(q);
  return {
    queryKey: QK.cards(query),
    queryFn: ({ pageParam }: { pageParam: string }) => api.cards(query, pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (last: CardsPage) => last.next ?? null,
  };
};

/** How many cards match, from one row's `total`. */
export const cardCountQueryOptions = (q: CardsQuery = {}) => ({
  queryKey: QK.count(q),
  queryFn: async (): Promise<number> => {
    const page = await api.cards({ ...normaliseCardsQuery(q), limit: 1 });
    return page.total ?? page.cards.length;
  },
  retry: false,
});

/** "Shipped this week" starts here: midnight seven days ago, so the server prefetch and the client hook ask for the same window within a day. */
export const inboxSince = () => { const day = 86_400_000; return new Date(Math.floor(Date.now() / day) * day - 7 * day).toISOString(); };

export const inboxQueryOptions = (q: InboxQuery = {}) => ({
  queryKey: QK.inbox(q),
  queryFn: () => api.inbox({ ...q, limit: q.limit ?? INBOX_LIMIT }),
  retry: false,
});

export const pagesQueryOptions = (p: PagesQuery = {}) => {
  const params = { ...p, limit: p.limit ?? PAGE_SIZE };
  return {
    queryKey: QK.pages(params),
    queryFn: ({ pageParam }: { pageParam: string }) => api.pages(params, pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (last: { next?: string }) => last.next ?? null,
  };
};

/** Query options for one card with its events; a server without the route falls back to the list's copy. */
export const cardQueryOptions = (id: string, qc?: QueryClient) => ({
  queryKey: QK.card(id),
  queryFn: async (): Promise<Card> => {
    try {
      return await api.card(id);
    } catch (e) {
      const cached = qc && findCard(qc, id);
      if (isMissing(e) && cached) return cached;
      if (isMissing(e) && qc) {
        const page = await api.cards({ limit: PAGE_SIZE });
        const hit = page.cards.find((c) => c.id === id);
        if (hit) return hit;
      }
      throw e;
    }
  },
  retry: false,
});

export const pageQueryOptions = (path: string) => ({ queryKey: QK.page(path), queryFn: () => api.page(path), retry: false });
