'use client';

// What the story has to do and what has landed: tasks.md's tasks with their ticks and layer, and
// the commits carrying the story's trailer, newest first, each merged into the trunk or held on a
// branch. Both, and the done tally, come from GET /api/cards/:id/full; nothing is counted here.

import { CheckSquare, GitCommit, GitMerge, GitBranch, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { AttributeCard } from '@/components/shared/record-layout';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';
import type { StoryCommit, Task } from '@/lib/types';

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function Tasks({ tasks, counts }: { tasks: Task[]; counts?: { done: number; total: number } }) {
  if (!tasks.length) return <EmptyState compact icon={CheckSquare} title="No tasks yet" description="The plan phase writes tasks.md." />;
  return (
    <section className="flex min-w-0 flex-col gap-1.5" data-testid="story-tasks" data-count={tasks.length}>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase">Tasks{counts ? <span className="ml-1 font-normal normal-case tabular-nums">{counts.done} of {counts.total} done</span> : null}</h4>
      <ItemGroup className="gap-0.5">
        {tasks.map((t) => (
          <Item key={t.id} size="sm" className="items-start px-1 py-1" data-testid="task-row" data-done={t.done || undefined}>
            <ItemMedia>{t.done ? <CheckSquare className="size-4 text-success" aria-label="done" /> : <Square className="size-4 text-muted-foreground" aria-label="open" />}</ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="flex w-full flex-wrap items-start gap-1.5 text-xs font-normal">
                <span className={cn('min-w-0 flex-1 break-words', t.done && 'text-muted-foreground line-through')}>{t.text}</span>
                {t.layer ? <Badge variant="outline" className="shrink-0 rounded-full text-[10px]" data-testid="task-layer">{t.layer}</Badge> : null}
              </ItemTitle>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </section>
  );
}

function Commits({ commits }: { commits: StoryCommit[] }) {
  if (!commits.length) return <EmptyState compact icon={GitCommit} title="No commits yet" description="Commits with the story's Card: trailer land here." />;
  return (
    <section className="flex min-w-0 flex-col gap-1.5" data-testid="story-commits" data-count={commits.length}>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase">Commits <span className="font-normal normal-case">newest first</span></h4>
      <ItemGroup className="gap-0.5">
        {commits.map((c) => (
          <Item key={c.sha} size="sm" className="items-start px-1 py-1" data-testid="commit-row" data-merged={c.merged || undefined}>
            <ItemMedia>{c.merged ? <GitMerge className="size-4 text-success" aria-hidden /> : <GitBranch className="size-4 text-muted-foreground" aria-hidden />}</ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="flex w-full flex-wrap items-center gap-1.5 text-xs font-normal">
                <span className="font-mono text-muted-foreground">{c.sha.slice(0, 7)}</span>
                <span className="min-w-0 flex-1 break-words">{c.subject}</span>
              </ItemTitle>
              <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <Badge variant="outline" className={cn('rounded-full text-[10px]', c.merged ? 'border-transparent bg-success/15 text-success' : '')} data-testid="commit-where">
                  {c.merged ? 'merged' : c.branches.length ? `on ${c.branches.join(', ')}` : 'on no branch'}
                </Badge>
                <span className="tabular-nums">{when(c.at)}</span>
              </span>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </section>
  );
}

/** `counts` is the journey's task tally from the API. */
export function TasksAndCommits({ tasks, counts, commits }: { tasks: Task[]; counts?: { done: number; total: number }; commits: StoryCommit[] }) {
  return (
    <AttributeCard title="Tasks and commits" icon={CheckSquare} testId="tasks-commits">
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <Tasks tasks={tasks} counts={counts} />
        <Commits commits={commits} />
      </div>
    </AttributeCard>
  );
}
