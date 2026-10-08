'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavGroup, SearchEntry } from '@/lib/docs';

type Props = { nav: NavGroup[]; index: SearchEntry[] };

function score(entry: SearchEntry, terms: string[]) {
  const title = entry.title.toLowerCase();
  const heads = entry.headings.join(' ').toLowerCase();
  const text = entry.text.toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (title.includes(t)) s += 10;
    else if (heads.includes(t)) s += 4;
    else if (text.includes(t)) s += 1;
    else return 0;
  }
  return s;
}

export function DocsSidebar({ nav, index }: Props) {
  const pathname = usePathname();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return index
      .map((e) => ({ e, s: score(e, terms) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((r) => r.e);
  }, [q, index]);

  // "/" focuses search from anywhere on a docs page, as on most docs sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === 'Escape') setQ('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const list = (
    <nav aria-label="Docs">
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search docs"
          aria-label="Search docs"
          className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {q && (
          <button
            onClick={() => setQ('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {q && (
          <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            {results.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No pages match.</li>}
            {results.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  onClick={() => {
                    setQ('');
                    setOpen(false);
                  }}
                  className="block px-3 py-2 text-sm hover:bg-accent"
                >
                  <span className="text-card-foreground">{r.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{r.group}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {nav.map((g) => (
        <div key={g.title} className="mb-6">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.title}</div>
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const active = pathname === i.href;
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-2 py-1.5 text-sm transition-colors',
                      active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {i.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <div className="md:hidden">
        <button
          onClick={() => setOpen(!open)}
          className="mb-4 w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-muted-foreground"
          aria-expanded={open}
        >
          {open ? 'Hide docs menu' : 'Docs menu and search'}
        </button>
        {open && <div className="mb-8">{list}</div>}
      </div>
      <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto pr-4 md:block">{list}</aside>
    </>
  );
}
