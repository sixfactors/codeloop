'use client';

// What this project runs on. Lanes are read-only here: a change is proposed on the lane's wiki
// page, never by editing YAML from the board. Personas are wiki pages under
// .codeloop/wiki/personas, written through the pages route. Agents are read-only from config,
// with the lines to add when none is set.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bot, BookOpen, Plus, Rocket, Settings, Trash2, Users } from 'lucide-react';
import { PageLayout } from '@/components/shared/page-layout';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { CopyButton } from '@/components/shared/copy-button';
import { CliFallback } from '@/components/shared/cli-fallback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isMissing, useCards, useConfig, useDeletePage, useLanes, usePages, useSavePage } from '@/hooks/use-api';
import { AGENT_SNIPPET } from '@/lib/agent-snippet';
import { routes } from '@/lib/routes';
import { toast } from '@/lib/toast';

const PERSONAS_FOLDER = 'personas';
const slugOf = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** `personas:` in config.yaml: a list of names, a list of `{ name, pains }`, or a map keyed by name. */
function configPersonas(cfg: unknown): { name: string; pains?: string }[] {
  const list = (cfg as { personas?: unknown })?.personas;
  if (Array.isArray(list)) return list.map((p) => (typeof p === 'string' ? { name: p } : { name: String((p as { name?: string; id?: string }).name ?? (p as { id?: string }).id ?? ''), pains: (p as { pains?: string }).pains })).filter((p) => p.name);
  if (list && typeof list === 'object') return Object.entries(list as Record<string, { pains?: string } | string>).map(([name, v]) => ({ name, pains: typeof v === 'string' ? v : v?.pains }));
  return [];
}

function PersonasCard({ owner }: { owner: boolean }) {
  const config = useConfig();
  const pages = usePages({ folder: PERSONAS_FOLDER });
  const save = useSavePage();
  const remove = useDeletePage();
  const [name, setName] = useState('');
  const [pains, setPains] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const fromConfig = useMemo(() => configPersonas(config.data), [config.data]);
  const fromPages = pages.pages;
  const pageSlugs = new Set(fromPages.map((p) => p.id.split('/').pop()?.replace(/\.md$/, '')));
  const rows = [
    ...fromPages.map((p) => ({ slug: p.id.split('/').pop()!.replace(/\.md$/, ''), name: p.title, pains: String(p.frontmatter?.pains ?? p.excerpt ?? ''), path: p.id, source: 'wiki' as const })),
    ...fromConfig.filter((p) => !pageSlugs.has(slugOf(p.name))).map((p) => ({ slug: slugOf(p.name), name: p.name, pains: p.pains ?? '', path: '', source: 'config' as const })),
  ];
  const pagesMissing = Boolean(pages.error) && isMissing(pages.error);

  const add = async () => {
    const title = name.trim();
    if (!title) return;
    const slug = slugOf(title);
    const path = `.codeloop/wiki/personas/${slug}.md`;
    try {
      await save.mutateAsync({ path, write: { frontmatter: { title, persona: slug, ...(pains.trim() ? { pains: pains.trim() } : {}) }, body: `## Who\n\n${title}\n\n## Pains\n\n${pains.trim() || '-'}\n` } });
      toast.success(`Added persona ${title}`);
      setName(''); setPains('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not write the persona page');
    }
  };

  return (
    <Card data-testid="settings-personas">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" />Personas</CardTitle>
        <CardDescription>Who the stories are for. Each is a page under .codeloop/wiki/personas; the story check also accepts the names under personas: in config.yaml.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pages.error && !pagesMissing ? <InlineError title="Persona pages failed to load" error={pages.error} onRetry={() => pages.refetch()} /> : null}
        {rows.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Persona</TableHead><TableHead>Pains</TableHead><TableHead>Source</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.source}-${r.slug}`} data-testid={`persona-${r.slug}`}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="max-w-72 truncate text-xs text-muted-foreground" title={r.pains}>{r.pains || '—'}</TableCell>
                  <TableCell><Badge variant="outline" className="rounded-full">{r.source}</Badge></TableCell>
                  <TableCell className="text-right">
                    {r.source === 'wiki' ? (
                      <span className="inline-flex gap-1">
                        <Button size="icon-xs" variant="ghost" aria-label={`Open ${r.name}`} nativeButton={false} render={<Link href={routes.wiki(r.path)} />}><BookOpen /></Button>
                        <Button size="icon-xs" variant="ghost" className="text-destructive" aria-label={`Remove ${r.name}`} disabled={!owner} onClick={() => setConfirm(r.path)}><Trash2 /></Button>
                      </span>
                    ) : <span className="text-xs text-muted-foreground">config.yaml</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : <p className="text-sm text-muted-foreground">No personas yet. The board knows the built-in ones (founder, developer, visitor…); add the product’s own here.</p>}
        {pagesMissing ? (
          <CliFallback reason="Persona pages are written through the wiki route, which this server does not serve; add one with" command="codeloop wiki capture personas <name>" />
        ) : (
          <form className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); void add(); }} data-testid="persona-form">
            <div className="flex flex-col gap-1.5"><Label htmlFor="persona-name">Name</Label><Input id="persona-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="finance lead" disabled={!owner} data-testid="persona-name" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="persona-pains">Pains</Label><Input id="persona-pains" value={pains} onChange={(e) => setPains(e.target.value)} placeholder="month-end takes days; exports are manual" disabled={!owner} data-testid="persona-pains" /></div>
            <Button type="submit" size="sm" disabled={!owner || !name.trim() || save.isPending} data-testid="persona-add"><Plus />{save.isPending ? 'Adding…' : 'Add persona'}</Button>
          </form>
        )}
      </CardContent>
      <AlertDialog open={Boolean(confirm)} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this persona?</AlertDialogTitle>
            <AlertDialogDescription>{confirm} is deleted from the wiki. Cards naming it keep the name.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { const path = confirm!; setConfirm(null); remove.mutate({ path }, { onSuccess: () => toast.success('Persona removed'), onError: (e) => toast.error((e as Error).message) }); }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function AgentsCard() {
  const config = useConfig();
  const agents = (config.data as { agents?: Record<string, unknown> } | undefined)?.agents;
  const names = agents ? Object.keys(agents).filter((k) => k !== 'default') : [];
  const def = agents && typeof agents.default === 'string' ? agents.default : undefined;
  return (
    <Card data-testid="settings-agents">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bot className="size-4 text-muted-foreground" />Agents</CardTitle>
        <CardDescription>What “Run this stage” and the scheduled run start. Read from agents: in .codeloop/config.yaml; keys and tokens stay in the agent’s own login.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {names.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Command</TableHead><TableHead>Timeout</TableHead><TableHead>Runs / day</TableHead></TableRow></TableHeader>
            <TableBody>
              {names.map((n) => {
                const a = agents![n] as { cmd?: string; timeout_minutes?: number; max_runs_per_day?: number };
                return (
                  <TableRow key={n}>
                    <TableCell className="font-medium">{n}{def === n ? <Badge variant="secondary" className="ml-2 rounded-full">default</Badge> : null}</TableCell>
                    <TableCell className="font-mono text-xs">{a.cmd ?? '—'}</TableCell>
                    <TableCell className="text-xs">{a.timeout_minutes ?? 20} min</TableCell>
                    <TableCell className="text-xs">{a.max_runs_per_day ?? 20}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="agents-none">No agent is configured, so “Run this stage” stays off. Add this block to .codeloop/config.yaml:</p>
        )}
        <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-4">{AGENT_SNIPPET}</pre>
        <CopyButton text={AGENT_SNIPPET} variant="outline" size="sm" className="self-start" />
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const lanes = useLanes();
  const config = useConfig();
  const { payload } = useCards();
  const owner = Boolean(payload?.owner);
  const cfg = (config.data ?? {}) as Record<string, unknown>;
  const shown = Object.entries(cfg).filter(([k]) => k !== 'agents' && k !== 'personas');
  return (
    <PageLayout
      icon={Settings}
      title="Settings"
      description="What this project runs on: its lanes, stages and gates, who the stories are for, and the agent that runs a stage. Lanes come from files under .codeloop; propose a change on the lane’s wiki page."
      actions={<Button size="sm" variant="outline" nativeButton={false} render={<Link href={routes.setup} />} data-testid="settings-setup"><Rocket />Setup</Button>}
    >
      <div className="flex flex-col gap-4">
      <Card data-testid="settings-lanes">
        <CardHeader><CardTitle>Lanes</CardTitle><CardDescription>{lanes.fromApi ? 'From /api/lanes' : 'From the cards payload until /api/lanes is served'}. Read only here; each lane’s wiki page holds the proposals.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Lane</TableHead><TableHead>Stages</TableHead><TableHead>WIP</TableHead><TableHead>Metric</TableHead><TableHead className="w-40" /></TableRow></TableHeader>
            <TableBody>
              {lanes.data.map((l) => (
                <TableRow key={l.id} data-testid={`lane-row-${l.id}`}>
                  <TableCell className="font-medium">{l.id}{l.version ? <span className="ml-1 text-xs text-muted-foreground">v{l.version}</span> : null}</TableCell>
                  <TableCell className="flex flex-wrap gap-1">{l.stages.map((s) => <Badge key={s.id} variant="outline" className={s.gate ? 'rounded-full border-transparent bg-warning/15 text-warning-foreground dark:text-warning' : 'rounded-full'}>{s.id}{s.gate ? ' · gate' : ''}</Badge>)}</TableCell>
                  <TableCell>{l.wip ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{typeof l.metric === 'string' ? l.metric : l.metric ? (l.metric as { name?: string }).name : '—'}</TableCell>
                  <TableCell className="text-right"><Button size="xs" variant="ghost" nativeButton={false} render={<Link href={routes.lanePage(l.id)} />} data-testid={`lane-propose-${l.id}`}><BookOpen />Propose a change</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <PersonasCard owner={owner} />
      <AgentsCard />
      <Card>
        <CardHeader><CardTitle>Project</CardTitle><CardDescription>The rest of .codeloop/config.yaml as the server reads it.</CardDescription></CardHeader>
        <CardContent>
          {config.error ? (isMissing(config.error) ? <EmptyState compact icon={Settings} title="Config is not served yet" description="GET /api/config is being added." /> : <InlineError title="Config failed to load" error={config.error} onRetry={() => config.refetch()} />) : (
            <Table>
              <TableBody>
                {shown.map(([k, v]) => <TableRow key={k}><TableCell className="font-medium">{k}</TableCell><TableCell className="font-mono text-xs">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</TableCell></TableRow>)}
                {!shown.length && !config.isLoading ? <TableRow><TableCell colSpan={2} className="text-muted-foreground">Empty config.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </div>
    </PageLayout>
  );
}
