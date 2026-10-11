import type { Metadata } from 'next';
import { HydrationBoundary } from '@tanstack/react-query';
import './globals.css';
import { QueryProvider } from '@/components/providers/query-provider';
import { ProjectProvider } from '@/components/providers/project-provider';
import { AppShell } from '@/components/shared/app-shell';
import { api } from '@/lib/api';
import { cardsQueryOptions, QK } from '@/lib/queries';
import { dehydrated, getQueryClient } from '@/lib/query-server';
import { currentProjectServer, hubModeServer } from '@/lib/project';

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
  const [hub, project] = await Promise.all([hubModeServer(), currentProjectServer()]);
  // The hub's own home page (no project in the URL) has no board to shell: it lists projects
  // instead, and the project-scoped shell (card counts, nav, the write gate) would have nothing to
  // query against.
  const atHubHome = hub && !project;
  const qc = getQueryClient();
  if (!atHubHome) {
    await Promise.all([
      qc.prefetchInfiniteQuery(cardsQueryOptions()),
      qc.prefetchQuery({ queryKey: QK.config, queryFn: api.config, retry: false }),
    ]);
  }
  return (
    // data-codeloop-hub: plain HTML, present at hydration, so lib/project.ts's hubModeBrowser()
    // (api.ts's session/login/logout) knows this is the hub even on "/", which carries no
    // `/p/<id>` prefix to parse. See that function's comment for why the URL alone can't tell.
    <html lang="en" suppressHydrationWarning {...(hub ? { 'data-codeloop-hub': '' } : {})}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <QueryProvider>
          <ProjectProvider project={project} hub={hub}>
            {atHubHome ? (
              // No project to prefetch cards/config for; the shell's own hub-scoped queries
              // (the project list, needs-you) run client-side, same as the hub home body.
              <AppShell>{children}</AppShell>
            ) : (
              <HydrationBoundary state={dehydrated(qc)}>
                <AppShell>{children}</AppShell>
              </HydrationBoundary>
            )}
          </ProjectProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
