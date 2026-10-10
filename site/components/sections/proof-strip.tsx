import Link from 'next/link';
import { NumberTicker } from './number-ticker';

// Facts a newcomer can check: the package contents (templates/lanes, templates/skills) and the host
// list in docs/hosts. Run counts live on the founder's week page, not here.
const FACTS: { value: number | string; label: string; href?: string }[] = [
  { value: 1, label: 'npm package, no server to run' },
  { value: 8, label: 'workflows included: build, deploy, launch, plan, triage, scan, analyze, learn', href: '/docs/reference/lanes' },
  { value: 13, label: 'stage skills, from research to release', href: '/docs/start/install' },
  { value: 4, label: 'agent hosts: Claude Code, Cursor, Codex, MCP', href: '/docs/hosts' },
  { value: 0, label: 'data leaves your machine; everything is a file in your repo' },
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
