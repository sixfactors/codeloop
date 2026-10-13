import { Badge } from '@/components/ui/badge';
import type { StateFlag, StoryState } from '@/lib/types';
import { cn } from '@/lib/utils';

// The "status pill" and "flags" building blocks (docs/artifacts/codeloop-ui-design.html §4): one
// state pill per story (its six-state label, with the lane stage as a sub-label while in
// progress, or the gate/question it waits on while needing a person), plus one small pill per
// flag. Tones reuse the app's existing semantic tokens, `ai` for an agent at work (already the
// hue board-card.tsx's ToneBadge calls "agent"), `warning` for "needs a person", `success` for
// done/shipped, `destructive` for failing, rather than adding a new colour for the mock's
// separate "accent" hue.

type Tone = 'plain' | 'agent' | 'you' | 'ok' | 'bad' | 'warn';

const TONE_CLASS: Record<Tone, string> = {
  plain: 'border-transparent bg-muted text-foreground',
  agent: 'border-transparent bg-ai/15 text-ai',
  you: 'border-transparent bg-warning/15 font-medium text-warning-foreground dark:text-warning',
  ok: 'border-transparent bg-success/15 text-success',
  bad: 'border-transparent bg-destructive/15 font-medium text-destructive',
  warn: 'border-transparent bg-warning/15 font-medium text-warning-foreground dark:text-warning',
};

const FLAG_LABEL: Record<StateFlag, string> = { failing: 'Failing', blocked: 'Blocked', stuck: 'Stuck' };
const FLAG_TONE: Record<StateFlag, Tone> = { failing: 'bad', blocked: 'warn', stuck: 'bad' };

const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** What a gate name reads as on a pill: the gate's own name ("spec", "local-check") titled, or
 * the two states that are not a named gate at all. */
export function waitingLabel(waitingOn?: string): string {
  if (!waitingOn) return 'Needs you';
  if (waitingOn === 'questions') return 'Questions';
  if (waitingOn === 'stuck') return 'Stuck';
  return titleCase(waitingOn);
}

function Pill({ tone, agentDot, children, className }: { tone: Tone; agentDot?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn('shrink-0 gap-1 rounded-full px-2', TONE_CLASS[tone], className)}>
      {agentDot ? <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </Badge>
  );
}

/**
 * The status pill(s) for one story: the state (with its stage sub-label or its gate/question),
 * then one pill per flag. `agent` is the session working the story right now, only state
 * `in-progress` reads it, to decide the agent dot.
 */
export function StatePill({ display, agent, className }: { display: StoryState; agent?: string; className?: string }) {
  const flags = display.flags.filter((f) => !(f === 'stuck' && display.state === 'needs-you' && display.waitingOn === 'stuck'));
  let label: string;
  let tone: Tone;
  let dot = false;
  switch (display.state) {
    case 'backlog': label = 'Backlog'; tone = 'plain'; break;
    case 'up-next': label = 'Up next'; tone = 'plain'; break;
    case 'in-progress':
      label = display.stage ? `In progress · ${titleCase(display.stage)}` : 'In progress';
      tone = agent ? 'agent' : 'plain';
      dot = Boolean(agent);
      break;
    case 'needs-you': label = waitingLabel(display.waitingOn); tone = 'you'; break;
    case 'done': label = 'Done'; tone = 'ok'; break;
    case 'shipped': label = 'Shipped'; tone = 'ok'; break;
  }
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      <Pill tone={tone} agentDot={dot}>{label}</Pill>
      {flags.map((f) => <Pill key={f} tone={FLAG_TONE[f]}>{FLAG_LABEL[f]}</Pill>)}
    </span>
  );
}
