'use client';

// Design contract §3: the screen's own data failed → an inline error card in place of the failed
// content, message verbatim, with Retry. Composed from ui/alert + ui/button.

import { AlertCircle, RotateCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function InlineError({ title, error, onRetry }: { title: string; error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <Alert variant="destructive" data-testid="inline-error">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCw />
            Retry
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
