'use client';

// Copied from pm-board src/components/board/board-view.tsx (BoardCard) and card-bits.tsx
// (STAGE_STYLE). Changes: the raw Tailwind hues become the app's semantic tones (violet = an agent
// acted, green = done, amber = waiting on a person, red = stuck); the owner / PR / RICE row becomes
// one truncating chip row of MetaChips; secondary actions arrive through `actions` and reveal on
// hover (entity-card pattern: a kebab menu in the top-right corner) instead of sitting in the body.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { HelpCircle, Image as ImageIcon, MoreVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BoardCardMenuItem } from '@/components/shared/board-card-menu';
import { BandChip } from '@/components/shared/band-chip';
import { MetaChip } from '@/components/shared/meta-chip';
import { ShortIdCell } from '@/components/shared/short-id-cell';
import { isGateWaiting, isProposed, isShipped } from '@/lib/cards';
import type { Card as CardT } from '@/lib/types';
import { cn } from '@/lib/utils';

export type CardTone = 'waiting' | 'agent' | 'done' | 'stuck' | 'none';

/** The kebab button: hidden until the card is hovered or focused, or while its menu is open. */
export const MENU_BUTTON_CLASS = 'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100';

// The menu primitive mounts on the first hover or focus of a card that has actions; until then a
// look-alike button stands in, and a click on it opens the real menu as it arrives. Only the type
// is imported from the menu module: a value import would put the floating layer in the board's bundle.
const BoardCardMenu = dynamic(() => import('@/components/shared/board-card-menu').then((m) => m.BoardCardMenu), { ssr: false });

export const isStuck = (c: CardT) => Object.values(c.retries ?? {}).some((n) => n >= 3);

/** One idea per hue. A proposal is neutral until someone touches it. */
export function cardTone(c: CardT): CardTone {
  if (isStuck(c)) return 'stuck';
  if (isShipped(c)) return 'done';
  if (isGateWaiting(c)) return 'waiting';
  if (isProposed(c)) return 'none';
  const last = c.events?.at(-1);
  if (last && !last.human && last.action === 'advance') return 'agent';
  return 'none';
}

export const TONE_STYLE: Record<CardTone, { border: string; badge: string; label: string }> = {
  waiting: { border: 'border-l-warning', badge: 'bg-warning/15 text-warning-foreground dark:text-warning', label: 'Waiting' },
  agent: { border: 'border-l-ai', badge: 'bg-ai/15 text-ai', label: 'Agent' },
  done: { border: 'border-l-success', badge: 'bg-success/15 text-success', label: 'Done' },
  stuck: { border: 'border-l-destructive', badge: 'bg-destructive/15 text-destructive', label: 'Stuck' },
  none: { border: 'border-l-border', badge: '', label: '' },
};

export function ToneBadge({ card, className }: { card: CardT; className?: string }) {
  const tone = cardTone(card);
  if (tone === 'none') return null;
  const text = tone === 'waiting' ? (card.gate ?? card.awaiting ?? 'gate') : TONE_STYLE[tone].label;
  return (
    <Badge variant="secondary" className={cn('max-w-[10rem] truncate rounded-full border-transparent', TONE_STYLE[tone].badge, className)} title={text}>
      {text}
    </Badge>
  );
}

export function BoardCard({
  card,
  onOpen,
  menuItems = [],
  className,
}: {
  card: CardT;
  onOpen: (id: string) => void;
  /** Hover-revealed kebab menu, top-right (Promote / Drop on a backlog card). */
  menuItems?: BoardCardMenuItem[];
  className?: string;
}) {
  const tone = cardTone(card);
  const [menu, setMenu] = useState<'idle' | 'armed' | 'open'>('idle');
  const arm = () => setMenu((m) => (m === 'idle' ? 'armed' : m));
  const sizing = card.points !== undefined ? `${card.points} pt` : card.size;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${card.id} ${card.title}`}
      onClick={() => onOpen(card.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(card.id); } }}
      data-testid={`board-card-${card.id}`}
      onPointerEnter={menuItems.length ? arm : undefined}
      onFocus={menuItems.length ? arm : undefined}
      className={cn(
        'group relative block w-full cursor-pointer rounded-lg border border-l-[3px] bg-card p-3 text-left text-sm shadow-xs transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        TONE_STYLE[tone].border,
        className
      )}
    >
      {menuItems.length > 0 ? (
        <span className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {menu === 'idle' ? (
            <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${card.id}`} aria-haspopup="menu" className={MENU_BUTTON_CLASS} onClick={() => setMenu('open')}>
              <MoreVertical />
            </Button>
          ) : (
            <BoardCardMenu cardId={card.id} items={menuItems} defaultOpen={menu === 'open'} />
          )}
        </span>
      ) : null}
      <span className={cn('block leading-snug', menuItems.length > 0 && 'pr-6')}>{card.title}</span>
      <span className="mt-1.5 flex items-center gap-1.5">
        <span onClick={(e) => e.stopPropagation()}><ShortIdCell id={card.id} /></span>
        <BandChip band={card.band} score={card.score} />
        <ToneBadge card={card} className="ml-auto" />
      </span>
      {sizing || card.feature || card.initiative || card.persona || card.openQuestions || card.mock ? (
        <span className="mt-1.5 flex w-0 min-w-full items-center gap-1 overflow-hidden whitespace-nowrap">
          {sizing ? <MetaChip label="Size" value={sizing} className="shrink-0" /> : null}
          {card.persona ? <MetaChip label="For" value={card.persona} className="shrink-0" /> : null}
          {/* The feature names the card's place in the tree; the initiative stands in until a card names one. */}
          {card.feature ? <MetaChip label="Feature" value={card.feature} className="min-w-0 [&>span:last-child]:truncate" /> : card.initiative ? <MetaChip label="Initiative" value={card.initiative} className="min-w-0 [&>span:last-child]:truncate" /> : null}
          {card.openQuestions ? (
            <Badge variant="secondary" className="shrink-0 gap-1 rounded-full" title={`${card.openQuestions} open questions`}>
              <HelpCircle className="size-3" />{card.openQuestions}
            </Badge>
          ) : null}
          {card.mock ? <Badge variant="outline" className="shrink-0 rounded-full px-1.5" title="Has a mock" aria-label="Has a mock"><ImageIcon className="size-3" /></Badge> : null}
        </span>
      ) : null}
    </div>
  );
}

/** pm-board's sticky column header: uppercase label, tone-coloured underline, bold count. */
export function ColumnHeader({ label, count, tone = 'none', meta }: { label: string; count: number; tone?: CardTone; meta?: React.ReactNode }) {
  const underline = { waiting: 'border-warning', agent: 'border-ai', done: 'border-success', stuck: 'border-destructive', none: 'border-border' }[tone];
  return (
    <div className={cn('flex items-center gap-1.5 border-b-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase', underline)}>
      <span className="truncate">{label}</span>
      <b className="font-semibold text-foreground tabular-nums">{count}</b>
      {meta ? <span className="ml-auto normal-case tracking-normal">{meta}</span> : null}
    </div>
  );
}
