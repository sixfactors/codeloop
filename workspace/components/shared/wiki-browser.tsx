'use client';

// The wiki screen, laid out like a reading app: a quiet rail on the left (tree + filter), one
// slim bar on top (breadcrumb, actions) and a centred reading column. No page header and no
// bordered panel around it: the content is the page. The rail width is remembered in
// localStorage. The chrome is the app's own sidebar, collapsible and scroll-area pieces.

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Pencil, Plus } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { WikiSidebar } from '@/components/shared/wiki/wiki-sidebar';
import { WikiHome } from '@/components/shared/wiki/wiki-home';
import { WikiSearch } from '@/components/shared/wiki/wiki-search';
import { WikiPageView } from '@/components/shared/wiki/wiki-page-view';
import { WikiPageEditor } from '@/components/shared/wiki/wiki-page-editor';
import { WikiNewPageDialog } from '@/components/shared/wiki/wiki-new-page-dialog';
import { isMissing, useCards, usePages } from '@/hooks/use-api';
import { token } from '@/lib/api';
import { routes } from '@/lib/routes';
import { folderLabel, pageFolder } from '@/lib/wiki';

const RAIL_KEY = 'codeloop-wiki-rail';
const readRail = () => { try { const v = Number(localStorage.getItem(RAIL_KEY)); return v >= 200 && v <= 600 ? v : 260; } catch { return 260; } };

type Crumb = { label: string; href?: string };

export function WikiBrowser({ path }: { path: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const q = sp.get('q') ?? '';
  const editing = sp.get('edit') === '1';
  const pages = usePages();
  const cards = useCards();
  const canEdit = cards.payload?.owner !== false;
  // One layout at a time: rendering the content in both a hidden phone column and the desktop
  // panel would mount two editors, two ⌘S listeners and two PUTs (the second one a 409).
  const phone = useIsMobile();
  const [newOpen, setNewOpen] = useState(false);
  const [rail, setRail] = useState(260);
  // Capture ?token= into sessionStorage now: the first write usually happens after the URL has
  // been replaced with ?edit=1, and writeHeaders() would otherwise find no token.
  useEffect(() => { token(); setRail(readRail()); }, []);
  const onRail = useCallback((size: { inPixels: number }) => { if (size.inPixels < 200) return; try { localStorage.setItem(RAIL_KEY, String(Math.round(size.inPixels))); } catch { /* storage blocked */ } }, []);

  const current = useMemo(() => pages.pages.find((p) => p.id === path), [pages.pages, path]);
  const ids = useMemo(() => new Set(pages.pages.map((p) => p.id)), [pages.pages]);
  const setQuery = (next: string) => router.replace(next ? `${routes.wiki()}?q=${encodeURIComponent(next)}` : routes.wiki());
  const setEditing = (on: boolean) => router.replace(on ? `${routes.wiki(path)}?edit=1` : routes.wiki(path));

  const crumbs: Crumb[] = [{ label: 'Wiki', href: routes.wiki() }];
  if (path) {
    const folder = current ? pageFolder(current) : path.split('/').slice(0, -1).pop() ?? '';
    crumbs.push({ label: folderLabel(folder.replace(/^\.codeloop\/wiki\//, '')) });
    crumbs.push({ label: current?.title ?? path.split('/').pop() ?? path });
  } else if (q) crumbs.push({ label: 'Search' });

  const content = pages.error ? (
    isMissing(pages.error)
      ? <EmptyState icon={BookOpen} title="Wiki is not served yet" description="GET /api/pages is not on this server. Start codeloop serve from a repo with a .codeloop folder." />
      : <InlineError title="Wiki failed to load" error={pages.error} onRetry={() => pages.refetch()} />
  ) : path ? (
    editing && canEdit
      ? <WikiPageEditor key={path} path={path} onDone={() => setEditing(false)} />
      : <WikiPageView key={path} path={path} canEdit={canEdit} onEdit={() => setEditing(true)} />
  ) : q ? (
    <WikiSearch q={q} onQueryChange={setQuery} />
  ) : (
    <WikiHome pages={pages.pages} loading={pages.isLoading} onNew={canEdit ? () => setNewOpen(true) : undefined} />
  );

  // The editor needs the whole width; reading gets a measured column.
  const column = editing && path ? 'mx-auto w-full max-w-6xl px-6 py-6 md:px-10' : 'mx-auto w-full max-w-[52rem] px-6 py-8 md:px-12 md:py-12';

  const bar = (
    <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-5">
      <Breadcrumb>
        <BreadcrumbList className="text-xs">
          {crumbs.map((c, i) => (
            <Fragment key={`${c.label}-${i}`}>
              <BreadcrumbItem>
                {c.href ? <BreadcrumbLink render={<Link href={c.href} />}>{c.label}</BreadcrumbLink> : <BreadcrumbPage className="max-w-[40vw] truncate">{c.label}</BreadcrumbPage>}
              </BreadcrumbItem>
              {i < crumbs.length - 1 ? <BreadcrumbSeparator /> : null}
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      {canEdit ? (
        <div className="flex items-center gap-1">
          {path && !editing ? <Button size="sm" variant="ghost" onClick={() => setEditing(true)} data-testid="wiki-edit"><Pencil />Edit</Button> : null}
          <Button size="sm" variant="ghost" onClick={() => setNewOpen(true)} data-testid="wiki-new"><Plus />New page</Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <div className="flex h-full min-h-0 flex-col" data-testid="wiki">
        {phone ? (
          <>
            {bar}
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-6 px-5 py-6">
                {path || q ? content : <><WikiSidebar pages={pages.pages} loading={pages.isLoading} />{content}</>}
              </div>
            </ScrollArea>
          </>
        ) : (
          <ResizablePanelGroup key={rail} orientation="horizontal" className="min-h-0 flex-1">
            <ResizablePanel defaultSize={`${rail}px`} minSize="200px" maxSize="40%" onResize={onRail} className="border-r bg-sidebar/60">
              <WikiSidebar pages={pages.pages} loading={pages.isLoading} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel className="flex min-h-0 flex-col">
              {bar}
              <ScrollArea className="min-h-0 flex-1"><div className={column}>{content}</div></ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
        <WikiNewPageDialog open={newOpen} onOpenChange={setNewOpen} existingIds={ids} defaultFolder={current ? pageFolder(current) : 'concepts'} />
      </div>
    </>
  );
}
