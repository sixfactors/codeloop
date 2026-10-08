'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { useCards } from '@/hooks/use-cards';
import { useFilters, matches } from '@/hooks/use-filters';
import { LaneCard } from './lane-card';
import { CardDetail } from './card-detail';
import { FilterBar } from './filter-bar';
import { cn } from '@/lib/cn';
import type { LaneCard as LaneCardType, LaneStage } from '@/lib/types';

const PROPOSED = 'proposed';
const DROPPED = 'dropped';
const DONE = 'done';
const NO_BET = '(no bet)';

interface ColumnSpec {
  id: string;
  title: string;
  dot: string;
  hint?: string;
  cards: LaneCardType[];
}

export function CardsView({ nav }: { nav?: ReactNode }) {
  const { data, connected, decide, questions, answer } = useCards();
  const { filters, set, toggle, clear, options, active } = useFilters(data?.cards);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => (data?.cards ?? []).filter(c => matches(c, filters)), [data, filters]);

  // Stage order across every lane, so a column list or a by-bet sort agrees with the lanes' own order.
  const stageOrder = useMemo(() => {
    const order: string[] = [PROPOSED];
    for (const lane of data?.lanes ?? []) for (const s of lane.stages) if (!order.includes(s.id)) order.push(s.id);
    order.push(DONE, DROPPED);
    return order;
  }, [data]);

  const columns = useMemo<ColumnSpec[]>(() => {
    if (!data) return [];
    const stageIndex = (stage: string) => { const i = stageOrder.indexOf(stage); return i === -1 ? stageOrder.length : i; };

    if (filters.groupBy === 'bet') {
      const bets = new Map<string, LaneCardType[]>();
      for (const c of visible) {
        const key = c.bet ?? NO_BET;
        bets.set(key, [...(bets.get(key) ?? []), c]);
      }
      return [...bets.keys()]
        .sort((a, b) => (a === NO_BET ? 1 : b === NO_BET ? -1 : a.localeCompare(b)))
        .map(bet => ({
          id: bet,
          title: bet,
          dot: 'bg-planned',
          cards: (bets.get(bet) ?? []).sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage)),
        }));
    }

    // By lane: a backlog for proposals, then the stages of the lanes in view, then done, then dropped when shown.
    // With no lane picked, lanes that hold no card in view stay off the board so their empty stages do not pad it.
    const lanes = filters.lane.length > 0
      ? data.lanes.filter(l => filters.lane.includes(l.id))
      : data.lanes.filter(l => visible.some(c => c.lane === l.id && c.stage !== PROPOSED && c.stage !== DROPPED));
    const stages: { id: string; def?: LaneStage }[] = [];
    for (const lane of lanes) for (const s of lane.stages) if (!stages.some(x => x.id === s.id)) stages.push({ id: s.id, def: s });
    const byStage = (stage: string) => visible.filter(c => c.stage === stage);
    const out: ColumnSpec[] = [
      { id: PROPOSED, title: 'Backlog', dot: 'bg-backlog', hint: 'proposed', cards: byStage(PROPOSED) },
      ...stages.map(s => ({
        id: s.id,
        title: s.id,
        dot: s.def?.gate ? 'bg-review' : 'bg-in_progress',
        hint: s.def?.gate ? `gate ${s.def.gate.name}${s.def.gate.outward ? ' · public step' : ''}` : undefined,
        cards: byStage(s.id),
      })),
      { id: DONE, title: DONE, dot: 'bg-done', cards: byStage(DONE) },
    ];
    if (filters.showDropped) out.push({ id: DROPPED, title: DROPPED, dot: 'bg-muted', cards: byStage(DROPPED) });
    return out;
  }, [data, visible, filters.groupBy, filters.lane, filters.showDropped, stageOrder]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted">Connecting to board...</p>
        </div>
      </div>
    );
  }

  const selected = data.cards.find(c => c.id === selectedId);
  const waiting = data.inbox.needs_you.find(n => n.id === selectedId);

  const act = async (card: LaneCardType, action: 'approve' | 'reject') => {
    let note: string | undefined;
    if (action === 'reject') {
      const typed = window.prompt(`Drop ${card.id}: why?`);
      if (typed === null) return;
      note = typed.trim();
    }
    setBusyId(card.id);
    const err = await decide(card.id, action, note);
    setBusyId(null);
    setActionErrors(prev => {
      const next = { ...prev };
      if (err) next[card.id] = err; else delete next[card.id];
      return next;
    });
  };

  const proposalActions = (card: LaneCardType) => {
    if (card.stage !== PROPOSED) return undefined;
    if (!data.owner) return <p className="text-[10px] text-muted">read-only · promote with <span className="font-mono">codeloop approve {card.id}</span></p>;
    const busy = busyId === card.id;
    return (
      <div>
        <div className="flex gap-1.5">
          <button
            disabled={busy}
            onClick={() => act(card, 'approve')}
            className="text-[11px] px-2 py-1 rounded-md bg-accent hover:bg-accent-hover text-foreground font-medium disabled:opacity-50"
          >
            Promote
          </button>
          <button
            disabled={busy}
            onClick={() => act(card, 'reject')}
            className="text-[11px] px-2 py-1 rounded-md bg-border text-foreground/70 font-medium disabled:opacity-50"
          >
            Drop
          </button>
        </div>
        {actionErrors[card.id] && <p className="mt-1 text-[11px] text-red-300">{actionErrors[card.id]}</p>}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-base font-semibold text-foreground whitespace-nowrap">Codeloop Board</h1>
          {nav}
          <span className="text-xs text-muted truncate hidden sm:inline">{data.inbox.summary}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className={cn(
            'w-2 h-2 rounded-full',
            connected ? 'bg-done' : 'bg-review animate-pulse',
          )} />
          <span className="text-xs text-muted">{connected ? 'Live' : 'Reconnecting...'}</span>
        </div>
      </header>

      <FilterBar
        filters={filters}
        options={options}
        active={active}
        shown={visible.length}
        total={data.cards.length}
        onToggle={toggle}
        onSet={set}
        onClear={clear}
      />

      {/* Columns */}
      <main className="flex-1 overflow-x-auto p-3 sm:p-4">
        {data.lanes.length === 0 && data.cards.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <h2 className="text-lg font-medium text-foreground/80 mb-2">No lanes yet</h2>
              <p className="text-sm text-muted">
                Run <code className="text-accent/80 bg-card px-1 rounded">codeloop init</code>, then{' '}
                <code className="text-accent/80 bg-card px-1 rounded">codeloop start &quot;your feature&quot;</code>.
              </p>
            </div>
          </div>
        ) : columns.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted">
              No cards match.{' '}
              <button onClick={clear} className="underline underline-offset-2 hover:text-foreground">Clear filters</button>
            </p>
          </div>
        ) : (
          <div className="flex gap-3 sm:gap-4 h-full">
            {columns.map(col => (
              <div key={col.id} className="flex flex-col shrink-0 w-[min(85vw,280px)] bg-background rounded-xl border border-border">
                <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', col.dot)} />
                  <h3 className="text-sm font-medium text-foreground truncate" title={col.title}>{col.title}</h3>
                  {col.hint && <span className="text-[10px] text-muted truncate">{col.hint}</span>}
                  <span className="text-xs text-muted ml-auto">{col.cards.length}</span>
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px]">
                  {col.cards.map(card => (
                    <LaneCard key={card.id} card={card} onClick={() => setSelectedId(card.id)} actions={proposalActions(card)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Detail panel */}
      {selected && (
        <CardDetail
          card={selected}
          owner={data.owner}
          read={waiting?.read}
          lastCheck={waiting?.last_check}
          onDecide={(action, note) => decide(selected.id, action, note)}
          onQuestions={questions}
          onAnswer={answer}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
