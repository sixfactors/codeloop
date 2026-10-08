'use client';

/**
 * FieldRow + FieldSectionLabel — the ONE canonical record-detail row.
 *
 * Matches the Record UX artifact's `.frow` (c3cceac2 §03/§04):
 *   [icon] [UPPERCASE label · 112px, nowrap+truncate] [value · left, truncates] [verified/adornment/✎]
 *
 * One uniform row for EVERY profile field (built-in or custom) on BOTH the
 * customer and company records, so the two surfaces read identically — killing
 * the divergent per-field layouts (the customer rail had its own icon-led row,
 * the company rail a label/value one). This is the shared primitive both adopt.
 *
 * - `icon`      leading glyph (artifact `.fic`) — optional; both records pass one.
 * - `label`     rendered UPPERCASE (artifact `.fk`).
 * - `value`     left-aligned, truncates; empty renders a muted em-dash.
 * - `mono`      mono + tabular value (phone numbers, IDs, order #s).
 * - `href`      render the value as a link (internal Link, or external `a`).
 * - `verified`  trailing success check (e.g. a verified phone).
 * - `adornment` generic trailing node (e.g. provenance "extracted / manual" icon).
 * - `onEdit`    hover-revealed pencil → opens the record's single edit dialog.
 * Rows separate with a hairline top border (artifact `.frow + .frow`); the first
 * row in a card gets none via `first:border-t-0`.
 */

import * as React from 'react';
import Link from 'next/link';
import { Check, Pencil, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Uppercase section divider label (e.g. "Main details", "Custom attributes"). */
export function FieldSectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'px-1 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70',
        className
      )}
    >
      {children}
    </p>
  );
}

interface FieldRowProps {
  /** Leading icon (artifact `.fic`). Optional — both records pass one. */
  icon?: LucideIcon;
  label: string;
  /** Left-aligned value. Empty/nullish renders a muted em-dash. */
  value?: React.ReactNode;
  /** Placeholder shown when value is empty (defaults to an em-dash). */
  emptyHint?: React.ReactNode;
  /** Mono + tabular value (phone, IDs, order numbers). */
  mono?: boolean;
  /** When set, a hover-revealed pencil opens the record's edit dialog. */
  onEdit?: () => void;
  /** Trailing success check (e.g. a verified phone/email). */
  verified?: boolean;
  /** Generic trailing node (e.g. a provenance "extracted from call" icon). */
  adornment?: React.ReactNode;
  /** Render the value as a link. */
  href?: string;
  /** Open the href in a new tab (external). */
  external?: boolean;
  /** Leading node inside the value slot (e.g. a rep avatar for "Owner"). */
  valueLeading?: React.ReactNode;
  className?: string;
  testId?: string;
}

function isEmptyValue(v: React.ReactNode): boolean {
  return v === null || v === undefined || v === '';
}

export function FieldRow({
  icon: Icon,
  label,
  value,
  emptyHint = '—',
  mono,
  onEdit,
  verified,
  adornment,
  href,
  external,
  valueLeading,
  className,
  testId,
}: FieldRowProps) {
  const empty = isEmptyValue(value);
  const valueClass = cn(
    'flex-1 truncate text-[13px]',
    mono && 'font-mono text-xs tabular-nums text-muted-foreground',
    href && !empty && 'text-primary font-medium',
    empty && 'text-muted-foreground/60'
  );
  const valueNode = empty ? emptyHint : value;

  let rendered: React.ReactNode;
  if (href && !empty) {
    rendered = external ? (
      <a href={href} target="_blank" rel="noreferrer" className={cn(valueClass, 'hover:underline')}>
        {valueNode}
      </a>
    ) : (
      <Link href={href} className={cn(valueClass, 'hover:underline')}>
        {valueNode}
      </Link>
    );
  } else {
    rendered = <span className={valueClass}>{valueNode}</span>;
  }

  const hasTrailing = verified || adornment || onEdit;

  return (
    <div
      className={cn(
        // Fixed min-height so every row is the SAME height regardless of its
        // content — a plain value, a mono value, a verified pill, a trailing
        // adornment or an avatar all center in a uniform 36px row (no more
        // "some fields taller than others"). Value is single-line (truncate).
        'group flex min-h-9 items-center gap-2.5 border-t border-border/40 py-1.5 first:border-t-0',
        className
      )}
      data-testid={testId}
    >
      {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
      <span className="w-28 shrink-0 truncate whitespace-nowrap text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {valueLeading}
      {rendered}
      {hasTrailing ? (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
          {verified ? (
            <Check className="size-3.5 text-success" strokeWidth={2.4} aria-label="Verified" />
          ) : null}
          {adornment}
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${label}`}
              className="rounded opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
            >
              <Pencil className="size-3 text-muted-foreground" />
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
