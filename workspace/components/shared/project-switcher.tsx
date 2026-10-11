'use client';

// Shown only under the hub (see app-shell.tsx): a plain link per registered project, never
// client-side routing — switching projects is a full navigation, the same way the rest of this
// codebase keeps a project's data from leaking into another's query cache.

import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { useProject } from '@/components/providers/project-provider';

export function ProjectSwitcher({ currentName }: { currentName: string }) {
  const projects = useQuery({ queryKey: ['hub', 'projects'], queryFn: api.hub.projects, retry: false });
  const { project: currentId } = useProject();
  const known = (projects.data ?? []).filter((p) => !p.missing);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-muted-foreground">
          <span className="max-w-32 truncate">{currentName}</span>
          <ChevronDown className="size-3.5" />
        </Button>
      } />
      <DropdownMenuContent align="start">
        {known.map((p) => (
          <DropdownMenuItem key={p.id} render={<a href={`/p/${encodeURIComponent(p.id)}/`} />} data-active={p.id === currentId}>
            {p.name}
          </DropdownMenuItem>
        ))}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- deliberately a hard nav: leaving the project's data behind, not routing within it */}
        <DropdownMenuItem render={<a href="/" />}>All projects</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
