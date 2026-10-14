'use client';

// What happened on a story, one line each: edits, commands, checks, commits, gates, and a headless
// run's log lines in the same list. The lines come from GET /api/cards/:id/activity; new ones
// arrive on the project's live stream (useEvents appends them), so the list moves without a reload.

import { useState } from 'react';
import { Bot, CheckCircle2, FileEdit, GitCommit, Lock, MessageSquare, Terminal, XCircle, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { useCardActivity } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import type { ActivityLine } from '@/lib/types';

const ICONS: Record<string, LucideIcon> = { edit: FileEdit, cmd: Terminal, commit: GitCommit, log: Bot, prompt: MessageSquare, park: Lock, approve: CheckCircle2, reject: XCircle };

export function activitySentence(l: ActivityLine): string {
  switch (l.kind) {
    case 'edit': return `edited ${l.file}`;
    case 'cmd': return `ran ${l.text}`;
    case 'prompt': return l.text ? `asked: ${l.text}` : 'was asked something';
    case 'check': return l.pass ? `check passed${l.stage ? ` (${l.stage})` : ''}` : `check failing: ${String(l.output ?? '').trim().split('\n').pop() ?? ''}`;
    case 'commit': return `committed ${l.sha} ${l.subject}`;
    case 'log': return String(l.text ?? '');
    case 'start': return 'session started';
    case 'stop': return 'finished a turn';
    case 'end': return 'session ended';
    case 'park': return `waiting at a gate${l.text ? `: ${l.text}` : ''}`;
    default: return `${l.kind}${l.stage ? ` ${l.stage}` : ''}${l.text ? `: ${l.text}` : ''}`;
  }
}

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function Row({ line }: { line: ActivityLine }) {
  const failing = line.kind === 'check' && !line.pass;
  const Icon = line.kind === 'check' ? (line.pass ? CheckCircle2 : XCircle) : ICONS[line.kind] ?? Terminal;
  return (
    <li className="flex min-w-0 items-start gap-2 py-1 text-xs" data-kind={line.kind} data-testid="activity-line">
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{time(line.at)}</span>
      <Icon className={cn('mt-0.5 size-3.5 shrink-0 text-muted-foreground', failing && 'text-destructive', line.kind === 'check' && line.pass === true && 'text-success')} aria-hidden />
      <span className={cn('min-w-0 break-words', line.kind === 'log' && 'font-mono text-muted-foreground', failing && 'text-destructive')}>{activitySentence(line)}</span>
    </li>
  );
}

/** The feed, newest first. `limit` keeps a panel short; `phases` adds the phase filter the Activity tab shows. */
export function ActivityFeed({ cardId, limit, phases, className }: { cardId: string; limit?: number; phases?: string[]; className?: string }) {
  const { data, error, refetch } = useCardActivity(cardId);
  const [phase, setPhase] = useState<string>('all');
  if (!data && !error) return <div className="space-y-1.5"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>;
  if (error) return <InlineError title="Activity failed to load" error={error} onRetry={() => refetch()} />;
  const shown = [...(data ?? [])].reverse().filter((l) => phase === 'all' || l.phase === phase);
  const lines = limit ? shown.slice(0, limit) : shown;
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)} data-testid="activity-feed">
      {phases?.length ? (
        <ToggleGroup value={[phase]} onValueChange={(v: string[]) => setPhase(v[0] ?? 'all')} className="flex-wrap justify-start" aria-label="Filter by phase">
          <ToggleGroupItem value="all" size="sm">All</ToggleGroupItem>
          {phases.map((p) => <ToggleGroupItem key={p} value={p} size="sm">{p}</ToggleGroupItem>)}
        </ToggleGroup>
      ) : null}
      {lines.length ? <ol className="divide-y">{lines.map((l) => <Row key={l.cursor} line={l} />)}</ol>
        : <EmptyState compact icon={Terminal} title={phase === 'all' ? 'No activity yet' : `Nothing recorded in ${phase}`} description="Edits, commands, checks and commits land here as an agent works the story." />}
    </div>
  );
}
