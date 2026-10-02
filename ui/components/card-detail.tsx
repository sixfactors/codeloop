'use client';

import { useState } from 'react';
import type { LaneCard } from '@/lib/types';

interface CardDetailProps {
  card: LaneCard;
  owner: boolean;
  read?: string;
  lastCheck?: string;
  onDecide: (action: 'approve' | 'reject', note?: string) => Promise<string | null>;
  onClose: () => void;
}

export function CardDetail({ card, owner, read, lastCheck, onDecide, onClose }: CardDetailProps) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const decide = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !note.trim()) {
      setError('A rejection needs a note saying what to change.');
      return;
    }
    setBusy(true);
    setError(await onDecide(action, note.trim() || undefined));
    setBusy(false);
    setNote('');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Panel */}
      <div
        className="relative w-full max-w-md bg-card border-l border-border h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border p-4 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted font-mono">{card.id}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-in_progress/20 text-blue-300">
                {card.lane} · {card.stage}
              </span>
              {card.gate && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-review/20 text-yellow-300">
                  waiting for you · {card.gate}
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-foreground">{card.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Decision */}
          {card.gate && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Waiting for you</h3>
              <p className="text-sm text-foreground/80">
                {read ? <>Read <span className="font-mono text-accent/80">{read}</span>. </> : null}
                Last check: {lastCheck ?? 'unknown'}.
              </p>
              {owner ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What to change (required to reject)"
                    className="w-full text-sm bg-background border border-border rounded-lg p-2 text-foreground"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => decide('approve')}
                      className="text-xs px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-foreground font-medium"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => decide('reject')}
                      className="text-xs px-3 py-1.5 rounded-md bg-border text-foreground/70 font-medium"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">
                  This board is read-only. Run <span className="font-mono text-accent/80">codeloop approve {card.id}</span> in a terminal,
                  or start the board with <span className="font-mono text-accent/80">codeloop serve --owner</span>.
                </p>
              )}
              {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
            </div>
          )}

          {/* Spec */}
          {card.spec && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Spec</h3>
              <div className="text-xs font-mono text-accent/80 bg-background rounded px-2 py-1">{card.spec}/</div>
            </div>
          )}

          {/* Mock */}
          {card.mock && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Mock</h3>
              <a
                href={card.mock}
                target="_blank"
                rel="noreferrer"
                className="block text-xs font-mono text-accent/80 bg-background rounded px-2 py-1 hover:text-accent"
              >
                {card.mock}
              </a>
              <a href="/mocks/" target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-muted hover:text-foreground">
                All mocks
              </a>
            </div>
          )}

          {/* Evidence */}
          {card.evidence.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Evidence ({card.evidence.length})
              </h3>
              <div className="space-y-1">
                {card.evidence.map((path, i) => (
                  <div key={i} className="text-xs font-mono text-accent/80 bg-background rounded px-2 py-1">
                    {path}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Events */}
          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Events ({card.events.length})
            </h3>
            <ul className="space-y-1 text-sm text-foreground/80">
              {card.events.map((e, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-muted mt-0.5">-</span>
                  <span>
                    <span className="font-medium">{e.action}</span>{e.stage ? ` ${e.stage}` : ''} by {e.actor}
                    {e.note ? <span className="text-muted whitespace-pre-wrap">: {e.note}</span> : null}
                    <span className="block text-[11px] text-muted">{new Date(e.at).toLocaleString()}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Timestamps */}
          <div className="pt-2 border-t border-border">
            <div className="flex justify-between text-[11px] text-muted">
              <span>Created {new Date(card.createdAt).toLocaleDateString()}</span>
              <span>Updated {new Date(card.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
