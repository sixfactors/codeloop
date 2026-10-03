import { AlertTriangle, ShieldAlert, Crown } from 'lucide-react';

const stages = [
  {
    freq: 1,
    icon: AlertTriangle,
    label: 'WARNING',
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    description:
      'An agent or you captures a gotcha as a wiki page with a title and a file scope. The next stage that touches those files gets the page in its brief.',
    session: 'First time',
  },
  {
    freq: 3,
    icon: ShieldAlert,
    label: 'CRITICAL',
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    description:
      'Captured a third time, the page becomes critical. codeloop check gotchas blocks a commit that touches matching files until the title is acknowledged.',
    session: 'Third repeat',
  },
  {
    freq: 10,
    icon: Crown,
    label: 'RULE',
    color: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/20',
    description:
      'At ten, codeloop learn appends the page to rules.md once. Every brief carries it from then on.',
    session: 'Tenth repeat',
  },
];

const laneChange = `$ codeloop lane propose
    proposed .codeloop/proposals/market-draft-1
$ codeloop lane eval market-draft-1
    ok   draft / claim-without-proof: expected fail, got fail
    ok   draft / claim-with-proof: expected pass, got pass
    ok   replay c-009 / draft
    eval green for market-draft-1
$ codeloop lane promote market-draft-1`;

export function Knowledge() {
  return (
    <section id="knowledge" className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Agents read the wiki before a stage and write it after
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Pages live in <code className="font-mono text-sm">.codeloop/wiki/</code> as plain
            markdown with a file scope. Every stage brief carries the pages whose scope matches the
            files in play. Each repeat of a gotcha raises its count, and the count decides how hard
            codeloop pushes back.
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

        {/* Lane change loop */}
        <div className="mt-16 grid gap-8 lg:grid-cols-2 lg:items-start">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">
              Three rejections at one gate become a lane change
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              When you reject the same gate three times, <code className="font-mono text-xs">codeloop lane propose</code>{' '}
              writes a proposal that cites the cards and carries your three notes into the stage.
              You can also tighten the stage&apos;s check in the proposal.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <code className="font-mono text-xs">codeloop lane eval</code> lints the proposal,
              runs its fixtures, and replays the changed check against the last ten finished cards.
              A changed check has to come with a fixture it fails on; without one the eval refuses
              it. A proposal that removes a gate or a public-step mark is refused unless
              the file says why.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <code className="font-mono text-xs">codeloop lane promote</code> installs it as the
              next lane version and keeps the previous file. Only the owner can run it; an agent is
              refused. <code className="font-mono text-xs">codeloop stats --compare v1 v2</code>{' '}
              then shows whether the change moved first-pass rate and human turns per card.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/50 bg-surface-1 text-left">
            <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-2 text-xs text-muted-foreground">
                from a saved run of the founder-week demo
              </span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-xs leading-6 text-foreground/90">
              <code>{laneChange}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
