import Link from 'next/link';
import { NumberTicker } from './number-ticker';

// Every number is from a saved run: scripts/e2e-founder-loop.sh, scripts/first-user.sh and
// docs/artifacts/demo-founder-week.txt in the codeloop repo.
const FACTS: { value: number | string; label: string; href?: string }[] = [
  { value: 229, label: 'steps in the founder e2e' },
  { value: 29, label: 'steps from package install to first card' },
  { value: 14, label: 'cards in the saved week', href: '/docs/start/founders-week' },
  { value: 49, label: 'agent runs in that week', href: '/docs/start/founders-week' },
  { value: 15, label: 'approvals the founder typed', href: '/docs/start/founders-week' },
  { value: 'MIT', label: 'licence, on GitHub', href: 'https://github.com/sixfactors/codeloop' },
];

export function ProofStrip() {
  return (
    <section className="section-padding container !pb-10">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {FACTS.map((f) => {
          const body = (
            <>
              <dt className="font-mono text-3xl font-medium text-primary md:text-4xl">
                {typeof f.value === 'number' ? <NumberTicker value={f.value} /> : f.value}
              </dt>
              <dd className="mt-1 text-sm text-muted-foreground">{f.label}</dd>
            </>
          );
          return (
            <div key={f.label} className="rounded-lg border border-border bg-card p-5">
              {f.href ? (
                <Link href={f.href} className="block transition-opacity hover:opacity-80">
                  {body}
                </Link>
              ) : (
                body
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
