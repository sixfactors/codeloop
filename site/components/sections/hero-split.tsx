'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CopyInstall } from '@/components/copy-install';
import { cn } from '@/lib/utils';

// Copied from chanl-site/src/components/sections/hero-section-split.tsx: the 12-column split with
// text left and the product right. The voice carousel is replaced by static screenshots behind a
// tab row, and framer-motion is dropped.
const SCREENS = [
  { id: 'board', label: 'Board', src: '/screens/board.png', alt: 'The codeloop board: every card by lane and stage' },
  { id: 'inbox', label: 'Inbox', src: '/screens/inbox.png', alt: 'The inbox: gates waiting on you, oldest first' },
  { id: 'card', label: 'Card', src: '/screens/card.png', alt: 'A card at its gate with Approve and Reject' },
  { id: 'wiki', label: 'Wiki', src: '/screens/wiki.png', alt: 'The wiki agents read before a stage' },
];

export function HeroSplit() {
  const [active, setActive] = useState(SCREENS[0]);

  return (
    <section className="overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24">
      <div className="container">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-5">
            <div className="max-w-xl">
              <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                Open source, MIT
              </span>
              <h1 className="mb-6 text-4xl font-medium tracking-tight md:text-5xl">
                Run coding agents stage by stage, with a check after each stage and a gate where a person approves.
              </h1>
              <p className="mb-8 text-lg text-muted-foreground md:text-xl">
                A lane is a YAML file of stages. Each stage names a skill, the file it must write and a
                command that must exit 0. A gate parks the card until an owner or reviewer approves.
                Works in Claude Code, Cursor, Codex and any MCP client.
              </p>
              <div className="flex flex-col items-start gap-4">
                <CopyInstall />
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  Read the docs <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

          <div className="min-w-0 lg:col-span-7">
            <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Product screens">
              {SCREENS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={active.id === s.id}
                  onClick={() => setActive(s)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                    active.id === s.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <Image
                key={active.id}
                src={active.src}
                alt={active.alt}
                width={1440}
                height={900}
                unoptimized
                priority
                className="block h-auto w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
