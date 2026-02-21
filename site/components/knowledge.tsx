import { AlertTriangle, ShieldAlert, Crown } from 'lucide-react';

const stages = [
  {
    freq: 1,
    icon: AlertTriangle,
    label: 'WARNING',
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    description: 'You discover a gotcha. /commit saves it. Next review: non-blocking warning.',
    session: 'Session 1',
  },
  {
    freq: 3,
    icon: ShieldAlert,
    label: 'CRITICAL',
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    description: 'Third occurrence. /commit blocks until you confirm it\'s handled.',
    session: 'Session 7',
  },
  {
    freq: 10,
    icon: Crown,
    label: 'RULE',
    color: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/20',
    description: 'Promoted to rules.md. Non-negotiable. Always enforced.',
    session: 'Session 20+',
  },
];

export function Knowledge() {
  return (
    <section id="knowledge" className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Knowledge compounds
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Every gotcha has a frequency counter. The more something bites you, the harder the
            system fights to prevent it. No configuration needed — it emerges from use.
          </p>
        </div>

        <div className="relative mt-14">
          {/* Connecting line */}
          <div className="absolute left-8 top-0 hidden h-full w-px bg-gradient-to-b from-yellow-500/40 via-red-500/40 to-accent/40 md:block" />

          <div className="space-y-8 md:space-y-12">
            {stages.map((stage) => (
              <div key={stage.freq} className="flex gap-6">
                {/* Icon column */}
                <div className="hidden md:flex flex-col items-center">
                  <div
                    className={`flex h-16 w-16 items-center justify-center rounded-xl ${stage.bg} ${stage.color}`}
                  >
                    <stage.icon className="h-7 w-7" />
                  </div>
                </div>

                {/* Content */}
                <div
                  className={`flex-1 rounded-xl border ${stage.border} bg-surface-1 p-6`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`font-mono text-xs font-bold ${stage.color}`}>
                      [freq:{stage.freq}]
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${stage.bg} ${stage.color}`}
                    >
                      {stage.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{stage.session}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {stage.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Frequency = severity.</span>{' '}
          The review isn&apos;t one-size-fits-all either. Changed a backend file? It loads backend
          gotchas. Frontend only? It skips database warnings entirely.
        </p>
      </div>
    </section>
  );
}
