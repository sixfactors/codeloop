'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { useEvents } from '@/hooks/use-events';

function EventBridge() {
  useEvents();
  return null;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: (count, err) => (err as { status?: number }).status === 404 ? false : count < 2 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <EventBridge />
      {children}
    </QueryClientProvider>
  );
}
