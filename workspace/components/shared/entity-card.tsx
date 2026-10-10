'use client';

// Copied from chanl-admin components/shared/entity-card.tsx. Changes: the platform-coloured
// AppAvatar is replaced by a plain icon medallion (no platform prop); the dropdown menu takes an
// optional list of extra items so a card's secondary actions live in the menu, not on the body;
// DropdownMenuTrigger uses base-ui's `render`. Padding is the card token (16px).

import React from 'react';
import { Button } from '@/components/ui/button';
import { Edit, MoreVertical, Trash2, type LucideIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface EntityCardMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface EntityCardProps {
  name: string;
  description?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  menuItems?: EntityCardMenuItem[];
  selected?: boolean;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  minHeight?: number;
  'data-testid'?: string;
}

export function EntityCard({
  name,
  description,
  icon: Icon,
  onClick,
  onEdit,
  onRemove,
  removeLabel = 'Delete',
  menuItems = [],
  selected = false,
  children,
  footer,
  className,
  minHeight = 0,
  'data-testid': testId,
}: EntityCardProps) {
  const isClickable = !!onClick || !!onEdit;
  const hasMenu = !!onRemove || menuItems.length > 0;

  const handleCardClick = () => {
    if (onClick) onClick();
    else if (onEdit) onEdit();
  };

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col rounded-xl border bg-card p-4 shadow-sm transition hover:shadow-md',
        isClickable && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'ring-2 ring-primary ring-offset-2',
        className
      )}
      style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
      onClick={isClickable ? handleCardClick : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); } } : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      data-testid={testId}
    >
      {hasMenu && (
        <div className="absolute top-3 right-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Open menu"
                />
              }
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {menuItems.map((m) => (
                <DropdownMenuItem key={m.label} disabled={m.disabled} variant={m.destructive ? 'destructive' : 'default'} onClick={m.onClick}>
                  {m.icon ? <m.icon /> : null}
                  {m.label}
                </DropdownMenuItem>
              ))}
              {onRemove && (
                <DropdownMenuItem variant="destructive" onClick={onRemove}>
                  <Trash2 />
                  {removeLabel}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="flex flex-1 items-start gap-3">
        {Icon ? (
          <div className="flex size-10 shrink-0 grow-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon className="size-5" />
          </div>
        ) : null}
        <div className={cn('min-w-0 flex-1', hasMenu && 'pr-8')}>
          <div className="mb-1 text-base leading-tight font-medium wrap-break-word">{name}</div>
          {description && <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{description}</p>}
          {children}
        </div>
      </div>

      {footer !== undefined ? (
        footer
      ) : onEdit ? (
        <div className="mt-auto border-t pt-3">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Edit className="mr-1 h-3 w-3" />
              Edit
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
