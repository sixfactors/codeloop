'use client';

// The shell, after chanl-admin components/app-sidebar.tsx (masthead · grouped nav · secondary group
// pinned to the bottom · footer) and app-sidebar-condensed.tsx (CountBadge with muted / attention
// tones). Changes: Logo → a terminal glyph with the product name, NavUser → an owner / read-only
// footer with the theme toggle, nav config inline (no feature flags, no app switcher), base-ui
// `render` instead of `asChild`.

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, BookOpen, Images, Inbox, Kanban, Layers, Map, Moon, Settings, SquareTerminal, Sun, type LucideIcon } from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import dynamic from 'next/dynamic';
import { useCardCount, useCards, useConfig, useInbox, useSetupStatus } from '@/hooks/use-api';
import { routes } from '@/lib/routes';
import { CommandPalette } from '@/components/shared/command-palette';
import { cn } from '@/lib/utils';

// Toasts are rare; sonner is fetched after first paint.
const Toaster = dynamic(() => import('@/components/ui/sonner').then((m) => m.Toaster), { ssr: false });

interface NavItem {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Other path prefixes that belong to this destination (an epic or feature page is a level of Initiatives). */
  also?: string[];
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { id: 'board', title: 'Board', url: routes.board, icon: Kanban, exact: true },
      { id: 'inbox', title: 'Inbox', url: routes.inbox, icon: Inbox },
      { id: 'initiatives', title: 'Initiatives', url: routes.initiatives, icon: Layers, also: ['/epics/', '/features/'] },
      { id: 'roadmap', title: 'Roadmap', url: routes.roadmap, icon: Map },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { id: 'wiki', title: 'Wiki', url: routes.wiki(), icon: BookOpen },
      { id: 'artifacts', title: 'Artifacts', url: routes.artifacts, icon: Images },
      { id: 'stats', title: 'Stats', url: routes.stats, icon: BarChart3 },
    ],
  },
];

const SECONDARY: NavItem[] = [{ id: 'settings', title: 'Settings', url: routes.settings, icon: Settings }];

function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.url || pathname.startsWith('/cards/');
  const base = item.url.replace(/\/$/, '');
  return pathname === base || pathname.startsWith(`${base}/`) || (item.also ?? []).some((p) => pathname.startsWith(p));
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

function sectionFor(pathname: string): string {
  if (pathname.startsWith(routes.setup)) return 'Setup';
  const all = [...GROUPS.flatMap((g) => g.items), ...SECONDARY];
  return all.find((i) => isActive(i, pathname))?.title ?? 'Workspace';
}

/** A project that is not initialised yet goes to /setup. A server without the status route answers 404, which gates nothing. */
function SetupGate({ pathname }: { pathname: string }) {
  const router = useRouter();
  const status = useSetupStatus();
  const send = status.data?.initialised === false && !pathname.startsWith(routes.setup);
  React.useEffect(() => { if (send) router.replace(routes.setup); }, [send, router]);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  // Counts come from the server (the inbox totals and one filtered count), not from a walk over the cards.
  const { payload, total } = useCards();
  const config = useConfig();
  const inbox = useInbox();
  const gates = inbox.data?.needsYou.total ?? 0;
  const questions = inbox.data?.questions.total ?? 0;
  const backlog = useCardCount({ stage: ['proposed'] }).data ?? 0;
  const cfg = config.data as { product?: string; name?: string } | undefined;
  const product = String(cfg?.product ?? cfg?.name ?? 'codeloop');

  const indicators: Record<string, React.ReactNode> = {
    inbox: gates + questions > 0 ? <CountBadge value={gates + questions} tone="attention" /> : null,
    board: <CountBadge value={backlog} />,
  };

  return (
    <SidebarProvider>
      <SetupGate pathname={pathname} />
      <Sidebar collapsible="icon">
        {/* A masthead, then destinations. The brand is not a menu row: it does not hover like one. */}
        <SidebarHeader className="gap-3 px-2 pt-3 pb-4">
          <Link
            href={routes.board}
            data-testid="sidebar-logo"
            className="flex items-center gap-2 rounded-md outline-hidden focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <SquareTerminal className="size-4" strokeWidth={1.5} />
            </span>
            <span className="truncate text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">{product}</span>
          </Link>
        </SidebarHeader>

        {/* 12px between groups, matching the chanl-admin rail. */}
        <SidebarContent className="gap-0 [&>[data-sidebar=group]:not(:first-child)]:pt-0.5">
          {GROUPS.map((group, i) => (
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
          ))}
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                {SECONDARY.map((item) => <NavRow key={item.id} item={item} pathname={pathname} />)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-medium">{payload?.owner ? 'Owner' : 'Read only'}</span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">{total} cards</span>
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
              <BreadcrumbItem className="hidden sm:block"><span className="text-muted-foreground">{product}</span></BreadcrumbItem>
              <BreadcrumbItem><BreadcrumbPage>{sectionFor(pathname)}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex items-center gap-2">
            <CommandPalette />
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
      <Toaster position="bottom-right" />
    </SidebarProvider>
  );
}
