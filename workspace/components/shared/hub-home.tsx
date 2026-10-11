'use client';

// The hub's own `/`: every registered project, and what needs a person across all of them, in one
// server-computed response each (hub.ts's /api/hub/projects and /api/hub/needs-you). No project is
// selected here, so this never goes through the project-scoped card/board components — switching
// into one is a plain link, a full navigation, never client-side routing.

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Boxes, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { PageLayout } from '@/components/shared/page-layout';
import { api, type HubNeedsYou, type ListedProject } from '@/lib/api';

export function HubHome() {
  const projects = useQuery({ queryKey: ['hub', 'projects'], queryFn: api.hub.projects, retry: false });
  const needsYou = useQuery({ queryKey: ['hub', 'needs-you'], queryFn: api.hub.needsYou, retry: false });

  const known = (projects.data ?? []).filter((p) => !p.missing);

  return (
    <PageLayout icon={Boxes} title="Codeloop" description="Every registered project, on one board.">
      <div className="flex flex-col gap-6">
        <NeedsYouSection needsYou={needsYou.data} loading={needsYou.isLoading} />
        <section>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">Projects</h3>
          {projects.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : known.length === 0 ? (
            <EmptyState icon={Boxes} title="No projects registered yet" description="Run codeloop serve or codeloop init in a project to add it here." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {known.map((p) => <ProjectCard key={p.id} project={p} gateCount={countFor(needsYou.data, p.id)} />)}
            </div>
          )}
          {(projects.data ?? []).some((p) => p.missing) && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="size-3.5" /> {(projects.data ?? []).filter((p) => p.missing).length} registered project{(projects.data ?? []).filter((p) => p.missing).length === 1 ? '' : 's'} no longer on disk — <code>codeloop projects remove &lt;id&gt;</code> drops one.
            </p>
          )}
        </section>
      </div>
    </PageLayout>
  );
}

function countFor(needsYou: HubNeedsYou | undefined, projectId: string): number {
  if (!needsYou) return 0;
  return needsYou.gates.filter((g) => g.project === projectId).length + needsYou.questions.filter((q) => q.project === projectId).length;
}

function ProjectCard({ project, gateCount }: { project: ListedProject; gateCount: number }) {
  return (
    <a href={`/p/${encodeURIComponent(project.id)}/`} className="block">
      <Card className="transition-colors hover:border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="truncate">{project.name}</span>
            {gateCount > 0 && <Badge variant="secondary">{gateCount} waiting</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="truncate text-xs text-muted-foreground">{project.path}</p>
        </CardContent>
      </Card>
    </a>
  );
}

function NeedsYouSection({ needsYou, loading }: { needsYou: HubNeedsYou | undefined; loading: boolean }) {
  const gates = needsYou?.gates ?? [];
  const questions = needsYou?.questions ?? [];
  if (loading) return null;
  if (gates.length === 0 && questions.length === 0) return null;
  return (
    <section>
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">Needs you</h3>
      <div className="flex flex-col gap-2">
        {gates.map((g) => (
          <a key={`${g.project}-${g.id}`} href={`/p/${encodeURIComponent(g.project)}/cards/${encodeURIComponent(g.id)}/`} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/40">
            <Badge variant="outline">{g.projectName}</Badge>
            <span className="truncate font-medium">{g.title}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">gate: {g.gate}</span>
          </a>
        ))}
        {questions.map((q) => (
          <a key={`${q.project}-${q.id}`} href={`/p/${encodeURIComponent(q.project)}/cards/${encodeURIComponent(q.id)}/`} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/40">
            <Badge variant="outline">{q.projectName}</Badge>
            <HelpCircle className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{q.title}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{q.open} open question{q.open === 1 ? '' : 's'}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
