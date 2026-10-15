'use client';

// The story's journey in one row: the lane's phases in order, each done (with how long and who),
// current (who holds it and what they did last), waiting at a gate, skipped (and why) or ahead.
// The API builds every step (GET /api/cards/:id/full `journey`); this draws it and derives nothing.

import { Check, CircleDot, Lock, MinusCircle, Circle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Journey, JourneyStep } from '@/lib/types';

export const formatDuration = (ms?: number) => {
  if (ms === undefined) return undefined;
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
};

const hm = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  return h ? `${h}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
};

/** "in build 6h 04m, working 1h 12m": the phase's wall time and the part of it someone was working.
 * The API sends the working and idle minutes, which together are the wall time. */
export function phaseTimeText(stage: string, active?: number, idle?: number): string | undefined {
  if (active === undefined || idle === undefined) return undefined;
  return `in ${stage} ${hm(active + idle)}, working ${hm(active)}`;
}

export const since = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : undefined);

const ICON = { done: Check, current: CircleDot, gate: Lock, skipped: MinusCircle, ahead: Circle } as const;

const TONE: Record<JourneyStep['state'], string> = {
  done: 'border-success/40 bg-success/10 text-foreground',
  current: 'border-ai/60 bg-ai/10 text-foreground ring-1 ring-ai/40',
  gate: 'border-warning/60 bg-warning/10 text-foreground ring-1 ring-warning/40',
  skipped: 'border-dashed text-muted-foreground',
  ahead: 'text-muted-foreground',
};

function detail(step: JourneyStep, journey: Journey): string {
  switch (step.state) {
    case 'done': return [formatDuration(step.durationMs), step.who].filter(Boolean).join(' · ') || 'done';
    case 'current': return journey.holder.agent ?? (journey.holder.kind === 'nobody' ? 'nobody on it' : 'in progress');
    case 'gate': return `waiting on ${step.who ?? 'owner'}${step.leftAt ? ` since ${since(step.leftAt)}` : ''}`;
    case 'skipped': return 'skipped';
    default: return step.gate ? `gate: ${step.gate.name}` : '';
  }
}

export function JourneyStepper({ journey, className }: { journey: Journey; className?: string }) {
  return (
    <ol className={cn('flex flex-wrap items-stretch gap-1.5', className)} aria-label="Story journey" data-testid="journey-stepper">
      {journey.steps.map((step) => {
        const Icon = ICON[step.state];
        const sub = detail(step, journey);
        const body = (
          <li
            key={step.id}
            className={cn('flex min-w-0 flex-1 basis-28 flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 text-xs', TONE[step.state])}
            data-state={step.state}
            data-testid={`journey-step-${step.id}`}
            aria-current={step.state === 'current' || step.state === 'gate' ? 'step' : undefined}
          >
            <span className="flex items-center gap-1 font-medium">
              <Icon className={cn('size-3.5 shrink-0', step.state === 'done' && 'text-success', step.state === 'current' && 'text-ai', step.state === 'gate' && 'text-warning')} aria-hidden />
              <span className="truncate">{step.id}</span>
              {step.gate ? <Lock className="ml-auto size-3 shrink-0 text-muted-foreground" aria-label={`gate ${step.gate.name}`} /> : null}
            </span>
            {sub ? <span className="truncate text-[11px] text-muted-foreground">{sub}</span> : null}
          </li>
        );
        const tip = step.state === 'skipped' ? step.reason : step.state === 'current' ? journey.holder.last?.text : undefined;
        return tip ? (
          <Tooltip key={step.id}>
            <TooltipTrigger render={body} />
            <TooltipContent>{tip}</TooltipContent>
          </Tooltip>
        ) : body;
      })}
    </ol>
  );
}
