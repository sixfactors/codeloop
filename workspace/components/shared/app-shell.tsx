'use client';

// The shell, after chanl-admin components/app-sidebar.tsx (masthead · grouped nav · secondary group
// pinned to the bottom · footer) and app-sidebar-condensed.tsx (CountBadge with muted / attention
// tones). Changes: Logo → a terminal glyph with the product name, NavUser → an owner / read-only
// footer with the theme toggle, nav config inline (no feature flags, no app switcher), base-ui
// `render` instead of `asChild`.

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, BookOpen, Boxes, Frame, Home, Images, Kanban, Layers, Map, Moon, Settings, SquareTerminal, Sun, type LucideIcon } from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import dynamic from 'next/dynamic';
import { sessionLabel } from '@/lib/session-label';
import { useBoard, useCanWrite, useConfig, useHome, useInbox, useSession, useSetupStatus } from '@/hooks/use-api';
import { useProject, useRoutes } from '@/components/providers/project-provider';
import { routesFor, type Routes } from '@/lib/routes';
import { api, type ListedProject } from '@/lib/api';
import { CommandPalette } from '@/components/shared/command-palette';
import { ProjectSwitcher } from '@/components/shared/project-switcher';
import { documentTitle, PageTitleContext } from '@/components/shared/page-title';
import { ReadOnlyBanner } from '@/components/shared/read-only-banner';
import { cn } from '@/lib/utils';

// Toasts are rare; sonner is fetched after first paint.
const Toaster = dynamic(() => import('@/components/ui/sonner').then((m) => m.Toaster), { ssr: false });

interface NavItem {
  id: string;
  title: string;
  url: string;
  /**
   * The unprefixed form of `url`, for deciding which row is current. The hub's server strips
   * `/p/<id>` before Next ever routes the request (src/lib/next-server.ts), so usePathname() on
   * the server never carries it either; comparing against it there would always read as "no match"
   * on the server and the real one on the client, a text mismatch and React hydration error #418.
   * `pathname` passed to NavRow is stripped the same way (see AppShell) so both sides compare
   * unprefixed to unprefixed.
   */
  matchUrl: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Other path prefixes that belong to this destination (an epic or feature page is a level of Initiatives). */
  also?: string[];
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

// Always unprefixed (routesFor() with no project): a fixed, static value, safe to share across
// renders and across the server/client boundary.
const MATCH = routesFor();

// Built from `routes` (per render, via useRoutes()), not at module scope: a plain object built
// once at import time would bake in whatever `routes.board` resolved to on first evaluation. On
// the server that is always the no-project prefix, which is right for standalone but wrong for
// every hub page, the markup mismatch is React hydration error #418.
function navGroups(routes: Routes): NavGroup[] {
  return [
    {
      label: 'Work',
      items: [
        // Home leads the nav and replaces Inbox there (docs/artifacts/codeloop-ui-design.html
        // §5, §10 "Home replaces Inbox"); the Inbox route itself still renders, just unlinked.
        { id: 'home', title: 'Home', url: routes.home, matchUrl: MATCH.home, icon: Home },
        { id: 'board', title: 'Board', url: routes.board, matchUrl: MATCH.board, icon: Kanban, exact: true },
        { id: 'initiatives', title: 'Initiatives', url: routes.initiatives, matchUrl: MATCH.initiatives, icon: Layers, also: ['/epics/', '/features/'] },
        { id: 'roadmap', title: 'Roadmap', url: routes.roadmap, matchUrl: MATCH.roadmap, icon: Map },
      ],
    },
    {
      label: 'Knowledge',
      items: [
        { id: 'wiki', title: 'Wiki', url: routes.wiki(), matchUrl: MATCH.wiki(), icon: BookOpen },
        { id: 'mocks', title: 'Mocks', url: routes.mocks, matchUrl: MATCH.mocks, icon: Frame },
        { id: 'artifacts', title: 'Artifacts', url: routes.artifacts, matchUrl: MATCH.artifacts, icon: Images },
        { id: 'stats', title: 'Stats', url: routes.stats, matchUrl: MATCH.stats, icon: BarChart3 },
      ],
    },
  ];
}

function secondaryNav(routes: Routes): NavItem[] {
  return [{ id: 'settings', title: 'Settings', url: routes.settings, matchUrl: MATCH.settings, icon: Settings }];
}

/** The hub home's own nav: no board to scope to, so "Work"/"Knowledge" are replaced by every
 * registered project (a plain link, full navigation, see hub-home.tsx) plus a way back home.
 * Each row's badge is `counts.waitingOnYou`, the same number (and the same server computation,
 * src/lib/hub.ts) the project grid card shows, one definition of "waiting", not a second one
 * added up from the gates+questions feed. */
function HubNavGroups({ pathname, projects }: { pathname: string; projects?: ListedProject[] }) {
  const known = (projects ?? []).filter((p) => !p.missing);
  const attention = useQuery({ queryKey: ['hub', 'attention'], queryFn: api.hub.attention, retry: false, refetchInterval: 15_000 });
  const attentionOf = (id: string) => {
    const a = attention.data?.find((x) => x.id === id);
    return a ? a.needsYou + a.failing : 0;
  };
  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={pathname === '/'} tooltip="Home" render={<Link href="/" data-testid="sidebar-nav-home" />}>
                <Home strokeWidth={1.5} />
                <span className="flex-1 truncate">Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup className="mt-0.5">
        <SidebarGroupLabel>Projects</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {known.map((p) => (
              <SidebarMenuItem key={p.id}>
                <SidebarMenuButton tooltip={p.name} render={<a href={`/p/${encodeURIComponent(p.id)}/`} data-testid={`sidebar-nav-project-${p.id}`} />}>
                  <Boxes strokeWidth={1.5} />
                  <span className="flex-1 truncate">{p.name}</span>
                  {/* What needs attention in that project: waiting on you plus failing, from the monitor. */}
                  <CountBadge value={attentionOf(p.id)} tone="attention" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {known.length === 0 ? <p className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">No projects yet.</p> : null}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

function isActive(item: NavItem, pathname: string): boolean {
  // A story's evidence folder is part of the story, so it sits under Board like the story page.
  if (item.exact) return pathname === item.matchUrl || pathname.startsWith('/cards/') || pathname.startsWith('/evidence/');
  const base = item.matchUrl.replace(/\/$/, '');
  return pathname === base || pathname.startsWith(`${base}/`) || (item.also ?? []).some((p) => pathname.startsWith(p));
}

/** Undoes the hub's `/p/<id>` rewrite so a pathname compares the same way on the server (which
 * never saw the prefix) and the client (which reads it from the real browser URL). */
function withoutProjectPrefix(pathname: string, project?: string): string {
  if (!project) return pathname;
  const prefix = `/p/${encodeURIComponent(project)}`;
  if (pathname === prefix) return '/';
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
}

/** A count on a row. `attention` is for work that is waiting on a person, not merely in flight. */
function CountBadge({ value, tone = 'muted' }: { value: number; tone?: 'muted' | 'attention' }) {
  if (value <= 0) return null;
  return (
    <span
      className={cn(
        'ml-auto rounded-full px-1.5 py-0 text-[11px] font-medium tabular-nums group-data-[collapsible=icon]:hidden',
        tone === 'attention' ? 'bg-warning/15 text-warning-foreground dark:text-warning' : 'text-muted-foreground'
      )}
      data-testid="sidebar-count"
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

function NavRow({ item, pathname, indicator }: { item: NavItem; pathname: string; indicator?: React.ReactNode }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={isActive(item, pathname)} tooltip={item.title} render={<Link href={item.url} data-testid={`sidebar-nav-${item.id}`} />}>
        <Icon strokeWidth={1.5} />
        <span className="flex-1 truncate">{item.title}</span>
        {indicator}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ThemeToggle() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('codeloop-theme', next ? 'dark' : 'light'); } catch { /* private window */ }
    setDark(next);
  };
  return (
    <Button variant="ghost" size="icon-sm" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggle}>
      {dark ? <Sun strokeWidth={1.5} /> : <Moon strokeWidth={1.5} />}
    </Button>
  );
}

/** `pathname` here is the unprefixed form (see `withoutProjectPrefix`), matched against the
 * equally unprefixed `MATCH` routes, not `routes` itself. */
function sectionFor(pathname: string, groups: NavGroup[], secondary: NavItem[]): string {
  if (pathname.startsWith(MATCH.setup)) return 'Setup';
  const all = [...groups.flatMap((g) => g.items), ...secondary];
  return all.find((i) => isActive(i, pathname))?.title ?? 'Workspace';
}

/** A project that is not initialised yet goes to /setup. A server without the status route answers 404, which gates nothing. */
function SetupGate({ pathname }: { pathname: string }) {
  const router = useRouter();
  const routes = useRoutes();
  const status = useSetupStatus();
  const send = status.data?.initialised === false && !pathname.startsWith(routes.setup);
  React.useEffect(() => { if (send) router.replace(routes.setup); }, [send, router, routes.setup]);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  // The browser's actual pathname. Server-side this is already the unprefixed route (the hub
  // strips `/p/<id>` before Next sees the request); client-side, after hydration, it is the real
  // `/p/<id>/...` the address bar shows. Nav highlighting below normalizes it with
  // withoutProjectPrefix() so both passes compare the same unprefixed value; SetupGate's redirect
  // only runs client-side (inside an effect) so it can use the raw one directly.
  const rawPathname = usePathname() ?? '';
  // From the provider, not `pathname.startsWith('/p/')`: for the same reason as above, that read
  // differs between the server and client passes, two different branches below (ProjectSwitcher
  // vs. a plain span), which is React hydration error #418. `hub` is the same server-resolved flag
  // on both passes.
  const { hub: hubMode, project: projectId } = useProject();
  const pathname = React.useMemo(() => withoutProjectPrefix(rawPathname, projectId), [rawPathname, projectId]);
  // The hub's own home page (no project in the URL): no board to shell, so the project-scoped
  // queries below are disabled rather than fired against routes that don't exist without one
  // (hub.ts defines /api/hub/* and /api/p/:id/*, nothing at the bare paths).
  const atHubHome = hubMode && !projectId;
  const routes = useRoutes();
  const groups = React.useMemo(() => navGroups(routes), [routes]);
  const secondary = React.useMemo(() => secondaryNav(routes), [routes]);
  // Counts come from the server, not from a walk over the cards. The story count is the board's own
  // `total`, so the sidebar, the board header and the drawer pager can never disagree.
  const board = useBoard(undefined, !atHubHome);
  const total = board.data?.total ?? 0;
  const { canWrite, isLoading } = useCanWrite();
  const session = useSession();
  const config = useConfig(!atHubHome);
  const inbox = useInbox({}, !atHubHome);
  const home = useHome(!atHubHome);
  const needsYouCount = home.data?.summary.needsYou ?? 0;
  const gates = inbox.data?.needsYou.total ?? 0;
  const questions = inbox.data?.questions.total ?? 0;
  const hubProjects = useQuery({ queryKey: ['hub', 'projects'], queryFn: api.hub.projects, retry: false, enabled: atHubHome });
  const knownProjects = (hubProjects.data ?? []).filter((p) => !p.missing);
  const cfg = config.data as { product?: string; name?: string } | undefined;
  const project = session.data?.project;
  const product = atHubHome ? 'Codeloop' : project?.name ?? String(cfg?.product ?? cfg?.name ?? 'codeloop');

  // The tab title is "<page or story title> · <project>" on every page (see page-title.tsx), so two
  // boards in two tabs are told apart and a story's tab names the story.
  // Rendered as a <title> element, which React hoists into <head> on the server pass too. Writing
  // document.title from an effect loses to Next's streamed metadata title, which lands after hydration.
  const [pageTitle, setPageTitle] = React.useState<string>();
  const projectLabel = atHubHome ? undefined : project?.name ?? projectId ?? product;
  const tabTitle = atHubHome ? 'Codeloop' : documentTitle(pageTitle ?? sectionFor(pathname, groups, secondary), projectLabel);

  const indicators: Record<string, React.ReactNode> = {
    // The same number Home leads with, so the badge and the page never disagree.
    home: needsYouCount > 0 ? <CountBadge value={needsYouCount} tone="attention" /> : null,
    board: board.data ? <CountBadge value={total} /> : null,
  };

  return (
    <SidebarProvider>
      <title>{tabTitle}</title>
      {!atHubHome && <SetupGate pathname={rawPathname} />}
      <Sidebar collapsible="icon">
        {/* A masthead, then destinations. The brand is not a menu row: it does not hover like one. */}
        <SidebarHeader className="gap-3 px-2 pt-3 pb-4">
          <Link
            href={atHubHome ? '/' : routes.board}
            data-testid="sidebar-logo"
            className="flex items-center gap-2 rounded-md outline-hidden focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <SquareTerminal className="size-4" strokeWidth={1.5} />
            </span>
            <span className="truncate text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden" title={project?.path} data-testid="shell-project-name">{product}</span>
          </Link>
        </SidebarHeader>

        {/* 12px between groups, matching the chanl-admin rail. */}
        <SidebarContent className="gap-0 [&>[data-sidebar=group]:not(:first-child)]:pt-0.5">
          {atHubHome ? (
            <HubNavGroups pathname={pathname} projects={hubProjects.data} />
          ) : (
            groups.map((group, i) => (
              <SidebarGroup key={group.label ?? `group-${i}`} className={i > 0 ? 'mt-0.5' : undefined}>
                {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <NavRow key={item.id} item={item} pathname={pathname} indicator={indicators[item.id]} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))
          )}
          {/* Settings is a project's own page (lanes, personas, board auth), nothing to show it
              for at the hub home, where there's no project to configure. No hub-level settings
              page exists yet, so this stays off rather than linking somewhere that degrades. */}
          {!atHubHome && (
            <SidebarGroup className="mt-auto">
              <SidebarGroupContent>
                <SidebarMenu>
                  {secondary.map((item) => <NavRow key={item.id} item={item} pathname={pathname} />)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-medium">{sessionLabel({ canWrite, isLoading })}</span>
              <span className="truncate text-xs text-muted-foreground tabular-nums" data-testid="sidebar-story-count">
                {atHubHome ? `${knownProjects.length} project${knownProjects.length === 1 ? '' : 's'}` : `${total} stories`}
              </span>
            </div>
            <ThemeToggle />
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-5 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList>
              <BreadcrumbItem className="hidden sm:block">
                {atHubHome ? (
                  <span className="text-muted-foreground" data-testid="hub-breadcrumb-root">All projects</span>
                ) : hubMode ? (
                  <ProjectSwitcher currentName={product} />
                ) : (
                  <span className="text-muted-foreground" title={project?.path}>{product}</span>
                )}
              </BreadcrumbItem>
              <BreadcrumbItem><BreadcrumbPage>{atHubHome ? 'Home' : sectionFor(pathname, groups, secondary)}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex items-center gap-2">
            <CommandPalette />
          </div>
        </header>
        <ReadOnlyBanner />
        <div className="flex min-w-0 flex-1 flex-col"><PageTitleContext.Provider value={setPageTitle}>{children}</PageTitleContext.Provider></div>
      </SidebarInset>
      <Toaster position="bottom-right" />
    </SidebarProvider>
  );
}
