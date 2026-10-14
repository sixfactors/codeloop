'use client';

// The board (story-journey spec §3): columns are the shown lane's journey, Up next, each phase in
// order, then Live this week; rows are who holds the story, Needs you, Agent, Queued. A phase with
// no story collapses to its header and a row with none is left out. GET /api/board?lane= returns
// it grouped, with each story's holder and live line, and the one story count (`total`, `ids`)
// the header, the sidebar and the drawer pager all show. The backlog strip keeps its own list.

import { Fragment, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronRight, Kanban, Lock, Plus, Trash2, ArrowUpRight } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { BoardCard } from '@/components/shared/board-card';
import { StoryBadge } from '@/components/shared/state-pill';
import { Holder } from '@/components/shared/holder';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { ShapeStarter } from '@/components/shared/shape-starter';
import { backlogQuery } from '@/lib/board-columns';
import { useBoard, useCardColumn, useNextAction, useTriage } from '@/hooks/use-api';
import type { BoardPhase, BoardStory, BoardView, Card as CardT, DisplayState } from '@/lib/types';
import { cn } from '@/lib/utils';

const CardDrawer = dynamic(() => import('@/components/shared/card-drawer').then((m) => m.CardDrawer), { ssr: false });
const DropDialog = dynamic(() => import('@/components/shared/drop-dialog').then((m) => m.DropDialog), { ssr: false });
const NewCardDialog = dynamic(() => import('@/components/shared/new-card-dialog').then((m) => m.NewCardDialog), { ssr: false });

const COLUMN_LABEL: Record<DisplayState, string> = { backlog: 'Backlog', 'up-next': 'Up next', 'in-progress': 'In progress', 'needs-you': 'Needs you', done: 'Done', shipped: 'Shipped' };

/** "40s ago", "12 min ago", "3h ago", "2d ago". */
export const ago = (iso?: string) => {
  if (!iso) return undefined;
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 172_800 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86_400)}d ago`;
};
const inPhase = (iso?: string) => {
  const a = ago(iso);
  return a ? `in phase ${a.replace(' ago', '')}` : undefined;
};

/** The card face: title, who holds it, its live line, how long it has been in this phase, one badge. */
function PhaseCard({ story, onOpen }: { story: BoardStory; onOpen: (id: string) => void }) {
  const who = story.holder === 'agent' ? story.agent : story.holder === 'needs-you' ? 'You' : undefined;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${story.id} ${story.title}`}
      onClick={() => onOpen(story.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(story.id); } }}
      data-testid={`board-card-${story.id}`}
      data-holder={story.holder}
      className="group flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-2.5 text-left text-sm shadow-xs transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="block leading-snug">{story.title}</span>
      {who ? (
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          {story.holder === 'agent' ? <Holder agent={story.agent} /> : <Avatar className="size-5"><AvatarFallback className="bg-warning/20 text-[10px] font-semibold">Y</AvatarFallback></Avatar>}
          <span className="truncate">{who}</span>
        </span>
      ) : null}
      {story.lastActivity ? (
        <span className="line-clamp-2 text-xs text-muted-foreground" data-testid="board-card-live-line">
          {story.lastActivity.text}{story.lastActivity.at ? ` · ${ago(story.lastActivity.at)}` : ''}
        </span>
      ) : null}
      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="font-mono">{story.id}</span>
        {story.phaseSince && story.display.state !== 'done' && story.display.state !== 'shipped' ? <span>{inPhase(story.phaseSince)}</span> : null}
        <span className="ml-auto"><StoryBadge display={story.display} /></span>
      </span>
    </div>
  );
}

/** One column header: the phase, its gate, its count. An empty phase is only this, narrow. */
function PhaseHeader({ phase }: { phase: BoardPhase }) {
  const empty = phase.count === 0;
  return (
    <div className={cn('flex gap-1 px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase', empty ? 'flex-col-reverse items-center' : 'items-center')} title={empty ? `${phase.label}: no stories` : undefined}>
      <span className={cn(empty ? '[writing-mode:vertical-rl] rotate-180 py-1' : 'truncate')}>{phase.label}</span>
      {phase.gate ? <Lock className="size-3 shrink-0" aria-label={`gate ${phase.gate}`} /> : null}
      {!empty ? <span className="ml-auto shrink-0 font-semibold text-foreground tabular-nums normal-case tracking-normal">{phase.count}</span> : null}
    </div>
  );
}

/** The journey grid: one column per phase (empty ones narrow), one band per holder row that has stories. */
function PhaseGrid({ view, onOpen }: { view: BoardView; onOpen: (id: string) => void }) {
  const columns = view.phases.filter((p) => p.kind !== 'live');
  const template = columns.map((p) => (p.count ? 'minmax(13rem, 1fr)' : 'minmax(2rem, auto)')).join(' ');
  const rows = view.rows.filter((r) => r.count > 0);
  return (
    <div className="min-w-0 flex-1 overflow-x-auto" data-testid="board-phase-grid">
      <div className="grid gap-2" style={{ gridTemplateColumns: template }}>
        {columns.map((p) => (
          <div key={p.id} className="rounded-md bg-muted/40 py-1.5" data-testid={`board-phase-${p.id}`} data-count={p.count} data-collapsed={p.count === 0 || undefined}>
            <PhaseHeader phase={p} />
          </div>
        ))}
        {rows.map((row) => (
          <Fragment key={row.id}>
            <div className="flex items-center gap-2 px-1 pt-2 text-xs font-medium" style={{ gridColumn: '1 / -1' }} data-testid={`board-row-${row.id}`} data-count={row.count}>
              {row.label}<span className="text-muted-foreground tabular-nums">{row.count}</span>
            </div>
            {columns.map((p) => (
              <div key={`${row.id}-${p.id}`} className="flex min-w-0 flex-col gap-2">
                {p.cells[row.id].map((s) => <PhaseCard key={s.id} story={s} onOpen={onOpen} />)}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      {rows.length === 0 ? <p className="px-1 py-3 text-xs text-muted-foreground">Nothing is moving in this lane.</p> : null}
    </div>
  );
}

/** Live this week: what shipped in this lane in the last seven days, newest first. */
function LiveColumn({ phase, onOpen }: { phase?: BoardPhase; onOpen: (id: string) => void }) {
  if (!phase) return null;
  const stories = [...phase.cells['needs-you'], ...phase.cells.agent, ...phase.cells.queued];
  return (
    <aside className="flex min-w-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2 lg:basis-72 lg:shrink-0" data-testid="board-live" data-count={phase.count}>
      <div className="flex items-center gap-1 px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        <span>{phase.label}</span><span className="ml-auto font-semibold text-foreground tabular-nums normal-case tracking-normal">{phase.count}</span>
      </div>
      {stories.length ? stories.map((s) => (
        <button key={s.id} type="button" onClick={() => onOpen(s.id)} data-testid={`board-card-${s.id}`} className="flex min-w-0 items-baseline gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-muted">
          <span className="shrink-0 font-mono text-muted-foreground">{s.id}</span><span className="min-w-0 truncate">{s.title}</span>
        </button>
      )) : <p className="px-1 text-xs text-muted-foreground">Nothing shipped this week.</p>}
    </aside>
  );
}

export function Board() {
  const [lane, setLane] = useState<string | undefined>(undefined);
  const { data, isLoading, error, refetch } = useBoard(lane);
  const next = useNextAction();
  const triage = useTriage();
  const backlogQ = backlogQuery({});
  const backlog = useCardColumn(backlogQ);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dropping, setDropping] = useState<CardT | null>(null);

  if (error) return <InlineError title="Board failed to load" error={error} onRetry={() => refetch()} />;
  if (isLoading || !data || backlog.isLoading) return <PageSkeleton statCards={0} columns={4} />;

  // One count for the whole board, backlog included: the same number the sidebar and the drawer pager show.
  const empty = data.total === 0;

  const promote = (c: CardT) =>
    triage.mutate({ id: c.id, action: 'promote' }, { onSuccess: () => toast.success(`Promoted ${c.id}`), onError: (e) => toast.error(`Promote failed: ${(e as Error).message}`) });
  const menuFor = (c: CardT) => [
    { label: 'Promote', icon: ArrowUpRight, disabled: triage.isPending, onClick: () => promote(c) },
    { label: 'Drop…', icon: Trash2, destructive: true, disabled: triage.isPending, onClick: () => setDropping(c) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {data.lanes.length > 1 ? (
            <ToggleGroup value={[data.lane ?? '']} onValueChange={(v: string[]) => { if (v[0]) setLane(v[0]); }} aria-label="Lane" data-testid="board-lane-picker">
              {data.lanes.map((l) => <ToggleGroupItem key={l.id} value={l.id} size="sm">{l.id}<span className="ml-1 text-muted-foreground tabular-nums">{l.count}</span></ToggleGroupItem>)}
            </ToggleGroup>
          ) : null}
          <span className="text-xs text-muted-foreground tabular-nums" data-testid="board-total">{data.total} stories</span>
        </div>
        <Button size="sm" onClick={() => setCreating(true)} data-testid="board-new-card"><Plus />New story</Button>
      </div>

      {empty ? (
        next.data?.kind === 'empty' ? (
          <ShapeStarter onCreated={setOpen} onNewStory={() => setCreating(true)} />
        ) : (
          <EmptyState icon={Kanban} title="No stories yet" description="Make the first one here, or from the terminal with `codeloop start` or `codeloop card propose`." action={{ label: 'New story', onClick: () => setCreating(true) }} />
        )
      ) : (
        <div className="flex flex-col gap-3">
          {/* Backlog: proposals wait here until promoted or dropped. A collapsible strip so an
              empty or a long backlog never pushes the four-state row down. */}
          <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2.5" data-testid="board-backlog">
            <button
              type="button"
              onClick={() => setBacklogOpen((o) => !o)}
              className="flex items-center gap-1.5 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
              aria-expanded={backlogOpen}
            >
              <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', backlogOpen && 'rotate-90')} />
              <span>{COLUMN_LABEL.backlog}</span>
              <b className="font-semibold text-foreground tabular-nums">{backlog.total}</b>
            </button>
            {backlogOpen ? (
              backlog.isLoading ? (
                <div className="flex gap-2 p-1"><div className="h-20 w-64 animate-pulse rounded-lg bg-muted" /></div>
              ) : backlog.total === 0 ? (
                <p className="py-1 pl-5 text-xs text-muted-foreground">Nothing proposed. New story above, or `codeloop card propose &lt;lane&gt; &lt;title&gt;` from the terminal.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {backlog.cards.map((c) => (
                    <div key={c.id} className="w-64 shrink-0"><BoardCard card={c} onOpen={setOpen} menuItems={menuFor(c)} /></div>
                  ))}
                  {backlog.hasNextPage ? (
                    <Button variant="outline" size="sm" disabled={backlog.isFetchingNextPage} onClick={() => backlog.fetchNextPage()}>
                      {backlog.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </Button>
                  ) : null}
                </div>
              )
            ) : null}
          </section>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <PhaseGrid view={data} onOpen={setOpen} />
            <LiveColumn phase={data.phases.find((p) => p.kind === 'live')} onOpen={setOpen} />
          </div>
        </div>
      )}

      {open ? <CardDrawer id={open} onClose={() => setOpen(null)} ids={data.ids} onNavigate={setOpen} /> : null}
      {dropping ? <DropDialog card={dropping} onClose={() => setDropping(null)} /> : null}
      {creating ? <NewCardDialog open onOpenChange={(o) => { if (!o) setCreating(false); }} onCreated={setOpen} /> : null}
    </div>
  );
}
