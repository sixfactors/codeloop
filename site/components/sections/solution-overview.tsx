import Image from 'next/image';

// Copied from chanl-site/src/components/sections/solution-overview.tsx: the bordered gap-px grid
// of pillar cards. Three pillars become the four commands of the loop, each with its screen.
// Every command is real; the docs home shows the same four.
const STEPS = [
  {
    title: 'Runs the workflow on its own',
    cmd: 'codeloop run --agent',
    lead: 'Picks the next story, starts your agent on one stage with a brief, runs the check, moves the story, and goes again. From cron, all day.',
    screen: '/screens/card.png',
    alt: 'A story at one stage, with its brief, check and history',
  },
  {
    title: 'Visual story board',
    cmd: 'codeloop serve',
    lead: 'Every user story on one board, by workflow and stage. A story moves only when its check passed, so the board shows what actually happened.',
    screen: '/screens/board.png',
    alt: 'The board: user stories by workflow and stage',
  },
  {
    title: 'Keeps you in the loop',
    cmd: 'codeloop inbox',
    lead: 'The steps you mark for a person wait. The inbox lists questions and approvals, oldest first; the agent cannot approve on your behalf.',
    screen: '/screens/inbox.png',
    alt: 'The inbox listing stories waiting for a person',
  },
  {
    title: 'Remembers what went wrong',
    cmd: 'codeloop wiki capture',
    lead: 'Agents write what they learned to a wiki in your repo and read the matching pages before the next stage. A lesson captured three times is marked critical.',
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
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">CodeLoop in action</span>
        </div>
        <h2 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight md:text-5xl">
          Watch your product being built visually
        </h2>
      </div>

      <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li key={step.cmd} className="flex flex-col gap-4 bg-card p-6 md:p-8">
            <h3 className="text-2xl font-medium text-card-foreground">{step.title}</h3>
            <p className="text-base leading-snug text-muted-foreground">{step.lead}</p>
            <code className="min-w-0 break-words font-mono text-xs text-muted-foreground">{step.cmd}</code>
            <div className="mt-auto overflow-hidden rounded-lg border border-border">
              <Image src={step.screen} alt={step.alt} width={1440} height={900} unoptimized className="block h-auto w-full" />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
