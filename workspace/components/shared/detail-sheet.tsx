'use client';

// Copied from chanl-admin components/shared/detail-sheet.tsx. Changes: TooltipTrigger uses
// base-ui's `render`; the sheet is full-width on phones and `sm:max-w-2xl` up (the ui/sheet default
// caps at sm:max-w-sm, so the width class is passed through); corner radius per the design contract
// (sheets 24 → rounded-l-2xl).

import { useEffect, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Small keyboard shortcut badge, styled for tooltip backgrounds. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.25rem] items-center justify-center rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1.5 py-0.5 font-mono text-[10px] leading-none">
      {children}
    </kbd>
  );
}

export interface DetailSheetNavigation {
  onPrev?: () => void;
  onNext?: () => void;
  currentIndex: number;
  totalCount: number;
}

const WIDTHS = {
  'sm:max-w-lg': 'data-[side=right]:sm:max-w-lg',
  'sm:max-w-xl': 'data-[side=right]:sm:max-w-xl',
  'sm:max-w-2xl': 'data-[side=right]:sm:max-w-2xl',
  'sm:max-w-3xl': 'data-[side=right]:sm:max-w-3xl',
} as const;

export interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  tags?: ReactNode;
  navigation?: DetailSheetNavigation;
  footerActions?: ReactNode;
  /** Sheet width from sm up. Literal keys so Tailwind can see the data-[side] variants. */
  widthClass?: keyof typeof WIDTHS;
  children: ReactNode;
  testId?: string;
}

export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  tags,
  navigation,
  footerActions,
  widthClass = 'sm:max-w-2xl',
  children,
  testId,
}: DetailSheetProps) {
  useEffect(() => {
    if (!open || !navigation) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'j' || e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        navigation.onNext?.();
      } else if (e.key === 'k' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        navigation.onPrev?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, navigation]);

  const hasPrev = !!navigation?.onPrev;
  const hasNext = !!navigation?.onNext;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn('flex h-full w-full flex-col gap-0 bg-background p-0 data-[side=right]:w-full sm:rounded-l-2xl', WIDTHS[widthClass])}
        data-testid={testId}
      >
        <SheetHeader className="shrink-0 border-b bg-background px-4 py-4 pr-12">
          <SheetTitle className="text-left" data-testid="detail-sheet-title">{title}</SheetTitle>
          {description && <SheetDescription className="text-left text-xs">{description}</SheetDescription>}
          {tags && <div className="flex flex-wrap items-center gap-2 pt-1">{tags}</div>}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

        <SheetFooter className="shrink-0 flex-row items-center justify-between border-t bg-background px-4 py-3">
          <div className="flex items-center gap-2">{footerActions}</div>
          {navigation && (
            <div className="flex items-center gap-1" data-testid="detail-sheet-nav">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button variant="outline" size="icon" onClick={navigation.onPrev} disabled={!hasPrev} data-testid="detail-sheet-prev" />
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Previous</span>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="flex items-center gap-1.5">Previous<Kbd>K</Kbd><Kbd>↑</Kbd></span>
                </TooltipContent>
              </Tooltip>
              <span className="min-w-[3.5rem] px-1 text-center text-xs text-muted-foreground tabular-nums">
                {navigation.currentIndex + 1} of {navigation.totalCount}
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button variant="outline" size="icon" onClick={navigation.onNext} disabled={!hasNext} data-testid="detail-sheet-next" />
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                  <span className="sr-only">Next</span>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="flex items-center gap-1.5">Next<Kbd>J</Kbd><Kbd>↓</Kbd></span>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
