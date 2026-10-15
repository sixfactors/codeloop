'use client';

// The card's actions menu: the three things the deliverable-review guide had the founder do from
// the terminal. Ask a question → POST /api/cards/:id/questions. Split → POST /api/cards/:id/split,
// then the feature page where the siblings now sit. New mock has no route, so it shows the CLI
// line with a copy button. Edit, Move to stage, Send back to backlog and Reopen are the owner's hand
// controls (story-control-dialogs). Each dialog loads on first open.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowRightLeft, Inbox, MessageSquarePlus, MoreHorizontal, Pencil, RotateCcw, Scissors, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCanWrite } from '@/hooks/use-api';
import type { Card as CardT } from '@/lib/types';

const AskQuestionDialog = dynamic(() => import('@/components/shared/ask-question-dialog').then((m) => m.AskQuestionDialog), { ssr: false });
const SplitCardDialog = dynamic(() => import('@/components/shared/split-card-dialog').then((m) => m.SplitCardDialog), { ssr: false });
const EditStoryDialog = dynamic(() => import('@/components/shared/story-control-dialogs').then((m) => m.EditStoryDialog), { ssr: false });
const MoveStageDialog = dynamic(() => import('@/components/shared/story-control-dialogs').then((m) => m.MoveStageDialog), { ssr: false });
const BackDialog = dynamic(() => import('@/components/shared/story-control-dialogs').then((m) => m.BackDialog), { ssr: false });
const NewMockDialog = dynamic(() => import('@/components/shared/new-mock-dialog').then((m) => m.NewMockDialog), { ssr: false });

type Which = 'ask' | 'split' | 'mock' | 'edit' | 'move' | 'backlog' | 'reopen' | null;

export function CardActionMenu({ card }: { card: CardT }) {
  const [open, setOpen] = useState<Which>(null);
  const { canWrite, reason } = useCanWrite();
  const closed = card.stage === 'done' || card.stage === 'dropped';
  const proposed = card.stage === 'proposed';
  const close = (o: boolean) => { if (!o) setOpen(null); };
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
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canWrite} title={canWrite ? undefined : reason} onClick={() => setOpen('edit')} data-testid="card-action-edit"><Pencil />Edit</DropdownMenuItem>
          {!closed && !proposed ? <DropdownMenuItem disabled={!canWrite} title={canWrite ? undefined : reason} onClick={() => setOpen('move')} data-testid="card-action-move"><ArrowRightLeft />Move to stage</DropdownMenuItem> : null}
          {!proposed ? <DropdownMenuItem disabled={!canWrite} title={canWrite ? undefined : reason} onClick={() => setOpen('backlog')} data-testid="card-action-backlog"><Inbox />Send back to backlog</DropdownMenuItem> : null}
          {closed ? <DropdownMenuItem disabled={!canWrite} title={canWrite ? undefined : reason} onClick={() => setOpen('reopen')} data-testid="card-action-reopen"><RotateCcw />Reopen</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {open === 'ask' ? <AskQuestionDialog card={card} open onOpenChange={(o) => { if (!o) setOpen(null); }} /> : null}
      {open === 'split' ? <SplitCardDialog card={card} open onOpenChange={(o) => { if (!o) setOpen(null); }} /> : null}
      {open === 'mock' ? <NewMockDialog card={card} open onOpenChange={(o) => { if (!o) setOpen(null); }} /> : null}
      {open === 'edit' ? <EditStoryDialog card={card} open onOpenChange={close} /> : null}
      {open === 'move' ? <MoveStageDialog card={card} open onOpenChange={close} /> : null}
      {open === 'backlog' || open === 'reopen' ? <BackDialog card={card} kind={open} open onOpenChange={close} /> : null}
    </>
  );
}
