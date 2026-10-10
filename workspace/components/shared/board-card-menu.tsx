'use client';

// The kebab menu on a backlog card. Its own module: the menu primitive carries the floating layer
// (positioning, focus management), which the board only needs once a card is hovered or focused.

import { MoreVertical, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MENU_BUTTON_CLASS } from '@/components/shared/board-card';

export interface BoardCardMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function BoardCardMenu({ cardId, items, defaultOpen }: { cardId: string; items: BoardCardMenuItem[]; defaultOpen?: boolean }) {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Actions for ${cardId}`} className={MENU_BUTTON_CLASS} />}>
        <MoreVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((m) => (
          <DropdownMenuItem key={m.label} disabled={m.disabled} variant={m.destructive ? 'destructive' : 'default'} onClick={m.onClick}>
            {m.icon ? <m.icon /> : null}
            {m.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
