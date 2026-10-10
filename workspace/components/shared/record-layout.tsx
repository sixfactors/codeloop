'use client';

/**
 * Shared record-surface primitives — the "one RecordLayout both pages render
 * through" from the Customer & Company Record UX spec (§05 consistency
 * contract). Customer and Company are the same layout; only the DATA differs.
 *
 *   RecordLayout   — header (via PageLayout) + [320px rail · 1fr main] grid
 *   AttributeCard  — a rail card: title (+ optional edit/settings action) over
 *                    FieldRow rows (Identity, Firmographics, Attributes …)
 *   RecordStatRow  — the 3-tile stat row that sits above the tabbed main
 *
 * The record HEADER is the shared PageLayout (back-icon · name · sub-line ·
 * badge slot · actions) — both record pages already use it, so it is the
 * RecordHeader of the contract. CompanyChip + FieldRow live in their own files.
 *
 * Company adopts these now; the Customer page adopts the same three later so the
 * two records are visibly one family (kills the divergent per-page layouts).
 */

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** header (PageLayout) + [320px rail · 1fr main]. Rail stacks its cards. */
export function RecordLayout({
  rail,
  children,
  className,
}: {
  rail: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-4 lg:grid-cols-[320px_1fr]', className)}>
      <div className="flex w-full min-w-0 flex-col gap-4">{rail}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A rail card: bordered header (icon · title · optional action) over rows. */
export function AttributeCard({
  title,
  icon: Icon,
  action,
  children,
  className,
  testId,
}: {
  title: React.ReactNode;
  icon?: LucideIcon;
  /** Right-aligned header affordance — e.g. an "Edit" / "Settings" button. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Card className={className} data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export interface RecordStat {
  label: string;
  value: React.ReactNode;
  testId?: string;
}

/** The stat row above the tabbed main (equal-height bordered tiles); 2-up on phones. */
export function RecordStatRow({
  stats,
  className,
  testId,
}: {
  stats: RecordStat[];
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)} data-testid={testId}>
      {stats.map((s, i) => (
        <div key={i} className="rounded-xl border bg-card p-4" data-testid={s.testId}>
          {/* div, not p: value can be a Skeleton (block element) while its query loads, and a div inside a p gets
              auto-closed by the browser's HTML parser, producing a different DOM than React's tree hydrates against. */}
          <div className="text-xl font-semibold tabular-nums">{s.value}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
