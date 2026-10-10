'use client';

// Copied from chanl-admin components/data-table-faceted-filter.tsx. Change: the TanStack `column`
// prop is replaced by a plain `value` / `onChange` pair (the workspace has no react-table); the
// staged-selection behaviour, trigger badges, search heuristic and Clear / Apply footer are the
// same. Radix icons are replaced by lucide; Popover/Checkbox are base-ui.

import * as React from 'react';
import { PlusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

export interface FacetOption {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** How many records carry this value — counted by the data source, not the visible page. */
  count?: number;
}

interface DataTableFacetedFilterProps {
  title?: string;
  options: FacetOption[];
  value: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
}

export function DataTableFacetedFilter({ title, options, value, onChange, searchable }: DataTableFacetedFilterProps) {
  const [open, setOpen] = React.useState(false);
  const committed = new Set(value);

  // Selection is STAGED while the popover is open and committed once, on close — Apply,
  // click-outside and Escape all commit the same draft.
  const [draft, setDraft] = React.useState<Set<string>>(committed);

  const commit = (next: Set<string>) => {
    const values = Array.from(next);
    const unchanged = values.length === value.length && values.every((v) => value.includes(v));
    if (unchanged) return;
    onChange(values);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(new Set(value));
    else commit(draft);
    setOpen(next);
  };

  const toggle = (v: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const showSearch = searchable ?? options.length > 6;
  const dirty = draft.size !== committed.size || Array.from(draft).some((v) => !committed.has(v));

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8 border-dashed" />}>
        <PlusCircle className="mr-1 h-4 w-4" />
        {title}
        {committed.size > 0 && (
          <>
            <Separator orientation="vertical" className="mx-2 h-4" />
            <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">{committed.size}</Badge>
            <div className="hidden space-x-1 lg:flex">
              {committed.size > 2 ? (
                <Badge variant="secondary" className="rounded-sm px-1 font-normal">{committed.size} selected</Badge>
              ) : (
                options.filter((o) => committed.has(o.value)).map((o) => (
                  <Badge variant="secondary" key={o.value} className="rounded-sm px-1 font-normal">{o.label}</Badge>
                ))
              )}
            </div>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          {showSearch && <CommandInput placeholder={`Search ${title?.toLowerCase() ?? 'options'}…`} />}
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = draft.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                    data-testid={`facet-option-${option.value}`}
                    aria-label={`${option.label}, ${isSelected ? 'selected' : 'not selected'}`}
                  >
                    <Checkbox checked={isSelected} className="pointer-events-none mr-2" tabIndex={-1} aria-hidden="true" />
                    {option.icon && <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />}
                    <span className="truncate">{option.label}</span>
                    {option.count !== undefined && (
                      <span className="ml-auto pl-2 text-xs text-muted-foreground tabular-nums">{option.count}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          <CommandSeparator />
          <div className="flex items-center justify-between gap-2 p-2">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={draft.size === 0} onClick={() => setDraft(new Set())}>Clear</Button>
            <span className="text-xs text-muted-foreground">{draft.size} selected</span>
            <Button size="sm" className="h-7 px-3" onClick={() => handleOpenChange(false)}>{dirty ? 'Apply' : 'Done'}</Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
