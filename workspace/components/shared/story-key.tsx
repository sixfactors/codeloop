'use client';

// The "key" building block from the UI design (docs/artifacts/codeloop-ui-design.html §4): a
// monospace id that links to the story everywhere it appears. Distinct from ShortIdCell (a table
// cell that abbreviates a long internal id behind a copy button), a codeloop story id is already
// short (`c-142`), so the key just shows it, as a link when the caller has somewhere to send it.

import Link from 'next/link';
import { cn } from '@/lib/utils';

export function StoryKey({ id, href, className }: { id: string; href?: string; className?: string }) {
  const classes = cn('font-mono text-xs font-medium text-muted-foreground', href && 'hover:text-foreground hover:underline', className);
  if (!href) return <span className={classes}>{id}</span>;
  return (
    <Link href={href} className={classes} onClick={(e) => e.stopPropagation()} data-testid={`story-key-${id}`}>
      {id}
    </Link>
  );
}
