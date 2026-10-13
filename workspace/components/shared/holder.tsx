'use client';

// The "holder" building block (docs/artifacts/codeloop-ui-design.html §4): square for an agent,
// round for a person, hover shows the session. The board/home feeds (BoardStory) only carry an
// agent session id, there is no person-holder field yet, so a story with no active agent has
// no holder to show here; its state pill and stage sub-label already say what it's waiting on.

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const initialsOf = (name: string) => {
  const words = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join('') || name.slice(0, 2) || '?').toUpperCase();
};

export function Holder({ agent, className }: { agent?: string; className?: string }) {
  if (!agent) return null;
  return (
    <Tooltip>
      <TooltipTrigger className={cn('inline-flex', className)}>
        <Avatar className="size-5 rounded-md" data-testid="holder-agent">
          <AvatarFallback className="rounded-md bg-ai text-[10px] font-semibold text-ai-foreground">{initialsOf(agent)}</AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent>{agent}</TooltipContent>
    </Tooltip>
  );
}
