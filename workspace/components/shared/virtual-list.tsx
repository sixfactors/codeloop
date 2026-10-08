'use client';

// Row virtualisation for long lists. Below `threshold` rows the items render plainly, which keeps
// the DOM simple and the layout free (no fixed-height scroll container); above it only the rows in
// view exist, inside a scroll container capped at `maxHeight`. `onEndReached` fires when the end of
// the list scrolls into view, so a caller holding a cursor can fetch the next page.
// The server has no viewport: `initialRect` stands in for it so the first rows are in the HTML.

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';

export const VIRTUAL_THRESHOLD = 100;
const SSR_RECT = { width: 320, height: 640 };
const NO_ROOT: RefObject<HTMLDivElement | null> = { current: null };

/** A hair-thin row after the list; intersecting it (within 240px) means the reader is at the end. */
function EndSentinel({ onReach, root, count }: { onReach?: () => void; root: RefObject<HTMLDivElement | null>; count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onReach || !ref.current) return;
    // Re-observed when the row count changes: a page that lands without pushing the sentinel out of
    // view would otherwise never fire again.
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) onReach(); }, { root: root.current, rootMargin: '240px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [onReach, root, count]);
  return <div ref={ref} aria-hidden className="h-px w-full" />;
}

export function VirtualList<T>({
  items, render, keyOf, estimate = 96, gap = 12, threshold = VIRTUAL_THRESHOLD, maxHeight = '70vh', className, overscan = 6, onEndReached, footer,
}: {
  items: T[];
  render: (item: T, index: number) => ReactNode;
  keyOf: (item: T) => string;
  estimate?: number;
  gap?: number;
  threshold?: number;
  maxHeight?: string;
  className?: string;
  overscan?: number;
  onEndReached?: () => void;
  /** Drawn after the rows (a "loading more" line). */
  footer?: ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtual = items.length > threshold;
  const virtualizer = useVirtualizer({
    count: virtual ? items.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimate,
    overscan,
    gap,
    initialRect: SSR_RECT,
    getItemKey: (i) => keyOf(items[i]),
  });

  if (!virtual) {
    return (
      <div className={cn('flex flex-col', className)} style={{ gap }}>
        {items.map((it, i) => <div key={keyOf(it)}>{render(it, i)}</div>)}
        {footer}
        {onEndReached ? <EndSentinel onReach={onEndReached} root={NO_ROOT} count={items.length} /> : null}
      </div>
    );
  }
  return (
    <div ref={parentRef} className={cn('overflow-y-auto', className)} style={{ maxHeight }} data-virtual="true">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)` }}
          >
            {render(items[row.index], row.index)}
          </div>
        ))}
      </div>
      {footer}
      {onEndReached ? <EndSentinel onReach={onEndReached} root={parentRef} count={items.length} /> : null}
    </div>
  );
}

/**
 * A responsive card grid (auto-fill, `minWidth` tracks) that virtualises by row once it passes the
 * threshold: the column count comes from the container width, rows are chunks of that many items.
 */
export function VirtualGrid<T>({
  items, render, keyOf, minWidth = 272, estimate = 140, gap = 12, threshold = VIRTUAL_THRESHOLD, maxHeight = '70vh', className, onEndReached, footer,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  keyOf: (item: T) => string;
  minWidth?: number;
  estimate?: number;
  gap?: number;
  threshold?: number;
  maxHeight?: string;
  className?: string;
  onEndReached?: () => void;
  footer?: ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtual = items.length > threshold;
  const width = parentRef.current?.clientWidth ?? 1200;
  const columns = Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
  const rows = virtual ? Math.ceil(items.length / columns) : 0;
  const virtualizer = useVirtualizer({ count: rows, getScrollElement: () => parentRef.current, estimateSize: () => estimate, overscan: 3, gap, initialRect: { width: 1200, height: 640 } });
  const grid = { display: 'grid', gap, gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` } as const;

  if (!virtual) {
    return (
      <div className={className}>
        <div style={grid}>{items.map((it) => <div key={keyOf(it)} className="min-w-0">{render(it)}</div>)}</div>
        {footer}
        {onEndReached ? <EndSentinel onReach={onEndReached} root={NO_ROOT} count={items.length} /> : null}
      </div>
    );
  }
  return (
    <div ref={parentRef} className={cn('overflow-y-auto', className)} style={{ maxHeight }} data-virtual="true">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div key={row.key} ref={virtualizer.measureElement} data-index={row.index} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)`, ...grid, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {items.slice(row.index * columns, row.index * columns + columns).map((it) => <div key={keyOf(it)} className="min-w-0">{render(it)}</div>)}
          </div>
        ))}
      </div>
      {footer}
      {onEndReached ? <EndSentinel onReach={onEndReached} root={parentRef} count={items.length} /> : null}
    </div>
  );
}
