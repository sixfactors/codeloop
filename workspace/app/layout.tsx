import type { Metadata } from 'next';
import { HydrationBoundary } from '@tanstack/react-query';
import './globals.css';
import { QueryProvider } from '@/components/providers/query-provider';
import { AppShell } from '@/components/shared/app-shell';
import { api } from '@/lib/api';
import { cardsQueryOptions, QK } from '@/lib/queries';
import { dehydrated, getQueryClient } from '@/lib/query-server';

export const metadata: Metadata = {
  title: 'Codeloop workspace',
  description: 'Board, inbox, wiki, artifacts and evidence for one codeloop project.',
};

// Every page is rendered on request: the shell's counts come from the card list, so the first page of
// cards and the config are fetched here, above the shell, and hydrated before any client query runs.
export const dynamic = 'force-dynamic';

// Theme is applied before paint so a dark-mode tab never flashes light. Preference order: a stored
// choice, then the OS setting.
const themeScript = `(function(){try{var t=localStorage.getItem('codeloop-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const qc = getQueryClient();
  await Promise.all([
    qc.prefetchInfiniteQuery(cardsQueryOptions()),
    qc.prefetchQuery({ queryKey: QK.config, queryFn: api.config, retry: false }),
  ]);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <QueryProvider>
          <HydrationBoundary state={dehydrated(qc)}>
            <AppShell>{children}</AppShell>
          </HydrationBoundary>
        </QueryProvider>
      </body>
    </html>
  );
}
