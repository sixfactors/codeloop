'use client';

// The board's sign-in screen: username and password, built from the app's own form and dialog
// primitives. Opened from the read-only banner or any disabled write control.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLogin } from '@/hooks/use-api';

export function SignInDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const login = useLogin();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const canSubmit = user.trim().length > 0 && password.length > 0 && !login.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    setRefusal(null);
    try {
      await login.mutateAsync({ user: user.trim(), password });
      setPassword('');
      onOpenChange(false);
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : 'Sign-in failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setRefusal(null); }}>
      <DialogContent className="sm:max-w-[400px]" data-testid="sign-in-dialog">
        <DialogHeader>
          <DialogTitle>Sign in</DialogTitle>
          <DialogDescription>Sign in to answer and approve from this board.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sign-in-user">Username</Label>
            <Input id="sign-in-user" value={user} onChange={(e) => setUser(e.target.value)} autoFocus autoComplete="username" data-testid="sign-in-user" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sign-in-password">Password</Label>
            <Input id="sign-in-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="sign-in-password" />
          </div>
          {refusal ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="sign-in-refusal">{refusal}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit} data-testid="sign-in-submit">{login.isPending ? 'Signing in…' : 'Sign in'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
