import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

// The link row into the docs. Same card grid as the facts in guide.tsx.
const links = [
  { title: 'Install', note: 'One package, one init.', href: '/docs/start/install' },
  { title: 'Your first card', note: 'Start, check, reach a gate.', href: '/docs/start/first-card' },
  { title: 'Lanes', note: 'The eight shipped lanes, stage by stage.', href: '/docs/reference/lanes' },
  { title: 'Commands', note: 'Every flag, generated from --help.', href: '/docs/reference/commands' },
  { title: 'Compare', note: 'Next to spec-first and agile-persona tools.', href: '/docs/compare' },
];

export function DocsLinks() {
  return (
    <section className="border-t border-border py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 className="text-3xl font-medium tracking-tight md:text-4xl">Read the docs.</h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="group flex h-full flex-col rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary"
              >
                <span className="inline-flex items-center gap-1.5 font-medium text-card-foreground">
                  {l.title}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
                </span>
                <span className="mt-1 text-sm text-muted-foreground">{l.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
