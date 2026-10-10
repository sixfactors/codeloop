'use client';

// "New mock" has no API route: the mock is a file made from the shared template by `codeloop mock
// new <card>`, so the dialog shows that line with a copy button and where the file lands.

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CliFallback } from '@/components/shared/cli-fallback';
import type { Card as CardT } from '@/lib/types';

export function NewMockDialog({ card, open, onOpenChange }: { card: CardT; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]" data-testid="new-mock-dialog">
        <DialogHeader>
          <DialogTitle>New mock for {card.id}</DialogTitle>
          <DialogDescription>A mock is one HTML page from the shared template under docs/mocks, served at /mocks on this board once it exists. There is no board route for it yet.</DialogDescription>
        </DialogHeader>
        <CliFallback reason="Run in the project folder" command={`codeloop mock new ${card.id}`} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
