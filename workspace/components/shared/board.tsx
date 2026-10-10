'use client';

// The board: pm-board's lane sections (header strip with progress, one column per stage, sticky
// uppercase stage headers) built from the copied BoardCard / ColumnHeader, with chanl-admin's
// SearchAndFilter + SavedViewTabs as the toolbar. Every stage column is a fixed-width box
// (COLUMN_WIDTH) with a visible muted surface, so a lane reads as a kanban row rather than a line
// of headings — fixed width lets every column look the same whether it holds one card or none,
// instead of the old content-sized grid track collapsing an empty stage to label width.
//
// Every column is its own query (`GET /api/cards?lane=&stage=&sort=score&limit=50`), paged by
// cursor as the column scrolls, so a 5k-card project draws 50 rows per column and never holds the
// whole list. The backlog strip pages the same way. Every count on the page is a server total: the
// header count is `total` for the current filter, a column's count is its page's `total`.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import dynamic from 'next/dynamic';
import { ArrowUpRight, ChevronRight, Kanban, Layers, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { VIRTUAL_THRESHOLD, VirtualList } from '@/components/shared/virtual-list';
import { BoardCard, ColumnHeader, cardTone, type CardTone } from '@/components/shared/board-card';
import { BAND_LABEL } from '@/components/shared/band-chip';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EMPTY_SEARCH, SearchAndFilter, type FacetDef, type SearchAndFilterValue } from '@/components/shared/search-and-filter';
import { SavedViewTabs } from '@/components/shared/saved-view-tabs';
import { UsageBar } from '@/components/shared/usage-bar';
import { useCardColumn, useCardCount, useCardFacets, useCards, useInbox, useLanes, useTriage } from '@/hooks/use-api';
import { backlogQuery, laneColumns, toQuery, type ColumnSpec } from '@/lib/board-columns';
import { DONE_STAGE_IDS, isShipped } from '@/lib/cards';
import { BANDS, BOARD_FACETS, type BoardFacet, type Card as CardT, type CardsQuery, type Lane } from '@/lib/types';
import { cn } from '@/lib/utils';

// The card sheet (detail body, tabs, tables) loads the first time a card is opened; the drop
// dialog the first time a card is dropped; the new-card form the first time it is asked for.
// None is in the board's first load.
const CardDrawer = dynamic(() => import('@/components/shared/card-drawer').then((m) => m.CardDrawer), { ssr: false });
const DropDialog = dynamic(() => import('@/components/shared/drop-dialog').then((m) => m.DropDialog), { ssr: false });
const NewCardDialog = dynamic(() => import('@/components/shared/new-card-dialog').then((m) => m.NewCardDialog), { ssr: false });

const FACET_TITLES: Record<BoardFacet, string> = { initiative: 'Initiative', epic: 'Epic', feature: 'Feature', band: 'Priority', persona: 'Persona', size: 'Size' };
const NO_CARDS: CardT[] = [];

/** Build lane first, then the lane the user filtered to, then the rest A–Z. */
function orderLanes(lanes: Lane[], filtered: string[]): Lane[] {
  const rank = (id: string) => (id === 'build' ? 0 : filtered.includes(id) ? 1 : 2);
  return [...lanes].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

function stageTone(lane: Lane | undefined, stageId: string, cards: CardT[]): CardTone {
  const stage = lane?.stages.find((s) => s.id === stageId);
  if (stage?.gate) return 'waiting';
  const last = lane?.stages.at(-1)?.id === stageId;
  if (last || DONE_STAGE_IDS.includes(stageId) || cards.some(isShipped)) return 'done';
  if (cards.some((c) => cardTone(c) === 'agent')) return 'agent';
  return 'none';
}

/** Score descending, unranked last, otherwise the server's order. Applied to the loaded rows of one column. */
function byScore(cards: CardT[]): CardT[] {
  if (!cards.some((c) => typeof c.score === 'number')) return cards;
  return cards.map((c, i) => [c, i] as const).sort(([a, ai], [b, bi]) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || ai - bi).map(([c]) => c);
}

type ColumnState = { total: number; ids: string[]; loading: boolean };

function ColumnSkeleton() {
  return <div className="flex flex-col gap-2 p-2" aria-busy="true"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>;
}

const LoadingMore = () => <p className="py-2 text-center text-xs text-muted-foreground">Loading more…</p>;

/** Fixed width every stage column holds, so a lane reads as a row of same-size kanban columns. */
const COLUMN_WIDTH = 280;
/** Column box caps its own height and scrolls internally past this; short columns stretch to match
 * the tallest column in the row (flex default), so a lane row reads as one shelf of equal boxes. */
const COLUMN_MAX_H = '26rem';

/** A horizontally-scrolling row of fixed-width column boxes — the one primitive both lane view and
 * the "by initiative" view lay their columns out with. */
function ColumnRow({ children, scrollRef }: { children: ReactNode; scrollRef?: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="overflow-x-auto overscroll-x-contain pb-2" ref={scrollRef}>
      <div className="flex items-stretch gap-3" style={{ minWidth: 'max-content' }}>{children}</div>
    </div>
  );
}

/** One stage column: its own paged query, a fixed-width muted box, the header count from the server's total. */
function Column({ spec, onOpen, onState, menuFor }: {
  spec: ColumnSpec;
  onOpen: (id: string) => void;
  onState: (key: string, state: ColumnState) => void;
  menuFor?: (c: CardT) => Parameters<typeof BoardCard>[0]['menuItems'];
}) {
  const col = useCardColumn(spec.query);
  const { total, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage, error, refetch } = col;
  const cards = useMemo(() => byScore(col.cards), [col.cards]);
  useEffect(() => { onState(spec.key, { total, ids: cards.map((c) => c.id), loading: isLoading }); }, [spec.key, total, cards, isLoading, onState]);
  const more = useCallback(() => { if (hasNextPage && !isFetchingNextPage) void fetchNextPage(); }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const gate = spec.lane?.stages.find((s) => s.id === spec.stageId)?.gate;
  const gateName = gate ? (typeof gate === 'string' ? gate : gate.name) : undefined;
  if (spec.optional && !isLoading && total === 0) return null;
  return (
    <div
      className="flex shrink-0 flex-col overflow-y-auto rounded-lg border bg-muted/40"
      style={{ width: COLUMN_WIDTH, maxHeight: COLUMN_MAX_H, minHeight: '7rem' }}
      data-testid={`column-${spec.key.replace('/', '-')}`}
      data-count={total}
    >
      <ColumnHeader label={spec.label} count={total} tone={stageTone(spec.lane, spec.stageId ?? spec.label, cards)} meta={gateName ? <span className="text-[10px] text-warning-foreground dark:text-warning">gate</span> : null} />
      <div className="flex-1 p-2">
        {isLoading ? <ColumnSkeleton /> : error ? <InlineError title="Column failed to load" error={error} onRetry={() => refetch()} /> : cards.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">No cards</p>
        ) : (
          <VirtualList
            items={cards}
            keyOf={(c) => c.id}
            gap={8}
            // The column box itself scrolls (header pinned via sticky), so the list never opens a nested scroller.
            maxHeight="none"
            // A column with more pages scrolls inside itself from the start, so paging never changes its height.
            threshold={hasNextPage ? 0 : VIRTUAL_THRESHOLD}
            onEndReached={hasNextPage ? more : undefined}
            footer={isFetchingNextPage ? <LoadingMore /> : null}
            render={(c) => <BoardCard card={c} onOpen={onOpen} menuItems={menuFor?.(c)} />}
          />
        )}
      </div>
    </div>
  );
}

function LaneSection({ lane, base, showDropped, states, onOpen, onState }: {
  lane: Lane; base: CardsQuery; showDropped: boolean; states: Record<string, ColumnState>; onOpen: (id: string) => void; onState: (key: string, s: ColumnState) => void;
}) {
  const cols = useMemo(() => laneColumns(lane, base, showDropped), [lane, base, showDropped]);
  const visible = cols.filter((c) => !c.optional || (states[c.key]?.total ?? 0) > 0);
  const totalOf = (c: ColumnSpec) => states[c.key]?.total ?? 0;
  const inLane = visible.filter((c) => c.stageId !== 'dropped').reduce((n, c) => n + totalOf(c), 0);
  const done = visible.filter((c) => c.stageId === 'done' || DONE_STAGE_IDS.includes(c.stageId ?? '') || lane.stages.at(-1)?.id === c.stageId).reduce((n, c) => n + totalOf(c), 0);
  const inFlight = inLane - done;
  const settled = visible.every((c) => states[c.key] && !states[c.key].loading);

  // Once the totals land, the first stage with cards is scrolled into view; a lane whose only card
  // sits in a late stage otherwise shows empty columns at first paint. Once per filter.
  const scroller = useRef<HTMLDivElement>(null);
  const scrolled = useRef<string>('');
  const scope = JSON.stringify(base);
  useEffect(() => {
    if (!settled || scrolled.current === scope || !scroller.current) return;
    scrolled.current = scope;
    const first = visible.findIndex((c) => totalOf(c) > 0);
    if (first < 0) return;
    if (first === 0) return;
    const el = scroller.current.querySelector<HTMLElement>(`[data-testid="column-${visible[first].key.replace('/', '-')}"]`);
    if (!el) return;
    const box = scroller.current;
    // Align the column's left edge with the view; a column wider than a phone's viewport is still read from its start.
    if (el.offsetLeft + Math.min(el.offsetWidth, box.clientWidth) > box.scrollLeft + box.clientWidth) box.scrollTo({ left: Math.max(0, el.offsetLeft - 8) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, scope]);

  return (
    <section className="flex flex-col gap-2.5" data-testid={`lane-${lane.id}`}>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
        <b className="text-sm font-semibold text-foreground">{lane.id}</b>
        <span className="tabular-nums" data-testid={`lane-${lane.id}-done`}>{done}/{inLane} done</span>
        {lane.metric ? <span>measure: {typeof lane.metric === 'string' ? lane.metric : (lane.metric as { name?: string }).name}</span> : null}
        {lane.wip ? <UsageBar label="WIP" current={inFlight} limit={lane.wip} size="sm" className="ml-auto w-32 shrink-0" /> : null}
      </div>
      <ColumnRow scrollRef={scroller}>
        {cols.map((c) => <Column key={c.key} spec={c} onOpen={onOpen} onState={onState} />)}
      </ColumnRow>
    </section>
  );
}

export function Board({ initial = EMPTY_SEARCH }: { initial?: SearchAndFilterValue }) {
  const [filters, setFilters] = useState<SearchAndFilterValue>(initial);
  const base = useMemo(() => toQuery(filters), [filters]);
  const lanes = useLanes();
  const triage = useTriage();
  const facets = useCardFacets(NO_CARDS);
  const { payload } = useCards();
  const inbox = useInbox();
  const needsYou = inbox.data?.needsYou.total;
  const matching = useCardCount(base);
  const [pending, setPending] = useState(false);
  const [backlogOpen, setBacklogOpen] = useState(true);
  const [group, setGroup] = useState<'lane' | 'initiative'>('lane');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dropping, setDropping] = useState<CardT | null>(null);
  // Column reports are keyed by the filter they answer, so a report from a previous filter never
  // counts toward this one and a column never has to report twice.
  const scope = useMemo(() => JSON.stringify([base, group]), [base, group]);
  const [allStates, setAllStates] = useState<Record<string, Record<string, ColumnState>>>({});
  const onState = useCallback((key: string, s: ColumnState) => setAllStates((prev) => {
    const cur = prev[scope]?.[key];
    if (cur && cur.total === s.total && cur.loading === s.loading && cur.ids.length === s.ids.length && cur.ids.every((id, i) => id === s.ids[i])) return prev;
    return { ...prev, [scope]: { ...(prev[scope] ?? {}), [key]: s } };
  }), [scope]);
  const states = useMemo(() => allStates[scope] ?? {}, [allStates, scope]);

  const showDropped = Boolean(filters.facets.dropped?.includes('yes'));
  const dropped = facets.stage?.find((o) => o.value === 'dropped')?.count ?? 0;
  const facetDefs = useMemo<FacetDef[]>(() => {
    const defs: FacetDef[] = BOARD_FACETS.map((k) => ({
      id: k,
      title: FACET_TITLES[k],
      searchable: k === 'feature' || k === 'epic' || k === 'initiative',
      // Priority always lists P1–P4, with counts once the API bands cards.
      options: k === 'band'
        ? BANDS.map((b) => ({ label: BAND_LABEL[b], value: b, count: facets.band?.find((o) => o.value === b)?.count }))
        : (facets[k] ?? []).map((o) => ({ label: o.value, value: o.value, count: o.count })),
    }));
    defs.push({ id: 'needsMe', title: 'Needs me', options: [{ label: 'Waiting on me', value: 'yes', count: needsYou }] });
    defs.push({ id: 'dropped', title: 'Dropped', options: [{ label: 'Show dropped', value: 'yes', count: dropped }] });
    return defs;
  }, [facets, dropped, needsYou]);

  const backlogQ = useMemo(() => backlogQuery(base), [base]);
  const backlog = useCardColumn(backlogQ);
  const backlogCards = useMemo(() => byScore(backlog.cards), [backlog.cards]);
  const backlogMore = useCallback(() => { if (backlog.hasNextPage && !backlog.isFetchingNextPage) void backlog.fetchNextPage(); }, [backlog]);

  // Lanes the user filtered to, else all; a filtered stage narrows every lane to that stage.
  const orderedLanes = useMemo(() => {
    const picked = filters.facets.lane ?? [];
    const shown = picked.length ? lanes.data.filter((l) => picked.includes(l.id)) : lanes.data;
    const stages = filters.facets.stage ?? [];
    return orderLanes(stages.length ? shown.map((l) => ({ ...l, stages: l.stages.filter((s) => stages.includes(s.id)) })) : shown, picked);
  }, [lanes.data, filters.facets.lane, filters.facets.stage]);

  // By initiative: one column per initiative the facets know, over the stages that are neither backlog nor dropped.
  const activeStages = useMemo(() => (facets.stage ?? []).map((o) => o.value).filter((s) => s !== 'proposed' && s !== 'dropped'), [facets.stage]);
  const initiativeCols = useMemo<ColumnSpec[]>(() => {
    const names = (facets.initiative ?? []).map((o) => o.value).filter((n) => !filters.facets.initiative?.length || filters.facets.initiative.includes(n));
    return names.map((n) => ({ key: `initiative/${n}`, label: n, query: { ...base, initiative: [n], ...(activeStages.length ? { stage: activeStages } : {}) } }));
  }, [facets.initiative, filters.facets.initiative, base, activeStages]);

  const anyLoading = backlog.isLoading || Object.values(states).some((s) => s.loading);
  const ids = useMemo(() => [...backlogCards.map((c) => c.id), ...Object.values(states).flatMap((s) => s.ids)], [backlogCards, states]);
  const total = matching.data ?? payload?.total;

  if (backlog.error) return <InlineError title="Stories failed to load" error={backlog.error} onRetry={() => backlog.refetch()} />;
  if (lanes.isLoading && backlog.isLoading) return <PageSkeleton statCards={0} columns={4} />;

  const promote = (c: CardT) =>
    triage.mutate({ id: c.id, action: 'promote' }, { onSuccess: () => toast.success(`Promoted ${c.id}`), onError: (e) => toast.error(`Promote failed: ${(e as Error).message}`) });
  const menuFor = (c: CardT) => [
    { label: 'Promote', icon: ArrowUpRight, disabled: triage.isPending, onClick: () => promote(c) },
    { label: 'Drop…', icon: Trash2, destructive: true, disabled: triage.isPending, onClick: () => setDropping(c) },
  ];
  const empty = !anyLoading && total === 0;

  return (
    <div className="flex flex-col gap-6">
      <SearchAndFilter
        value={filters}
        onChange={setFilters}
        onPending={setPending}
        facets={facetDefs}
        searchPlaceholder="Search title, story, id…"
        trailing={
          <>
            <SavedViewTabs
              presets={[{ id: 'lane', label: 'By lane', icon: Kanban }, { id: 'initiative', label: 'By initiative', icon: Layers }]}
              savedViews={[]}
              activePresetId={group}
              activeSavedViewId={null}
              onSelectPreset={(id) => setGroup(id as 'lane' | 'initiative')}
              onSelectSavedView={() => {}}
              onSaveView={() => {}}
              onDeleteView={() => {}}
              canSave={false}
            />
            <span className="text-xs text-muted-foreground tabular-nums" data-testid="board-total">{total === undefined ? '…' : `${total} stories`}</span>
            <Button size="sm" onClick={() => setCreating(true)} data-testid="board-new-card"><Plus />New story</Button>
          </>
        }
      />

      {empty ? (
        Object.keys(filters.facets).length || filters.q
          ? <EmptyState icon={Kanban} title="No stories match" description="Clear the search or a filter and the board fills back in." action={{ label: 'Reset filters', onClick: () => setFilters(EMPTY_SEARCH) }} />
          : <EmptyState icon={Kanban} title="No stories yet" description="Make the first one here, or from the terminal with `codeloop start` or `codeloop card propose`." action={{ label: 'New story', onClick: () => setCreating(true) }} />
      ) : (
        <div className={cn('flex flex-col gap-6 transition-opacity duration-200', pending && 'opacity-60')} aria-busy={pending}>
          {/* Backlog: proposals wait here until someone promotes or drops them. A collapsible strip,
              not a full-width block, so an empty or a long backlog never pushes the lanes down. */}
          <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2.5" data-testid="board-backlog">
            <button
              type="button"
              onClick={() => setBacklogOpen((o) => !o)}
              className="flex items-center gap-1.5 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
              aria-expanded={backlogOpen}
            >
              <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', backlogOpen && 'rotate-90')} />
              <span>Backlog · proposed</span>
              <b className="font-semibold text-foreground tabular-nums">{backlog.total}</b>
            </button>
            {backlogOpen ? (
              backlog.isLoading ? <ColumnSkeleton /> : backlog.total === 0 ? (
                <p className="py-1 pl-5 text-xs text-muted-foreground">Nothing proposed. New story above, or `codeloop card propose &lt;lane&gt; &lt;title&gt;` from the terminal.</p>
              ) : (
                <ColumnRow>
                  {backlogCards.map((c) => (
                    <div key={c.id} className="shrink-0" style={{ width: COLUMN_WIDTH }}>
                      <BoardCard card={c} onOpen={setOpen} menuItems={menuFor(c)} />
                    </div>
                  ))}
                  {backlog.hasNextPage ? (
                    <Button variant="outline" size="sm" className="h-auto shrink-0 self-stretch px-3" disabled={backlog.isFetchingNextPage} onClick={backlogMore}>
                      {backlog.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </Button>
                  ) : null}
                </ColumnRow>
              )
            ) : null}
          </section>

          {group === 'lane'
            ? orderedLanes.map((lane) => <LaneSection key={lane.id} lane={lane} base={base} showDropped={showDropped} states={states} onOpen={setOpen} onState={onState} />)
            : (
              <ColumnRow>
                {initiativeCols.map((c) => <Column key={c.key} spec={c} onOpen={setOpen} onState={onState} />)}
                {initiativeCols.length === 0 ? <p className="text-sm text-muted-foreground">No story names an initiative yet.</p> : null}
              </ColumnRow>
            )}
        </div>
      )}

      {open ? <CardDrawer id={open} onClose={() => setOpen(null)} ids={ids} onNavigate={setOpen} /> : null}
      {dropping ? <DropDialog card={dropping} onClose={() => setDropping(null)} /> : null}
      {creating ? <NewCardDialog open onOpenChange={(o) => { if (!o) setCreating(false); }} onCreated={setOpen} /> : null}
    </div>
  );
}
