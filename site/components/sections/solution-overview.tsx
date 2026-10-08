import Image from 'next/image';

// Copied from chanl-site/src/components/sections/solution-overview.tsx: the bordered gap-px grid
// of pillar cards. Three pillars become the four commands of the loop, each with its screen.
// Every command is real; the docs home shows the same four.
const STEPS = [
  {
    cmd: 'codeloop start "Export invoices as CSV"',
    lead: 'A card opens in the build lane.',
    screen: '/screens/board.png',
    alt: 'The board with the new card',
  },
  {
    cmd: 'codeloop run --agent',
    lead: 'Your agent does the stage. A command checks it.',
    screen: '/screens/card.png',
    alt: 'A card parked at its gate after the check passed',
  },
  {
    cmd: 'codeloop approve c-001',
    lead: 'Gates wait for you in the inbox.',
    screen: '/screens/inbox.png',
    alt: 'The inbox listing gates waiting',
  },
  {
    cmd: 'codeloop wiki capture',
    lead: 'A lesson saved once is read before the next stage.',
    screen: '/screens/wiki.png',
    alt: 'The wiki agents read before a stage',
  },
];

export function SolutionOverview() {
  return (
    <section className="section-padding container">
      <div className="mb-14">
        <div className="mb-4 flex items-center gap-2">
          <span className="size-3 rounded-full bg-primary" />
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">The loop</span>
        </div>
        <h2 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight md:text-5xl">
          Four commands.
          <br />
          <span className="text-muted-foreground">One card at a time.</span>
        </h2>
      </div>

      <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.cmd} className="flex flex-col gap-4 bg-card p-6 md:p-8">
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-mono text-sm font-medium text-primary">
                {i + 1}
              </span>
              <code className="min-w-0 break-words font-mono text-sm font-medium text-card-foreground">{step.cmd}</code>
            </div>
            <p className="text-base leading-snug text-muted-foreground">{step.lead}</p>
            <div className="mt-auto overflow-hidden rounded-lg border border-border">
              <Image src={step.screen} alt={step.alt} width={1440} height={900} unoptimized className="block h-auto w-full" />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
