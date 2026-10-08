'use client';

// The wiki tree from the app's own sidebar primitives: one SidebarMenu row per folder, a
// Collapsible under it with SidebarMenuSub rows for the pages. Folders are closed by default and the
// one holding the current page opens; a filter opens every folder it matches. Past 100 visible rows
// the flattened tree is virtualised so a 20k-page wiki scrolls like a short one.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useVirtualizer } from '@tanstack/react-virtual';
import { BookOpen, ChevronRight, Search } from 'lucide-react';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from '@/components/ui/sidebar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { VIRTUAL_THRESHOLD } from '@/components/shared/virtual-list';
import { buildTree, folderIcon, type TreeFolder } from '@/lib/wiki';
import { routes } from '@/lib/routes';
import type { PageSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

type Row = { kind: 'folder'; folder: TreeFolder } | { kind: 'page'; page: PageSummary; folder: string };

const pageHref = (p: PageSummary) => routes.wiki(p.id);

// Which folders the user opened, kept for the tab's life: /wiki and /wiki/<page> are different
// route segments, so the tree remounts between them and would otherwise fold back up.
let openFolders: Record<string, boolean> = {};

function FolderRow({ folder, open, onToggle }: { folder: TreeFolder; open: boolean; onToggle: () => void }) {
  const Icon = folderIcon(folder.id);
  return (
    <SidebarMenuButton onClick={onToggle} aria-expanded={open} data-testid={`wiki-folder-${folder.id}`} className="h-8">
      <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />
      <Icon className="size-3.5" strokeWidth={1.5} />
      <span className="flex-1 truncate">{folder.label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{folder.count}</span>
    </SidebarMenuButton>
  );
}

function PageRow({ page, active }: { page: PageSummary; active: boolean }) {
  return (
    <SidebarMenuSubButton isActive={active} render={<Link href={pageHref(page)} data-active={active} />} className="h-7">
      <span className="truncate">{page.title}</span>
    </SidebarMenuSubButton>
  );
}

export function WikiSidebar({ pages, loading }: { pages: PageSummary[]; loading?: boolean }) {
  const pathname = usePathname() ?? '';
  const current = pathname.replace(/^\/wiki\/?/, '').replace(/\/$/, '');
  const currentId = useMemo(() => { try { return current.split('/').map(decodeURIComponent).join('/'); } catch { return current; } }, [current]);
  const [filter, setFilter] = useState('');
  const tree = useMemo(() => buildTree(pages, filter), [pages, filter]);
  const [open, setOpenState] = useState<Record<string, boolean>>(() => openFolders);
  const setOpen = (fn: (o: Record<string, boolean>) => Record<string, boolean>) => setOpenState((o) => (openFolders = fn(o)));

  // The folder holding the current page opens on arrival; the others keep whatever the user set.
  useEffect(() => {
    const f = tree.find((t) => t.pages.some((p) => p.id === currentId));
    if (f) setOpen((o) => (o[f.id] ? o : { ...o, [f.id]: true }));
  }, [tree, currentId]);

  const isOpen = (id: string) => Boolean(filter) || Boolean(open[id]);
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !isOpen(id) }));

  const rows = useMemo<Row[]>(() => tree.flatMap((folder) => [
    { kind: 'folder', folder } as Row,
    ...(isOpen(folder.id) ? folder.pages.map((page) => ({ kind: 'page', page, folder: folder.id }) as Row) : []),
  ]), [tree, open, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const parentRef = useRef<HTMLDivElement>(null);
  const virtual = rows.length > VIRTUAL_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i].kind === 'folder' ? 32 : 28),
    overscan: 12,
    getItemKey: (i) => (rows[i].kind === 'folder' ? `f:${rows[i].folder.id}` : `p:${(rows[i] as { page: PageSummary }).page.id}`),
  });

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="wiki-sidebar">
      <div className="flex h-12 shrink-0 items-center px-4">
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Pages</span>
      </div>
      <div className="relative px-3 pb-2">
        <Search className="pointer-events-none absolute top-1/2 left-5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter pages"
          aria-label="Filter pages"
          className="h-8 border-0 bg-background/70 pl-8 text-sm shadow-none"
          data-testid="wiki-filter"
        />
      </div>
      {loading ? (
        <div className="flex flex-col gap-2 px-2" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : tree.length === 0 ? (
        <EmptyState compact icon={BookOpen} title={filter ? 'No page matches' : 'No pages yet'} description={filter ? 'Try fewer letters.' : 'Pages under .codeloop/wiki appear here. New page starts one.'} />
      ) : virtual ? (
        <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 text-sm" data-virtual="true" data-testid="wiki-tree">
          <ul style={{ height: virtualizer.getTotalSize(), position: 'relative' }} className="list-none">
            {virtualizer.getVirtualItems().map((v) => {
              const row = rows[v.index];
              return (
                <li key={v.key} data-index={v.index} ref={virtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }} className={row.kind === 'page' ? 'pl-4' : undefined}>
                  {row.kind === 'folder' ? <FolderRow folder={row.folder} open={isOpen(row.folder.id)} onToggle={() => toggle(row.folder.id)} /> : <PageRow page={row.page} active={row.page.id === currentId} />}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 text-sm" data-testid="wiki-tree">
          <SidebarMenu>
            {tree.map((folder) => (
              <Collapsible key={folder.id} open={isOpen(folder.id)} render={<SidebarMenuItem />}>
                <FolderRow folder={folder} open={isOpen(folder.id)} onToggle={() => toggle(folder.id)} />
                <CollapsibleContent>
                  <SidebarMenuSub className="mr-0 pr-0">
                    {folder.pages.map((page) => (
                      <SidebarMenuSubItem key={page.id}><PageRow page={page} active={page.id === currentId} /></SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </SidebarMenu>
        </div>
      )}
    </div>
  );
}
