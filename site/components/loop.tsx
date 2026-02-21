import { BookOpen, GitCommit, ListChecks, Lightbulb } from 'lucide-react';

const steps = [
  {
    icon: BookOpen,
    command: '/plan',
    title: 'Plan with memory',
    description:
      'Reads your project\'s known gotchas before you start. "Last time we touched auth, we forgot to scope queries by workspace." The agent plans around landmines it hasn\'t personally stepped on yet.',
  },
  {
    icon: ListChecks,
    command: '/manage',
    title: 'Track progress',
    description:
      'Checks off steps, adds new ones, updates the board. Your agent knows where things stand — without you asking.',
  },
  {
    icon: GitCommit,
    command: '/commit',
    title: 'Review & commit',
    description:
      'Three-phase commit: reviews your diff against learned rubrics, reflects on what happened this session, then commits. One command, three layers of quality.',
  },
  {
    icon: Lightbulb,
    command: '/reflect',
    title: 'Capture lessons',
    description:
      'Scans everything that happened and proposes lessons to save. You pick what matters. It writes to your knowledge base.',
  },
];

export function Loop() {
  return (
    <section id="loop" className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">The Loop</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            A closed feedback loop between you and your AI agent. Four commands. That&apos;s the
            entire interface.
          </p>
        </div>

        {/* Loop diagram */}
        <div className="mx-auto mt-10 flex max-w-md items-center justify-center">
          <div className="relative flex items-center gap-3 rounded-full border border-border/60 bg-surface-1 px-6 py-3">
            {['Plan', 'Build', 'Commit', 'Reflect'].map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium text-accent">{step}</span>
                {i < 3 && <span className="text-muted-foreground">&rarr;</span>}
              </div>
            ))}
            {/* Loop arrow */}
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
              &#8635; lessons feed back in
            </span>
          </div>
        </div>

        {/* Command cards */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {steps.map((step) => (
            <div
              key={step.command}
              className="group rounded-xl border border-border/50 bg-surface-1 p-6 transition-colors hover:border-accent/30"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <step.icon className="h-5 w-5" />
                </div>
                <code className="rounded bg-surface-2 px-2 py-0.5 font-mono text-sm text-accent">
                  {step.command}
                </code>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
