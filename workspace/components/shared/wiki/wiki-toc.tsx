'use client';

// "On this page": the headings parsed from the markdown, the active one tracked with an
// IntersectionObserver over the rendered heading elements. Nested depth is an indent.

import { useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { TocItem } from '@/lib/wiki';
import { cn } from '@/lib/utils';

export function WikiToc({ items, className }: { items: TocItem[]; className?: string }) {
  const [active, setActive] = useState<string>(items[0]?.url ?? '');

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.url.slice(1))).filter((el): el is HTMLElement => Boolean(el));
    if (!els.length) return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
        else visible.delete(e.target.id);
      }
      // The topmost heading in view wins; when none is in view the last one scrolled past stays.
      const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
      if (top) setActive(`#${top[0]}`);
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, [items]);

  const min = Math.min(...items.map((i) => i.depth));
  return (
    <ScrollArea className={cn('max-h-[calc(100vh-8rem)]', className)}>
      <nav aria-label="On this page" className="flex flex-col gap-0.5 border-l text-sm">
        {items.map((i) => (
          <a
            key={i.url}
            href={i.url}
            data-active={active === i.url}
            className={cn(
              '-ml-px truncate border-l py-1 text-muted-foreground transition-colors hover:text-foreground',
              active === i.url ? 'border-primary text-foreground' : 'border-transparent',
            )}
            style={{ paddingLeft: `${0.75 + (i.depth - min) * 0.75}rem` }}
            onClick={() => setActive(i.url)}
          >
            {i.title}
          </a>
        ))}
      </nav>
    </ScrollArea>
  );
}
