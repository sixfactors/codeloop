'use client';

// "Drop this proposal?" with an optional note. Loaded the first time a card is dropped: the dialog
// primitive is not part of the board's first paint.

import { useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useDecide } from '@/hooks/use-api';
import { toast } from '@/lib/toast';
import type { Card as CardT } from '@/lib/types';

export function DropDialog({ card, onClose }: { card: CardT | null; onClose: () => void }) {
  const decide = useDecide();
  const [note, setNote] = useState('');
  return (
    <AlertDialog open={Boolean(card)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Drop {card?.id}?</AlertDialogTitle>
          <AlertDialogDescription>“{card?.title}” leaves the backlog. The note goes on the card history.</AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (optional)" rows={2} aria-label="Drop note" />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={decide.isPending}
            onClick={() => {
              if (!card) return;
              decide.mutate(
                { id: card.id, action: 'reject', note: note.trim() || 'dropped from the board' },
                { onSuccess: () => { toast.success(`Dropped ${card.id}`); setNote(''); onClose(); }, onError: (e) => toast.error(`Drop failed: ${(e as Error).message}`) }
              );
            }}
          >
            Drop
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
