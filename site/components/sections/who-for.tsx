'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

// Copied from chanl-site/src/components/sections/features-tabs.tsx: text and a vertical tab list
// on the left, the active tab's image on the right, the image under the tab on small screens.
// Radix Tabs and motion are replaced by buttons and plain state.
const PERSONAS = [
  {
    id: 'individuals',
    title: 'Individuals',
    description: 'Several stories in flight with one agent. The board shows which one moved, which one failed a check, and which one is waiting on you.',
    screen: '/screens/board.png',
    alt: 'The board with stories by workflow and stage',
  },
  {
    id: 'teams',
    title: 'Teams',
    description: 'A story started by one person in Claude Code is picked up by another in Cursor, with the same brief, history and approvals. Reviewers approve their own step.',
    screen: '/screens/card.png',
    alt: 'A story with its approval panel and history',
  },
  {
    id: 'non-code',
    title: 'Work that is not code',
    description: 'Any skill that writes a file can be a stage. A review skill runs on every client deliverable, and sending it waits for a person.',
    screen: '/screens/inbox.png',
    alt: 'The inbox listing what waits for a person',
  },
];

export function WhoFor() {
  const [active, setActive] = useState(PERSONAS[0]);

  return (
    <section className="section-padding container grid gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="flex flex-col justify-between gap-6">
        <div className="space-y-4 lg:max-w-lg">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-primary" />
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">Who it is for</span>
          </div>
          <h2 className="text-4xl font-medium leading-tight tracking-tight md:text-5xl">
            Who it is for
          </h2>
        </div>

        <div role="tablist" aria-label="Who it is for">
          {PERSONAS.map((p) => {
            const isActive = active.id === p.id;
            return (
              <div key={p.id} className="border-b border-border">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActive(p)}
                  className="flex w-full flex-col items-start py-5 text-left"
                >
                  <span className={cn('text-lg transition-colors', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                    {p.title}
                  </span>
                  <span className={cn('mt-1 text-sm text-muted-foreground', !isActive && 'sr-only')}>{p.description}</span>
                </button>
                {isActive && (
                  <div className="mb-5 overflow-hidden rounded-lg border border-border lg:hidden">
                    <Image src={p.screen} alt={p.alt} width={1440} height={900} unoptimized className="block h-auto w-full" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="hidden items-center lg:flex">
        <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <Image
            key={active.id}
            src={active.screen}
            alt={active.alt}
            width={1440}
            height={900}
            unoptimized
            className="block h-auto w-full"
          />
        </div>
      </div>
    </section>
  );
}
