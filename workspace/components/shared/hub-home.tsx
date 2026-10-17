'use client';

// The hub's own `/`: every registered project, and what needs a person across all of them, in one
// server-computed response each (hub.ts's /api/hub/projects — carrying each project's own
// active/waitingOnYou/storiesWithQuestions/stuck counts — and /api/hub/needs-you). No project is
// selected here, so this never goes through the project-scoped card/board components; switching
// into one is a plain link, a full navigation, never client-side routing, same as the rest of the
// hub (see components/shared/project-switcher.tsx).
//
// Renders inside the same AppShell as every other page (components/shared/app-shell.tsx picks a
// "Projects" sidebar instead of "Work"/"Knowledge" when there is no project in scope) — this page
// is the shell's body, not a separate layout.

import { useMemo } from 'react';
import { AlertCircle, Boxes, CheckCircle2, HelpCircle, Lock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { EntityCard } from '@/components/shared/entity-card';
import { PageLayout } from '@/components/shared/page-layout';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { AttributeCard, SectionHeading } from '@/components/shared/record-layout';
import { FieldRow } from '@/components/shared/field-row';
import { MetaChip } from '@/components/shared/meta-chip';
import { BAND_LABEL, BandChip } from '@/components/shared/band-chip';
import { ToneBadge } from '@/components/shared/board-card';
import { groupByBand } from '@/components/shared/inbox-view';
import { api, type HubGateItem, type HubNeedsYou, type HubQuestionItem, type ListedProject } from '@/lib/api';

/** Per project, in one "Needs you" card: the same caps inbox-view itself uses for a single
 * project's gates (TOP) and question cards (QUESTION_CARDS), so a busy project doesn't push every
 * other project off the screen — the rest stay one click away, in that project's own inbox. */
const GATES_SHOWN = 10;
const QUESTIONS_SHOWN = 12;

/** One registered project's share of the hub-wide needs-you feed: every gate (every gate type,
 * including a backlog proposal's — see src/lib/hub.ts) grouped by band exactly as a single
 * project's own inbox groups them, and separately, stories with an open question. A story can be
 * in both lists — parked and asking a question are independent facts about it. */
interface ProjectNeeds {
  project: string;
  projectName: string;
  gates: HubGateItem[];
  questions: HubQuestionItem[];
}

function groupNeedsByProject(data: HubNeedsYou): ProjectNeeds[] {
  const byProject = new Map<string, ProjectNeeds>();
  const groupFor = (id: string, name: string) => {
    let g = byProject.get(id);
    if (!g) { g = { project: id, projectName: name, gates: [], questions: [] }; byProject.set(id, g); }
    return g;
  };
  for (const gate of data.gates) groupFor(gate.project, gate.projectName).gates.push(gate);
  for (const q of data.questions) groupFor(q.project, q.projectName).questions.push(q);
  // Busiest project first: the one needing the most attention leads.
  return [...byProject.values()].sort((a, b) => (b.gates.length + b.questions.length) - (a.gates.length + a.questions.length));
}

export function HubHome() {
  const projects = useQuery({ queryKey: ['hub', 'projects'], queryFn: api.hub.projects, retry: false, refetchInterval: 15_000 });
  const needsYou = useQuery({ queryKey: ['hub', 'needs-you'], queryFn: api.hub.needsYou, retry: false, refetchInterval: 15_000 });

  const known = (projects.data ?? []).filter((p) => !p.missing);
  const missingCount = (projects.data ?? []).filter((p) => p.missing).length;
  const loading = projects.isLoading || needsYou.isLoading;
  const groups = useMemo(() => (needsYou.data ? groupNeedsByProject(needsYou.data) : []), [needsYou.data]);

  return (
    <PageLayout icon={Boxes} title="Codeloop" description="Every registered project, on one board.">
      <div className="flex flex-col gap-6">
        {loading ? (
          <PageSkeleton statCards={0} showToolbar={false} tableRows={3} />
        ) : known.length === 0 ? (
          <EmptyState icon={Boxes} title="No projects registered yet" description="Run codeloop serve or codeloop init in a project to add it here." />
        ) : (
          <>
            <section>
              <SectionHeading icon={Boxes} title="Projects" />
              <ProjectGrid projects={known} />
              {missingCount > 0 && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertCircle className="size-3.5" /> {missingCount} registered project{missingCount === 1 ? '' : 's'} no longer on disk. <code>codeloop projects remove &lt;id&gt;</code> drops one.
                </p>
              )}
            </section>
            <section>
              <SectionHeading icon={Lock} title="Needs you" />
              {groups.length === 0 ? (
                <EmptyState compact icon={CheckCircle2} title="Nothing needs you" description="A gate or a question waiting in any project shows up here." />
              ) : (
                <div className="flex flex-col gap-4">
                  {groups.map((g) => <ProjectNeedsCard key={g.project} group={g} />)}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </PageLayout>
  );
}

function ProjectGrid({ projects }: { projects: ListedProject[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <a key={p.id} href={`/p/${encodeURIComponent(p.id)}/`} className="block" data-testid={`project-card-${p.id}`}>
          <EntityCard
            name={p.name}
            description={p.path}
            icon={Boxes}
            className="h-full transition hover:border-primary/40 hover:shadow-md"
            footer={
              // The same two numbers the sidebar badge and the project's own inbox page show —
              // one definition each, computed once in src/lib/hub.ts (`counts`), never re-added
              // from a different list here.
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                <MetaChip label="Active" value={String(p.counts?.active ?? 0)} />
                <MetaChip label="Waiting on you" value={String(p.counts?.waitingOnYou ?? 0)} tone={p.counts?.waitingOnYou ? 'warn' : 'default'} />
                <MetaChip label="Stories with questions" value={String(p.counts?.storiesWithQuestions ?? 0)} />
                <MetaChip label="Stuck" value={String(p.counts?.stuck ?? 0)} tone={p.counts?.stuck ? 'bad' : 'default'} />
              </div>
            }
          />
        </a>
      ))}
    </div>
  );
}

/** One project's rail card in the "Needs you" list: every gate grouped by band exactly as a
 * project's own inbox groups them (components/shared/inbox-view.tsx — the server's pick order, same `groupByBand`,
 * P1 first, no gate type filtered out), each row linking into that project's real card page — a
 * full navigation, so the Answer/Approve controls there are the real ones, not a copy built for
 * the hub (a hub-wide CardDrawer can't scope its writes to the right project; see app-shell.tsx). */
function ProjectNeedsCard({ group }: { group: ProjectNeeds }) {
  const ranked = group.gates;
  const shown = ranked.slice(0, GATES_SHOWN);
  const bands = groupByBand(shown);
  const hiddenGates = ranked.length - shown.length;
  const inboxHref = `/p/${encodeURIComponent(group.project)}/inbox/`;
  const cardHref = (id: string) => `/p/${encodeURIComponent(group.project)}/cards/${encodeURIComponent(id)}/`;

  return (
    <AttributeCard
      title={group.projectName}
      icon={Lock}
      testId={`hub-needs-${group.project}`}
      action={
        <Button size="xs" variant="outline" nativeButton={false} render={<a href={inboxHref} />}>
          Open inbox
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {bands.map((g) => (
          <section key={g.band}>
            <div className="flex items-center gap-2 border-b-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {g.band === 'none' ? <span>Unranked</span> : <><BandChip band={g.band} /><span className="normal-case tracking-normal">{BAND_LABEL[g.band].split(' · ')[1]}</span></>}
              <b className="font-semibold text-foreground tabular-nums">{g.cards.length}</b>
            </div>
            {g.cards.map((c) => (
              <FieldRow
                key={c.id}
                label={c.id}
                value={<a href={cardHref(c.id)} className="truncate text-left hover:underline">{c.title}</a>}
                adornment={
                  <span className="flex items-center gap-1.5">
                    {c.feature ? <MetaChip label="Feature" value={c.feature} className="hidden max-w-[10rem] lg:inline-flex [&>span:last-child]:truncate" /> : null}
                    {typeof c.score === 'number' ? <span className="text-xs text-muted-foreground tabular-nums">{c.score}</span> : null}
                    <ToneBadge card={c} />
                    <Button size="xs" nativeButton={false} render={<a href={cardHref(c.id)} />}>Review</Button>
                  </span>
                }
                testId={`hub-gate-row-${c.id}`}
              />
            ))}
          </section>
        ))}
        {hiddenGates > 0 && (
          <p className="text-xs text-muted-foreground">
            {hiddenGates} more wait. <a className="underline" href={inboxHref}>Open inbox</a>
          </p>
        )}

        {group.questions.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t pt-2">
            {group.questions.slice(0, QUESTIONS_SHOWN).map((q) => (
              <FieldRow
                key={q.id}
                icon={HelpCircle}
                label={q.id}
                value={<a href={cardHref(q.id)} className="truncate text-left hover:underline">{q.title}</a>}
                adornment={<span className="text-xs text-muted-foreground">{q.open} open question{q.open === 1 ? '' : 's'}</span>}
              />
            ))}
            {group.questions.length > QUESTIONS_SHOWN && (
              <p className="text-xs text-muted-foreground">
                {group.questions.length - QUESTIONS_SHOWN} more {group.questions.length - QUESTIONS_SHOWN === 1 ? 'story has' : 'stories have'} questions.{' '}
                <a className="underline" href={inboxHref}>Open inbox</a>
              </p>
            )}
          </div>
        )}
      </div>
    </AttributeCard>
  );
}
