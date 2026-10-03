const steps = [
  { cmd: 'codeloop init', note: 'installs the lanes' },
  { cmd: 'codeloop start "Add CSV export"', note: 'opens a card in the build lane' },
  { cmd: 'codeloop inbox', note: 'approve, reject, or let it run' },
];

// The build lane: a diamond marks a stage whose gate waits for a person.
const lane = [
  { id: 'research' },
  { id: 'mock' },
  { id: 'spec', gate: true },
  { id: 'build' },
  { id: 'verify', gate: true },
  { id: 'review', gate: true },
  { id: 'staging' },
  { id: 'live', gate: true },
];

export function Plan() {
  return (
    <section id="plan" className="scroll-mt-14 border-t border-border py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 className="text-3xl font-medium tracking-tight md:text-4xl">Three commands.</h2>

        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.cmd} className="rounded-lg border border-border bg-card p-5">
              <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
              <code className="mt-2 block break-words font-mono text-sm font-medium text-card-foreground">{s.cmd}</code>
              <p className="mt-2 text-sm text-muted-foreground">{s.note}</p>
            </li>
          ))}
        </ol>

        <div className="mt-14 rounded-lg border border-border bg-card px-5 py-8 sm:px-8">
          <ol className="flex flex-col items-start gap-0 md:flex-row md:items-center md:justify-between">
            {lane.map((stage, i) => (
              <li key={stage.id} className="flex flex-col items-start md:flex-row md:items-center">
                <div className="flex items-center gap-3">
                  {stage.gate ? (
                    <span
                      className="h-3 w-3 shrink-0 rotate-45 border-2 border-primary bg-card"
                      aria-label="gate: waits for you"
                    />
                  ) : (
                    <span className="h-3 w-3 shrink-0 rounded-full bg-primary" aria-label="runs itself" />
                  )}
                  <span className="font-mono text-sm text-card-foreground">{stage.id}</span>
                </div>
                {i < lane.length - 1 && (
                  <span className="my-1 ml-[5px] h-5 w-px bg-border md:mx-2 md:my-0 md:h-px md:w-5 lg:w-8" aria-hidden />
                )}
              </li>
            ))}
          </ol>
          <p className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Dots run themselves.
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rotate-45 border-2 border-primary" /> Diamonds wait for you.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
