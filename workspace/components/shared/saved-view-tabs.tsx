'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface SavedViewTabPreset {
  id: string;
  label: string;
  icon?: LucideIcon;
}

export interface SavedViewTabItem {
  id: string;
  name: string;
}

interface SavedViewTabsProps {
  /** Built-in presets everyone gets (All, Voice, Failed, ...). */
  presets: SavedViewTabPreset[];
  /** The user's saved views (private, from /saved-views). */
  savedViews: SavedViewTabItem[];
  /** Active built-in preset id (null when a saved view is active). */
  activePresetId: string | null;
  /** Active saved view id (null when a preset is active). */
  activeSavedViewId: string | null;
  onSelectPreset: (id: string) => void;
  onSelectSavedView: (id: string) => void;
  /** Open the "save current filters as a view" flow. */
  onSaveView: () => void;
  onDeleteView: (id: string) => void;
  /** Show the "Save view" action — only when there are unsaved criteria. Default true. */
  canSave?: boolean;
  className?: string;
}

// Mirrors components/ui/tabs.tsx (shadcn) TabsTrigger so this bespoke strip —
// which needs per-view delete + a save action the Radix primitive can't host —
// reads as the same segmented control.
const triggerBase =
  'inline-flex h-[calc(100%-1px)] shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-sm font-medium whitespace-nowrap text-foreground transition-[color,box-shadow] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0';
const triggerActive = 'bg-card shadow-sm dark:bg-input/30 dark:text-foreground dark:border-input';

export function SavedViewTabs({
  presets,
  savedViews,
  activePresetId,
  activeSavedViewId,
  onSelectPreset,
  onSelectSavedView,
  onSaveView,
  onDeleteView,
  canSave = true,
  className,
}: SavedViewTabsProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="tablist"
        aria-label="Conversation views"
        className="inline-flex h-9 items-center gap-1 overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground"
      >
        {presets.map((p) => {
          const active = activePresetId === p.id;
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`view-tab-${p.id}`}
              onClick={() => onSelectPreset(p.id)}
              className={cn(triggerBase, active && triggerActive)}
            >
              {Icon && <Icon />}
              {p.label}
            </button>
          );
        })}

        {savedViews.length > 0 && (
          <div className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
        )}

        {savedViews.map((v) => {
          const active = activeSavedViewId === v.id;
          return (
            <div key={v.id} className="group relative shrink-0">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`saved-view-tab-${v.id}`}
                onClick={() => onSelectSavedView(v.id)}
                className={cn(triggerBase, 'max-w-[180px] pr-7', active && triggerActive)}
                title={v.name}
              >
                <span className="truncate">{v.name}</span>
              </button>
              <button
                type="button"
                aria-label={`Delete view ${v.name}`}
                data-testid={`delete-view-${v.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteView(v.id);
                }}
                className={cn(
                  'absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground',
                  'opacity-0 transition-opacity hover:bg-muted hover:text-foreground',
                  'group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active && 'opacity-100'
                )}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {canSave && (
        <Button
          variant="outline"
          size="sm"
          onClick={onSaveView}
          data-testid="save-view-button"
          className="h-9 shrink-0 gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Save view
        </Button>
      )}
    </div>
  );
}
