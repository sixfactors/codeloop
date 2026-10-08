'use client';

import type { ReactNode } from 'react';
import type { LaneCard as LaneCardType } from '@/lib/types';

interface LaneCardProps {
  card: LaneCardType;
  onClick: () => void;
  /** Rendered under the title; the backlog column passes its Promote and Drop buttons here. */
  actions?: ReactNode;
}

export function CardBadges({ card }: { card: LaneCardType }) {
  const sizing = card.points !== undefined ? `${card.points} pt` : card.size;
  if (!sizing && !card.bet && !card.openQuestions) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {sizing && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-border text-foreground/80">{sizing}</span>
      )}
      {card.bet && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-planned/20 text-purple-300 max-w-[160px] truncate" title={card.bet}>
          {card.bet}
        </span>
      )}
      {(card.openQuestions ?? 0) > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-review/20 text-yellow-300" title="open questions">
          ? {card.openQuestions}
        </span>
      )}
    </div>
  );
}

export function LaneCard({ card, onClick, actions }: LaneCardProps) {
  const last = card.events[card.events.length - 1];

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:bg-card-hover transition-colors"
    >
      <span className="text-xs text-muted font-mono">{card.id}</span>
      <p className="text-sm font-medium text-foreground leading-snug">{card.title}</p>

      <CardBadges card={card} />

      {card.gate && card.stage !== 'proposed' && (
        <div className="flex flex-wrap gap-1 mt-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-review/20 text-yellow-300">
            waiting for you · {card.gate}
          </span>
        </div>
      )}

      {actions && (
        <div className="mt-2" onClick={e => e.stopPropagation()}>
          {actions}
        </div>
      )}

      {last && (
        <p className="mt-2 text-[10px] text-muted">
          {last.action}{last.stage ? ` ${last.stage}` : ''} · {new Date(last.at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
