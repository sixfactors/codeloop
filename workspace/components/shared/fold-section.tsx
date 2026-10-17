'use client';

// A folded section of the story page: a heading with a count that stays visible while closed, and
// a failure shown on the heading so folding never hides a failing check (c-311).

import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { FoldHeading } from '@/lib/story-folds';

export function FoldSection({ title, heading, icon: Icon, defaultOpen, testId, children }: { title: string; heading: FoldHeading; icon: LucideIcon; defaultOpen?: boolean; testId?: string; children: React.ReactNode }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-lg border bg-card" data-testid={testId} data-failing={heading.failing || undefined}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" aria-hidden />
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 truncate font-medium">{title}</span>
        <Badge variant="outline" className={cn('ml-auto shrink-0 rounded-full', heading.failing && 'border-destructive/40 text-destructive')} data-testid={testId ? `${testId}-count` : undefined}>{heading.count}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex min-w-0 flex-col gap-3 border-t px-3 py-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
