'use client';

// Copied from chanl-admin components/shared/short-id-cell.tsx. Changes: formatShortId is inlined
// (codeloop ids are already short, so the whole id shows); the full id is a native `title`, since a
// tooltip primitive on every board card would put the floating layer in the board's first load.

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const formatShortId = (id: string) => (id.length > 10 ? `#${id.slice(-6)}` : id);

export function ShortIdCell({ id, className }: { id: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      toast.success('ID copied to clipboard');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy ID');
    }
  };

  if (!id) return <span className="text-muted-foreground">-</span>;

  return (
    <span className={cn('inline-flex items-center gap-1', className)} title={id}>
      <span className="font-mono text-xs text-muted-foreground">{formatShortId(id)}</span>
      <Button size="icon-xs" variant="ghost" onClick={handleCopy} aria-label="Copy full ID">
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </Button>
    </span>
  );
}
