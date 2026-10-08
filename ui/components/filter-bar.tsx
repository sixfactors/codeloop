'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { FACETS, type FacetKey, type Filters, type GroupBy } from '@/hooks/use-filters';

interface FilterBarProps {
  filters: Filters;
  options: Record<FacetKey, string[]>;
  active: boolean;
  shown: number;
  total: number;
  onToggle: (key: FacetKey, value: string) => void;
  onSet: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  onClear: () => void;
}

const LABELS: Record<FacetKey, string> = {
  lane: 'Lane', stage: 'Stage', bet: 'Bet', epic: 'Epic', persona: 'Persona', size: 'Size', points: 'Points',
};

export function FilterBar({ filters, options, active, shown, total, onToggle, onSet, onClear }: FilterBarProps) {
  const bar = useRef<HTMLDivElement>(null);

  // Native <details> stays open until its summary is clicked again; a click anywhere outside closes them all.
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!bar.current) return;
      for (const d of bar.current.querySelectorAll<HTMLDetailsElement>('details[open]')) {
        if (!d.contains(e.target as Node)) d.open = false;
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={bar} className="flex flex-wrap items-center gap-1.5 px-4 sm:px-6 py-2 border-b border-border">
      <input
        type="search"
        value={filters.search}
        onChange={e => onSet('search', e.target.value)}
        placeholder="Search title"
        className="text-xs bg-card border border-border rounded-md px-2 py-1 text-foreground placeholder:text-muted w-36 sm:w-44"
      />

      {FACETS.map(key => {
        const values = key === 'stage' && !filters.showDropped ? options[key].filter(v => v !== 'dropped') : options[key];
        if (values.length === 0) return null;
        const picked = filters[key];
        return (
          <details key={key} className="relative">
            <summary
              className={cn(
                'list-none cursor-pointer select-none text-xs px-2 py-1 rounded-md border',
                picked.length > 0 ? 'bg-accent/15 border-accent/40 text-foreground' : 'bg-card border-border text-muted hover:text-foreground',
              )}
            >
              {LABELS[key]}{picked.length > 0 ? ` · ${picked.length}` : ''}
            </summary>
            <div className="absolute left-0 top-full mt-1 z-40 min-w-[180px] max-w-[280px] max-h-72 overflow-y-auto bg-card border border-border rounded-lg p-2 shadow-lg">
              <div className="flex flex-wrap gap-1">
                {values.map(v => {
                  const on = picked.includes(v);
                  return (
                    <button
                      key={v}
                      onClick={() => onToggle(key, v)}
                      title={v}
                      className={cn(
                        'text-[11px] px-1.5 py-0.5 rounded-full border max-w-full truncate',
                        on ? 'bg-accent/20 border-accent/50 text-foreground' : 'bg-background border-border text-muted hover:text-foreground',
                      )}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          </details>
        );
      })}

      <label className="flex items-center gap-1 text-xs text-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={filters.showDropped}
          onChange={e => onSet('showDropped', e.target.checked)}
          className="accent-accent"
        />
        dropped
      </label>

      {active && (
        <button onClick={onClear} className="text-xs text-muted hover:text-foreground underline underline-offset-2">
          clear
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted whitespace-nowrap">{shown} of {total} cards</span>
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          {(['lane', 'bet'] as GroupBy[]).map(g => (
            <button
              key={g}
              onClick={() => onSet('groupBy', g)}
              className={cn(
                'text-xs px-2 py-1',
                filters.groupBy === g ? 'bg-border text-foreground' : 'text-muted hover:text-foreground',
              )}
            >
              by {g}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
