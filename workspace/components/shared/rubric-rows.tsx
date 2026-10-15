'use client';

// The current stage's rubric beside Approve: each row's criterion, how it is judged, and whether it
// holds (pass), does not (fail, with the finding) or waits for the person at the gate (pending).
// GET /api/cards/:id/full judges the rows; this draws them.

import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { cn } from '@/lib/utils';
import type { RubricRow, StageRubric } from '@/lib/types';

const ICON = { pass: CheckCircle2, fail: XCircle, pending: CircleDashed } as const;
const TONE: Record<RubricRow['status'], string> = { pass: 'text-success', fail: 'text-destructive', pending: 'text-muted-foreground' };

export function RubricRows({ rubric }: { rubric: StageRubric }) {
  const failing = rubric.rows.filter((r) => r.status === 'fail').length;
  const pending = rubric.rows.filter((r) => r.status === 'pending').length;
  return (
    <section className="flex flex-col gap-1.5" data-testid="rubric" data-stage={rubric.stage}>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase">
        Rubric for {rubric.stage}
        <span className="ml-2 font-normal normal-case">{failing ? `${failing} failing` : 'nothing failing'}{pending ? `, ${pending} for you to judge` : ''}</span>
      </h4>
      <ItemGroup className="gap-1">
        {rubric.rows.map((r) => {
          const Icon = ICON[r.status];
          return (
            <Item key={r.id} variant="outline" size="sm" className="items-start py-1.5" data-testid={`rubric-row-${r.id}`} data-status={r.status}>
              <ItemMedia><Icon className={cn('size-4', TONE[r.status])} aria-label={r.status} /></ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="flex w-full flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-mono text-muted-foreground">{r.id}</span>
                  <span className="min-w-0 break-words">{r.criterion}</span>
                  <Badge variant="outline" className="ml-auto rounded-full text-[10px]">{r.judged}</Badge>
                </ItemTitle>
                {r.finding ? <ItemDescription className={cn('line-clamp-none text-xs break-words', r.status === 'fail' && 'text-destructive')}>{r.finding}</ItemDescription> : null}
              </ItemContent>
            </Item>
          );
        })}
      </ItemGroup>
    </section>
  );
}
