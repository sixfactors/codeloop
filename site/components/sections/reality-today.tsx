// Copied from chanl-site/src/components/sections/reality-today.tsx. Strings inlined, next-intl
// dropped, the Card primitive replaced by a div with the same classes.
const PROBLEMS = [
  { title: 'Tests skipped', scenario: 'The tests were not run. Nothing in the loop required them to be.' },
  { title: 'Silent breakage', scenario: 'Something that worked yesterday is broken, and the only record of the change is the chat.' },
  { title: 'Corrections lost', scenario: 'The mistake you corrected last week is back, because the correction lived in a session that ended.' },
];

export function RealityToday() {
  return (
    <section className="section-padding container">
      <div className="mb-14">
        <div className="mb-4 flex items-center gap-2">
          <span className="size-3 rounded-full bg-primary" />
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">The problem</span>
        </div>
        <h2 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight md:text-5xl">
          Babysitting your coding agents is a pain
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          You have to keep checking in on them, and they don't always do what you want.
        </p>
      </div>

      <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
        {PROBLEMS.map((problem) => (
          <div key={problem.title} className="flex flex-col gap-4 bg-card p-8 md:p-10">
            <h3 className="text-2xl font-medium text-primary md:text-3xl">{problem.title}</h3>
            <p className="text-base leading-relaxed text-card-foreground md:text-lg">{problem.scenario}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
