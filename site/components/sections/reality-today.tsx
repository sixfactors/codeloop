// Copied from chanl-site/src/components/sections/reality-today.tsx. Strings inlined, next-intl
// dropped, the Card primitive replaced by a div with the same classes.
const PROBLEMS = [
  { step: '01', scenario: 'Checking the work, releasing it, writing the launch post and reading the numbers are still manual steps.' },
  { step: '02', scenario: 'The only signal that a step is finished is the agent saying so. Nothing runs a check.' },
  { step: '03', scenario: 'A mistake made in one session is not recorded, so the next session makes it again.' },
];

export function RealityToday() {
  return (
    <section className="section-padding container">
      <div className="mb-14">
        <div className="mb-4 flex items-center gap-2">
          <span className="size-3 rounded-full bg-primary" />
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">Today</span>
        </div>
        <h2 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight md:text-5xl">
          What a coding agent leaves undone
        </h2>
      </div>

      <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
        {PROBLEMS.map((problem) => (
          <div key={problem.step} className="flex flex-col gap-4 bg-card p-8 md:p-10">
            <span className="text-5xl font-medium tabular-nums text-primary md:text-6xl">{problem.step}</span>
            <p className="text-base leading-relaxed text-card-foreground md:text-lg">{problem.scenario}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
