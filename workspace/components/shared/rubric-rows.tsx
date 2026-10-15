'use client';

// The current stage's rubric beside Approve: each row's criterion, how it is judged, and whether it
// holds (pass), does not (fail, with the finding) or waits for the person at the gate (pending).
// GET /api/cards/:id/full judges the rows; this draws them in the owner's words. A row the builder
// has not attested yet comes back as a fail whose finding is an instruction to the builder ("pending:
// scaffolded in ...; replace `- I2 pending:` with ..."): it reads "not shown yet" here, with the
// instruction behind "For the builder".

import { CheckCircle2, ChevronRight, CircleDashed, Hand, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { cn } from '@/lib/utils';
import type { RubricRow, StageRubric } from '@/lib/types';

type Shown = 'pass' | 'fail' | 'not-shown' | 'yours';

const ICON = { pass: CheckCircle2, fail: XCircle, 'not-shown': CircleDashed, yours: Hand } as const;
const TONE: Record<Shown, string> = { pass: 'text-success', fail: 'text-destructive', 'not-shown': 'text-muted-foreground', yours: 'text-warning' };
const OWNER_WORDS: Record<Exclude<Shown, 'pass' | 'fail'>, string> = { 'not-shown': 'Not shown yet', yours: 'Yours to judge' };

/** What the owner sees for a row: the builder's unattested scaffold is "not shown yet"; a row judged at the gate is "yours". */
function shownAs(r: RubricRow): Shown {
  if (r.status === 'pending') return 'yours';
  if (r.status === 'fail' && /^pending:/.test(r.finding ?? '')) return 'not-shown';
  return r.status;
}

export function RubricRows({ rubric }: { rubric: StageRubric }) {
  const rows = rubric.rows.map((r) => ({ r, shown: shownAs(r) }));
  const count = (s: Shown) => rows.filter((x) => x.shown === s).length;
  const summary = [count('fail') ? `${count('fail')} failing` : 'nothing failing', count('not-shown') ? `${count('not-shown')} not shown yet` : '', count('yours') ? `${count('yours')} for you to judge` : ''].filter(Boolean).join(', ');
  return (
    <section className="flex flex-col gap-1.5" data-testid="rubric" data-stage={rubric.stage}>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase">
        Rubric for {rubric.stage}
        <span className="ml-2 font-normal normal-case">{summary}</span>
      </h4>
      <ItemGroup className="gap-1">
        {rows.map(({ r, shown }) => {
          const Icon = ICON[shown];
          return (
            <Item key={r.id} variant="outline" size="sm" className="items-start py-1.5" data-testid={`rubric-row-${r.id}`} data-status={r.status} data-shown={shown}>
              <ItemMedia><Icon className={cn('size-4', TONE[shown])} aria-label={shown} /></ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="flex w-full flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-mono text-muted-foreground">{r.id}</span>
                  <span className="min-w-0 break-words">{r.criterion}</span>
                  <Badge variant="outline" className="ml-auto rounded-full text-[10px]">{r.judged}</Badge>
                </ItemTitle>
                {shown === 'fail' && r.finding ? <ItemDescription className="line-clamp-none text-xs break-words text-destructive">{r.finding}</ItemDescription> : null}
                {shown === 'not-shown' || shown === 'yours' ? <ItemDescription className="line-clamp-none text-xs" data-testid="rubric-owner-words">{OWNER_WORDS[shown]}</ItemDescription> : null}
                {shown === 'not-shown' && r.finding ? (
                  <Collapsible>
                    <CollapsibleTrigger className="group flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" data-testid="rubric-for-builder">
                      <ChevronRight className="size-3 transition-transform group-data-[panel-open]:rotate-90" />For the builder
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-1 font-mono text-[11px] break-all text-muted-foreground">{r.finding}</CollapsibleContent>
                  </Collapsible>
                ) : null}
              </ItemContent>
            </Item>
          );
        })}
      </ItemGroup>
    </section>
  );
}
