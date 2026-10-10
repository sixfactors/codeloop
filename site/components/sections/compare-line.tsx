import Link from 'next/link';

// One paragraph for readers who already use a spec-first or agile-persona tool. The full table is
// at /docs/compare and does not name products either.
export function CompareLine() {
  return (
    <section className="section-padding container !pt-0">
      <div className="mb-4 flex items-center gap-2">
        <span className="size-3 rounded-full bg-primary" />
        <span className="text-sm font-semibold uppercase tracking-wider text-primary">Compared</span>
      </div>
      <div className="rounded-2xl border border-border bg-card px-6 py-8 md:px-10">
        <p className="max-w-3xl text-lg leading-relaxed text-card-foreground">
          Spec-first tools and agile-persona tools give the agent a better plan. codeloop also checks each
          step with a command, keeps a human in the loop at the steps you choose, and shows all of it on a board.
          Both kinds import: <code>codeloop import speckit</code>, <code>codeloop import bmad</code>.{' '}
          <Link href="/docs/compare" className="text-primary underline-offset-4 hover:underline">
            The comparison, row by row
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
