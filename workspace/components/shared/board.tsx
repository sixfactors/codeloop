'use client';

// The board (docs/artifacts/codeloop-ui-design.html §5 "Board"): one row of columns, Up next, In
// progress, Needs you, Done, for the whole project, from GET /api/board. Replaces the former
// board, which drew one row of kanban columns per lane with a stage per column; that view came
// from GET /api/cards?lane=&stage=, which the search/filter bar narrowed. The new row is a fixed
// shape the server already groups (DisplayState, not a lane's stages), so there is nothing left
// for a lane/stage filter bar to narrow, it is dropped rather than kept wired to a query the new
// endpoint does not take. The backlog strip keeps its own card list (the one thing the board view
// does not carry, only its count) and the promote/drop actions on it, unchanged from before.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronRight, HelpCircle, Kanban, Plus, Trash2, ArrowUpRight } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BoardCard } from '@/components/shared/board-card';
import { BandChip } from '@/components/shared/band-chip';
import { StoryKey } from '@/components/shared/story-key';
import { StatePill } from '@/components/shared/state-pill';
import { Holder } from '@/components/shared/holder';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { ShapeStarter } from '@/components/shared/shape-starter';
import { backlogQuery } from '@/lib/board-columns';
import { useBoard, useCardColumn, useNextAction, useTriage } from '@/hooks/use-api';
import { useRoutes } from '@/components/providers/project-provider';
import type { Band, BoardStory, Card as CardT, DisplayState } from '@/lib/types';
import { cn } from '@/lib/utils';

const CardDrawer = dynamic(() => import('@/components/shared/card-drawer').then((m) => m.CardDrawer), { ssr: false });
const DropDialog = dynamic(() => import('@/components/shared/drop-dialog').then((m) => m.DropDialog), { ssr: false });
const NewCardDialog = dynamic(() => import('@/components/shared/new-card-dialog').then((m) => m.NewCardDialog), { ssr: false });

const COLUMN_LABEL: Record<DisplayState, string> = { backlog: 'Backlog', 'up-next': 'Up next', 'in-progress': 'In progress', 'needs-you': 'Needs you', done: 'Done', shipped: 'Shipped' };

/** The "tile" building block (§4): title, key, priority, holder, state and its flags, open
 * questions. Nothing else, the record behind it (the peek) carries the rest. */
function StoryTile({ story, onOpen, cardHref }: { story: BoardStory; onOpen: (id: string) => void; cardHref: string }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${story.id} ${story.title}`}
      onClick={() => onOpen(story.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(story.id); } }}
      data-testid={`board-card-${story.id}`}
      className="group flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-left text-sm shadow-xs transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="block leading-snug">{story.title}</span>
      <span className="flex items-center gap-1.5">
        <StoryKey id={story.id} href={cardHref} />
        <BandChip band={story.band as Band | undefined} score={story.score} />
        <Holder agent={story.agent} className="ml-auto" />
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <StatePill display={story.display} agent={story.agent} />
        {story.openQuestions ? (
          <Badge variant="secondary" className="shrink-0 gap-1 rounded-full" title={`${story.openQuestions} open question${story.openQuestions === 1 ? '' : 's'}`}>
            <HelpCircle className="size-3" />{story.openQuestions}
          </Badge>
        ) : null}
      </span>
    </div>
  );
}

function StateColumn({ state, label, meta, stories, onOpen, cardHref }: {
  state: DisplayState; label: string; meta?: string; stories: BoardStory[]; onOpen: (id: string) => void; cardHref: (id: string) => string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border bg-muted/40 p-2" data-testid={`board-column-${state}`} data-count={stories.length}>
      <div className="flex items-center justify-between gap-2 px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        <span className="truncate">{label}</span>
        <span className="shrink-0 font-semibold text-foreground tabular-nums normal-case tracking-normal">{meta ?? stories.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto" style={{ maxHeight: '32rem' }}>
        {stories.length === 0 ? <p className="px-1 py-2 text-xs text-muted-foreground">No stories</p> : stories.map((s) => <StoryTile key={s.id} story={s} onOpen={onOpen} cardHref={cardHref(s.id)} />)}
      </div>
    </div>
  );
}

export function Board() {
  const routes = useRoutes();
  const { data, isLoading, error, refetch } = useBoard();
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

  const totalStories = data.columns.reduce((n, c) => n + c.stories.length, 0);
  const empty = totalStories === 0 && backlog.total === 0;
  const allIds = data.columns.flatMap((c) => c.stories.map((s) => s.id));

  const promote = (c: CardT) =>
    triage.mutate({ id: c.id, action: 'promote' }, { onSuccess: () => toast.success(`Promoted ${c.id}`), onError: (e) => toast.error(`Promote failed: ${(e as Error).message}`) });
  const menuFor = (c: CardT) => [
    { label: 'Promote', icon: ArrowUpRight, disabled: triage.isPending, onClick: () => promote(c) },
    { label: 'Drop…', icon: Trash2, destructive: true, disabled: triage.isPending, onClick: () => setDropping(c) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground tabular-nums" data-testid="board-total">{totalStories} stories</span>
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

          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            {data.columns.map((c) => (
              <StateColumn
                key={c.state}
                state={c.state}
                label={c.label}
                meta={c.state === 'up-next' ? (data.upNext.limit ? `${data.upNext.count} of ${data.upNext.limit}` : String(data.upNext.count)) : undefined}
                stories={c.stories}
                onOpen={setOpen}
                cardHref={(id) => routes.card(id)}
              />
            ))}
          </div>
        </div>
      )}

      {open ? <CardDrawer id={open} onClose={() => setOpen(null)} ids={[...allIds, ...backlog.cards.map((c) => c.id)]} onNavigate={setOpen} /> : null}
      {dropping ? <DropDialog card={dropping} onClose={() => setDropping(null)} /> : null}
      {creating ? <NewCardDialog open onOpenChange={(o) => { if (!o) setCreating(false); }} onCreated={setOpen} /> : null}
    </div>
  );
}
