'use client';

// What a screen shows when the board has no route for an action yet: the CLI line that does it,
// with a copy button. One component so every fallback reads the same.

import { Terminal } from 'lucide-react';
import { CopyButton } from '@/components/shared/copy-button';

export function CliFallback({ reason, command, testId = 'cli-fallback' }: { reason: string; command: string; testId?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3" data-testid={testId}>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Terminal className="size-3.5" aria-hidden />{reason}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-background px-2 py-1.5 font-mono text-xs whitespace-nowrap" data-testid={`${testId}-command`}>{command}</code>
        <CopyButton text={command} variant="outline" size="sm" />
      </div>
    </div>
  );
}
