// The build workflow as shipped in templates/lanes/build.yaml, one tile per stage: who acts, what
// they produce, and what lets the story move on. Kept terse on purpose; the docs carry the prose.
type Actor = 'Agent' | 'You' | 'Reviewer';

const STAGES: { stage: string; actor: Actor[]; does: string; moves: string; gate?: boolean }[] = [
  { stage: 'Research', actor: ['Agent'], does: 'Reads the code, cites sources, gives a verdict', moves: 'Check: 3 sources and a verdict' },
  { stage: 'Interview', actor: ['Agent', 'You'], does: 'Agent asks; you answer from the inbox', moves: 'Check: 3 questions answered' },
  { stage: 'Mock', actor: ['Agent'], does: 'Draws each screen with its states', moves: 'Check: every screen drawn' },
  { stage: 'Spec', actor: ['Agent', 'You'], does: 'Story, acceptance, tasks by layer', moves: 'You approve', gate: true },
  { stage: 'Build', actor: ['Agent'], does: 'API, SDK, UI, one task at a time', moves: 'Check: tasks done, tests pass' },
  { stage: 'Verify', actor: ['Agent', 'You'], does: 'Runs the use cases, records evidence', moves: 'You approve', gate: true },
  { stage: 'Review', actor: ['Agent', 'Reviewer'], does: 'Writes the review; PR opened', moves: 'Reviewer approves', gate: true },
  { stage: 'Release', actor: ['You'], does: 'Staging, then live', moves: 'You approve before anything ships', gate: true },
];

const ACTOR_CLASS: Record<Actor, string> = {
  Agent: 'bg-muted text-muted-foreground',
  You: 'bg-primary text-primary-foreground',
  Reviewer: 'bg-primary/15 text-primary',
};

export function TypicalDay() {
  return (
    <section className="section-padding container">
      <div className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <span className="size-3 rounded-full bg-primary" />
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">The workflow</span>
        </div>
        <h2 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight md:text-5xl">
          Build your product one story at a time
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Enable agents to act at each stage of the build workflow, with checks to ensure the story is ready for the next stage.
        </p>
      </div>
      <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((s, i) => (
          <li key={s.stage} className="flex flex-col gap-3 bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
              <div className="flex gap-1">
                {s.actor.map((a) => (
                  <span key={a} className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTOR_CLASS[a]}`}>
                    {a}
                  </span>
                ))}
              </div>
            </div>
            <h3 className="text-xl font-medium text-card-foreground">{s.stage}</h3>
            <p className="text-sm leading-snug text-muted-foreground">{s.does}</p>
            <p className={`mt-auto border-t border-border pt-3 text-xs font-medium ${s.gate ? 'text-primary' : 'text-muted-foreground'}`}>
              {s.gate ? '⏸ ' : '✓ '}
              {s.moves}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-muted-foreground">
        ✓ a command decides. ⏸ a person decides; the agent cannot approve. Every move is an event on the story.
      </p>
    </section>
  );
}
