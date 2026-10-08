'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

// Copied from chanl-site/src/components/sections/features-tabs.tsx: text and a vertical tab list
// on the left, the active tab's image on the right, the image under the tab on small screens.
// Radix Tabs and motion are replaced by buttons and plain state.
const PERSONAS = [
  {
    id: 'founder',
    title: 'Founder',
    description: 'Ten minutes in the inbox on Monday. The rest of the week runs from cron.',
    screen: '/screens/inbox.png',
    alt: 'The inbox a founder reads on Monday',
  },
  {
    id: 'developer',
    title: 'Developer',
    description: 'Your slash commands become lane skills. Every stage leaves an event on the card.',
    screen: '/screens/card.png',
    alt: 'A card with its gate and details',
  },
  {
    id: 'consultant',
    title: 'Consultant',
    description: 'A deck goes through your review skill on every deliverable. You approve the send.',
    screen: '/screens/board.png',
    alt: 'The board with cards by lane',
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
            One loop, not only for code.
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
