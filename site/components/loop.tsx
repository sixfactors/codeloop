import {
  Compass,
  BookOpen,
  ListChecks,
  FlaskConical,
  GitCommit,
  ShieldCheck,
  Rocket,
  Bug,
  Lightbulb,
  PackageCheck,
} from 'lucide-react';

const pipeline = [
  {
    phase: 'Design',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
    skills: [
      {
        icon: Compass,
        command: '/design',
        title: 'Architecture first',
        description: 'Analyze the codebase and generate a lightweight spec — goals, approach, files to change, risks.',
      },
      {
        icon: BookOpen,
        command: '/plan',
        title: 'Plan with memory',
        description: 'Reads known gotchas before you start. Writes a task plan with acceptance criteria. Enters plan mode for approval.',
      },
    ],
  },
  {
    phase: 'Build',
    color: 'text-green-400',
    bg: 'bg-green-400/10',
    border: 'border-green-400/20',
    skills: [
      {
        icon: ListChecks,
        command: '/manage',
        title: 'Track progress',
        description: 'Check off steps, add new ones, update the board. The agent knows where things stand.',
      },
      {
        icon: FlaskConical,
        command: '/test',
        title: 'Run tests',
        description: 'Auto-detects your test runner. Parses results, tracks coverage over time in test-history.json.',
      },
      {
        icon: GitCommit,
        command: '/commit',
        title: 'Review & commit',
        description: 'Three-phase: reviews diff against learned rubrics, reflects on the session, then commits. Blocks on CRITICAL findings.',
      },
    ],
  },
  {
    phase: 'Ship',
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    border: 'border-purple-400/20',
    skills: [
      {
        icon: ShieldCheck,
        command: '/qa',
        title: 'Quality gate',
        description: 'Runs all checks: static analysis, tests, coverage threshold, integrity scan. Sets env:local-pass to unlock deploy.',
      },
      {
        icon: Rocket,
        command: '/deploy',
        title: 'Deploy with gates',
        description: 'Staging then production. Each environment has a verify step. /deploy prod refuses without staging-pass.',
      },
      {
        icon: Bug,
        command: '/debug',
        title: 'Investigate production',
        description: 'Search logs, check health, cross-reference errors with recent commits. Creates regression tasks automatically.',
      },
    ],
  },
  {
    phase: 'Learn',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    skills: [
      {
        icon: Lightbulb,
        command: '/reflect',
        title: 'Capture lessons',
        description: 'Deep session review. Scans all work and proposes lessons to save. Increments frequency on re-encountered gotchas.',
      },
      {
        icon: PackageCheck,
        command: '/ship',
        title: 'Close the loop',
        description: 'Orchestrates QA, staging, production, and verify in one command. On failure: stops and creates a regression task.',
      },
    ],
  },
];

export function Loop() {
  return (
    <section id="loop" className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">The Pipeline</h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Ten slash commands covering the full dev lifecycle. Design through production — with
            learned knowledge at every step.
          </p>
        </div>

        {/* Pipeline diagram */}
        <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-1.5 sm:gap-2">
          {['/design', '/plan', '/manage', '/test', '/commit', '/qa', '/deploy', '/debug', '/reflect', '/ship'].map((cmd, i) => (
            <div key={cmd} className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-mono text-[11px] font-medium text-accent sm:text-xs">{cmd}</span>
              {i < 9 && <span className="text-muted-foreground text-xs">&rarr;</span>}
            </div>
          ))}
        </div>

        {/* Phase groups */}
        <div className="mt-14 space-y-10">
          {pipeline.map((phase) => (
            <div key={phase.phase}>
              <div className="mb-4 flex items-center gap-3">
                <span className={`rounded-full ${phase.bg} ${phase.color} px-3 py-1 font-mono text-xs font-bold`}>
                  {phase.phase}
                </span>
                <div className="h-px flex-1 bg-border/40" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {phase.skills.map((skill) => (
                  <div
                    key={skill.command}
                    className={`group rounded-xl border ${phase.border} bg-surface-1 p-5 transition-colors hover:border-accent/30`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${phase.bg} ${phase.color}`}>
                        <skill.icon className="h-4 w-4" />
                      </div>
                      <code className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs text-accent">
                        {skill.command}
                      </code>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold">{skill.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {skill.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
