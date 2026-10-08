// Server-side prefetch for first paint. A page's server component fills a per-request QueryClient
// from the API, dehydrates it into <HydrationBoundary>, and the client hooks start with that data.
// When the API is not reachable the prefetch is skipped and the client fetches as before.

import 'server-only';
import { cache } from 'react';
import { QueryClient, dehydrate } from '@tanstack/react-query';

export const getQueryClient = cache(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } }));

export function dehydrated(qc: QueryClient) {
  return dehydrate(qc);
}
