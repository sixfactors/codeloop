'use client';

// Copied from chanl-admin components/shared/empty-state.tsx. Only change: Button's link form uses
// base-ui's `render` prop instead of Radix `asChild`.

import { type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  testId?: string;
  /** Tighter vertical padding for an empty state inside a card or column. */
  compact?: boolean;
}

function ActionButton({ action, variant = 'default' }: { action: EmptyStateAction; variant?: 'default' | 'outline' }) {
  if (action.href) {
    return (
      <Button variant={variant} size="sm" nativeButton={false} render={<Link href={action.href} />}>
        {action.label}
      </Button>
    );
  }
  return (
    <Button variant={variant} size="sm" onClick={action.onClick} disabled={action.disabled}>
      {action.label}
    </Button>
  );
}

export function EmptyState({ icon: Icon, title, description, action, secondaryAction, testId, compact }: EmptyStateProps) {
  return (
    <div
      className={compact ? 'flex w-full min-w-0 flex-col items-center justify-center px-4 py-8' : 'flex w-full min-w-0 flex-col items-center justify-center px-8 py-16'}
      data-testid={testId ?? 'empty-state'}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-center text-lg font-semibold wrap-break-word">{title}</h3>
      <p className="mb-5 max-w-sm text-center text-sm whitespace-normal text-muted-foreground wrap-break-word">{description}</p>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && <ActionButton action={action} />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
        </div>
      )}
    </div>
  );
}
