'use client';

import { useState } from 'react';
import { Board } from '@/components/board';
import { CardsView } from '@/components/cards-view';
import { cn } from '@/lib/cn';

type View = 'cards' | 'tasks';

export default function Home() {
  const [view, setView] = useState<View>('cards');

  const nav = (
    <div className="flex items-center gap-1.5">
      {(['cards', 'tasks'] as View[]).map(v => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={cn(
            'text-xs px-2 py-1 rounded-md',
            v === view ? 'bg-border text-foreground' : 'text-muted hover:text-foreground',
          )}
        >
          {v === 'cards' ? 'Cards' : 'Tasks'}
        </button>
      ))}
    </div>
  );

  return view === 'cards' ? <CardsView nav={nav} /> : <Board nav={nav} />;
}
