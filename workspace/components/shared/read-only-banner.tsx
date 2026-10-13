'use client';

// Shown in the app shell above every page when this browser cannot write: not signed in (the
// common case), or the server itself was started read-only (--read-only / no --owner). Every
// write control reads the same session state (useCanWrite) and shows the same text as its
// tooltip, and opens this same sign-in dialog.

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useCanWrite } from '@/hooks/use-api';
import { SignInDialog } from '@/components/shared/sign-in-dialog';

export function ReadOnlyBanner() {
  const { canWrite, needsSignIn, reason, isLoading } = useCanWrite();
  const [signingIn, setSigningIn] = useState(false);
  if (isLoading || canWrite) return null;
  return (
    <>
      {/* Padding on a wrapper, not margin on the full-width alert: mx-5 on a w-full box pushed it past the right edge. */}
      <div className="px-5 pt-3">
      <Alert className="border-warning/50" data-testid="read-only-banner">
        <Lock className="text-warning-foreground dark:text-warning" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{reason}</span>
          {needsSignIn ? <Button size="sm" variant="outline" onClick={() => setSigningIn(true)} data-testid="read-only-banner-sign-in">Sign in</Button> : null}
        </AlertDescription>
      </Alert>
      </div>
      {needsSignIn ? <SignInDialog open={signingIn} onOpenChange={setSigningIn} /> : null}
    </>
  );
}
