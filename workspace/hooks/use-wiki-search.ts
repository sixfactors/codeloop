'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { QK, usePages } from './use-api';
import { api } from '@/lib/api';
import { excerpt } from '@/lib/wiki';
import type { PageSummary } from '@/lib/types';

export interface WikiHit extends PageSummary {
  excerpt: string;
}

// GET /api/pages?q= matches titles and bodies. A server that returns excerpts with the hits is
// done in one request; one that does not gets each hit's page fetched (capped, cached per page by
// react-query) and the excerpt windowed around the match.
export function useWikiSearch(q: string, limit = 20) {
  const enabled = q.trim().length >= 2;
  const list = usePages({ q, limit }, enabled);
  const top = useMemo(() => (enabled ? list.pages.slice(0, limit) : []), [enabled, list.pages, limit]);
  const missing = useMemo(() => top.filter((p) => p.excerpt === undefined).map((p) => p.id), [top]);
  const bodies = useQueries({
    queries: missing.map((id) => ({ queryKey: QK.page(id), queryFn: () => api.page(id), staleTime: 60_000 })),
  });
  const hits: WikiHit[] = useMemo(
    () => top.map((summary) => {
      if (summary.excerpt !== undefined) return { ...summary, excerpt: summary.excerpt };
      const body = bodies[missing.indexOf(summary.id)]?.data?.body ?? '';
      return { ...summary, excerpt: body ? excerpt(body, q) : '' };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [top, missing, q, bodies.map((b) => b.dataUpdatedAt).join(',')],
  );
  return { hits, isLoading: enabled && list.isLoading, error: list.error, refetch: list.refetch, enabled, total: list.total };
}
