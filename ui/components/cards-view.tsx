'use client';

import { useState, type ReactNode } from 'react';
import { useCards } from '@/hooks/use-cards';
import { LaneCard } from './lane-card';
import { CardDetail } from './card-detail';
import { cn } from '@/lib/cn';

export function CardsView({ nav }: { nav?: ReactNode }) {
  const { data, connected, decide } = useCards();
  const [laneId, setLaneId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  // Default to the first lane that has cards, so the screen is not empty on arrival.
  const lane = data.lanes.find(l => l.id === laneId)
    ?? data.lanes.find(l => data.cards.some(c => c.lane === l.id))
    ?? data.lanes[0];
  const cards = data.cards.filter(c => c.lane === lane?.id);
  // Proposals wait outside the lane's stages, so they get a column of their own when there are any.
  const columns = lane ? [...(cards.some(c => c.stage === 'proposed') ? ['proposed'] : []), ...lane.stages.map(s => s.id), 'done'] : [];
  const selected = data.cards.find(c => c.id === selectedId);
  const waiting = data.inbox.needs_you.find(n => n.id === selectedId);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-foreground">Codeloop Board</h1>
          {nav}
          <span className="text-xs text-muted">{data.inbox.summary}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-2 h-2 rounded-full',
            connected ? 'bg-done' : 'bg-review animate-pulse',
          )} />
          <span className="text-xs text-muted">{connected ? 'Live' : 'Reconnecting...'}</span>
        </div>
      </header>

      {/* Lane switcher */}
      <div className="flex items-center gap-1.5 px-6 py-2 border-b border-border">
        {data.lanes.map(l => {
          const count = data.cards.filter(c => c.lane === l.id).length;
          return (
            <button
              key={l.id}
              onClick={() => setLaneId(l.id)}
              className={cn(
                'text-xs px-2 py-1 rounded-md',
                l.id === lane?.id ? 'bg-border text-foreground' : 'text-muted hover:text-foreground',
              )}
            >
              {l.id}{count > 0 ? ` ${count}` : ''}
            </button>
          );
        })}
      </div>

      {/* Columns */}
      <main className="flex-1 overflow-x-auto p-4">
        {!lane ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <h2 className="text-lg font-medium text-foreground/80 mb-2">No lanes yet</h2>
              <p className="text-sm text-muted">
                Run <code className="text-accent/80 bg-card px-1 rounded">codeloop init</code>, then{' '}
                <code className="text-accent/80 bg-card px-1 rounded">codeloop start &quot;your feature&quot;</code>.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 h-full">
            {columns.map(stage => {
              const mine = cards.filter(c => c.stage === stage);
              const gate = lane.stages.find(s => s.id === stage)?.gate;
              return (
                <div key={stage} className="flex flex-col min-w-[280px] w-[280px] bg-background rounded-xl border border-border">
                  <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
                    <div className={cn('w-2 h-2 rounded-full', stage === 'done' ? 'bg-done' : gate ? 'bg-review' : 'bg-in_progress')} />
                    <h3 className="text-sm font-medium text-foreground">{stage}</h3>
                    {gate && <span className="text-[10px] text-muted">gate {gate.name}{gate.outward ? ' · public step' : ''}</span>}
                    <span className="text-xs text-muted ml-auto">{mine.length}</span>
                  </div>
                  <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px]">
                    {mine.map(card => (
                      <LaneCard key={card.id} card={card} onClick={() => setSelectedId(card.id)} />
                    ))}
                  </div>
                </div>
              );
            })}
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
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
