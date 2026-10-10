'use client';

// The log of one agent run on a card's stage: a status chip, the elapsed time and the lines as
// they arrive on the run's stream. While the run is live the lines come from the stream; once it
// ends, GET /api/runs/:runId holds the whole log, so a reload shows the same text.

import { useEffect, useRef, useState } from 'react';
import { Bot, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineError } from '@/components/shared/inline-error';
import { useRun } from '@/hooks/use-api';
import { useRunStream } from '@/hooks/use-run-stream';
import { cn } from '@/lib/utils';
import type { Run } from '@/lib/types';

const STATUS_STYLE: Record<Run['status'], string> = {
  running: 'rounded-full border-transparent bg-ai/15 text-ai',
  done: 'rounded-full border-transparent bg-success/15 text-success',
  failed: 'rounded-full border-transparent bg-destructive/15 text-destructive',
};

function useElapsed(startedAt?: string, endedAt?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endedAt]);
  if (!startedAt) return '';
  const ms = (endedAt ? new Date(endedAt).getTime() : now) - new Date(startedAt).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export function RunLogPane({ runId, onClose }: { runId: string; onClose: () => void }) {
  const run = useRun(runId);
  const status = run.data?.status;
  const live = status === 'running' || status === undefined;
  const stream = useRunStream(runId, live, () => void run.refetch());
  const elapsed = useElapsed(run.data?.startedAt, run.data?.endedAt);
  const pre = useRef<HTMLPreElement>(null);

  // The live lines, or the full log once the run has ended and the stream closed.
  const lines = live || !run.data?.log ? stream.lines : run.data.log.split('\n');
  useEffect(() => { if (pre.current && live) pre.current.scrollTop = pre.current.scrollHeight; }, [lines.length, live]);

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border bg-card" data-testid="run-log">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Bot className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">{run.data?.agent ? `Agent ${run.data.agent}` : 'Agent run'}</span>
        {status ? <Badge variant="outline" className={STATUS_STYLE[status]} data-testid="run-status">{status}{status !== 'running' && run.data?.exit !== undefined && run.data?.exit !== null ? ` · exit ${run.data.exit}` : ''}</Badge> : <Skeleton className="h-5 w-16" />}
        {elapsed ? <span className="text-xs text-muted-foreground tabular-nums" data-testid="run-elapsed">{elapsed}</span> : null}
        {run.data?.outcome ? <span className="text-xs text-muted-foreground">{run.data.outcome}{run.data.note ? ` · ${run.data.note}` : ''}</span> : null}
        {live && !stream.open ? <span className="text-xs text-muted-foreground">connecting to the stream…</span> : null}
        <span className="ml-auto flex items-center gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">{runId}</span>
          <Button size="icon-xs" variant="ghost" aria-label="Close run log" onClick={onClose}><X /></Button>
        </span>
      </div>
      {run.error ? <div className="p-3"><InlineError title="Run status unavailable" error={run.error} onRetry={() => run.refetch()} /></div> : null}
      <pre ref={pre} className={cn('max-h-80 overflow-auto px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap', lines.length === 0 && 'text-muted-foreground')} data-testid="run-log-lines">
        {lines.length ? lines.join('\n') : live ? 'Waiting for the first line…' : 'The run wrote nothing.'}
      </pre>
    </div>
  );
}
