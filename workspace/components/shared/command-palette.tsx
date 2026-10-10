'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

// The dialog (cmdk, the search queries) is a separate chunk fetched the first time ⌘K is pressed.
const PaletteDialog = dynamic(() => import('./command-palette-dialog').then((m) => m.CommandPaletteDialog), { ssr: false });

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setLoaded(true);
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <Button variant="outline" size="sm" className="gap-2 text-muted-foreground" onClick={() => { setLoaded(true); setOpen(true); }} onPointerEnter={() => setLoaded(true)} aria-label="Search">
        <Search className="size-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </Button>
      {loaded ? <PaletteDialog open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
