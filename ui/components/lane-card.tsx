'use client';

import type { LaneCard as LaneCardType } from '@/lib/types';

interface LaneCardProps {
  card: LaneCardType;
  onClick: () => void;
}

export function LaneCard({ card, onClick }: LaneCardProps) {
  const last = card.events[card.events.length - 1];

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:bg-card-hover transition-colors"
    >
      <span className="text-xs text-muted font-mono">{card.id}</span>
      <p className="text-sm font-medium text-foreground leading-snug">{card.title}</p>

      {card.gate && (
        <div className="flex flex-wrap gap-1 mt-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-review/20 text-yellow-300">
            waiting for you · {card.gate}
          </span>
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
