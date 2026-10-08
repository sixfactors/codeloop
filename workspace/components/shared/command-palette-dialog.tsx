'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut,
} from '@/components/ui/command';
import { useCards } from '@/hooks/use-api';
import { useWikiSearch } from '@/hooks/use-wiki-search';
import { folderLabel, pageFolder } from '@/lib/wiki';
import { routes } from '@/lib/routes';

// Global search: cards from GET /api/cards?q=, wiki pages from GET /api/pages?q=.
export function CommandPaletteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState('');
  const router = useRouter();
  const cards = useCards({ q });
  const wiki = useWikiSearch(q, 8);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <>
      <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Cards and wiki pages">
        {/* This registry's CommandDialog does not wrap its children in a Command root, and CommandInput
            subscribes to that root's store; without it the dialog throws on open. */}
        <Command shouldFilter={false} className="rounded-xl">
        <CommandInput placeholder="Search cards and pages…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Cards">
            {cards.cards.slice(0, 50).map((c) => (
              <CommandItem key={c.id} value={`${c.id} ${c.title} ${c.initiative ?? ''} ${c.persona ?? ''}`} onSelect={() => go(routes.card(c.id))}>
                <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                <span className="truncate">{c.title}</span>
                <CommandShortcut>{c.stage}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          {wiki.hits.length ? (
            <CommandGroup heading="Wiki">
              {wiki.hits.map((p) => (
                <CommandItem key={p.id} value={`wiki ${p.id} ${p.title}`} onSelect={() => go(routes.wiki(p.id))} className="items-start">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{p.title}</span>
                    {p.excerpt ? <span className="line-clamp-1 text-xs text-muted-foreground">{p.excerpt}</span> : null}
                  </div>
                  <CommandShortcut>{folderLabel(pageFolder(p))}</CommandShortcut>
                </CommandItem>
              ))}
              {wiki.enabled ? (
                <CommandItem value={`wiki search all ${q}`} onSelect={() => go(`${routes.wiki()}?q=${encodeURIComponent(q)}`)}>
                  <Search className="size-4" />
                  <span>All wiki results for “{q}”</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          ) : null}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
