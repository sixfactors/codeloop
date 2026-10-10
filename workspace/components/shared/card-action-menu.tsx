'use client';

// The card's actions menu: the three things the deliverable-review guide had the founder do from
// the terminal. Ask a question → POST /api/cards/:id/questions. Split → POST /api/cards/:id/split,
// then the feature page where the siblings now sit. New mock has no route, so it shows the CLI
// line with a copy button. Each dialog loads on first open.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { MessageSquarePlus, MoreHorizontal, Scissors, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Card as CardT } from '@/lib/types';

const AskQuestionDialog = dynamic(() => import('@/components/shared/ask-question-dialog').then((m) => m.AskQuestionDialog), { ssr: false });
const SplitCardDialog = dynamic(() => import('@/components/shared/split-card-dialog').then((m) => m.SplitCardDialog), { ssr: false });
const NewMockDialog = dynamic(() => import('@/components/shared/new-mock-dialog').then((m) => m.NewMockDialog), { ssr: false });

type Which = 'ask' | 'split' | 'mock' | null;

export function CardActionMenu({ card }: { card: CardT }) {
  const [open, setOpen] = useState<Which>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" variant="outline" aria-label={`More actions for ${card.id}`} data-testid="card-actions-menu" />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen('ask')} data-testid="card-action-ask"><MessageSquarePlus />Ask a question</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen('split')} data-testid="card-action-split"><Scissors />Split</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen('mock')} data-testid="card-action-mock"><Sparkles />New mock</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {open === 'ask' ? <AskQuestionDialog card={card} open onOpenChange={(o) => { if (!o) setOpen(null); }} /> : null}
      {open === 'split' ? <SplitCardDialog card={card} open onOpenChange={(o) => { if (!o) setOpen(null); }} /> : null}
      {open === 'mock' ? <NewMockDialog card={card} open onOpenChange={(o) => { if (!o) setOpen(null); }} /> : null}
    </>
  );
}
