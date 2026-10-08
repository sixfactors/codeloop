'use client';

// First-run setup without a terminal: three steps as cards. Detect reads what the repo looks like,
// Index skills adopts the skill folders found, Agent shows whether an unattended agent is
// configured and the exact config lines to add (never a secret). Each card reads from
// GET /api/setup/status; the only writes are POST /api/setup/detect and POST /api/setup/adopt.
// The shell sends a not-yet-initialised project here; afterwards Settings links to it.

import { useState } from 'react';
import { Bot, Check, FolderSearch, Rocket, ScanSearch, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CliFallback } from '@/components/shared/cli-fallback';
import { CopyButton } from '@/components/shared/copy-button';
import { EmptyState } from '@/components/shared/empty-state';
import { FieldRow } from '@/components/shared/field-row';
import { InlineError } from '@/components/shared/inline-error';
import { PageLayout } from '@/components/shared/page-layout';
import { isMissing, useCards, useConfig, useSetupAdopt, useSetupDetect, useSetupStatus } from '@/hooks/use-api';
import { AGENT_SNIPPET } from '@/lib/agent-snippet';
import { routes } from '@/lib/routes';
import { toast } from '@/lib/toast';
import type { SetupAdopt, SetupDetect } from '@/lib/types';

function StepBadge({ done, label }: { done: boolean; label?: string }) {
  return done
    ? <Badge variant="outline" className="rounded-full border-transparent bg-success/15 text-success"><Check className="size-3" />{label ?? 'done'}</Badge>
    : <Badge variant="outline" className="rounded-full">{label ?? 'to do'}</Badge>;
}

function DetectResult({ d }: { d: SetupDetect }) {
  const scripts = Object.entries(d.scripts ?? {}).filter(([, v]) => v);
  return (
    <div className="flex flex-col gap-3" data-testid="setup-detected">
      <div>
        <FieldRow label="Stack" value={d.stack.description || d.stack.stack} adornment={d.stack.matchedFile ? <span className="font-mono text-[11px] text-muted-foreground">{d.stack.matchedFile}</span> : undefined} />
        <FieldRow label="Frameworks" value={d.frameworks.join(', ')} emptyHint="none found" />
        <FieldRow label="Packages" value={d.packageManager ?? undefined} emptyHint="—" />
        <FieldRow label="Tools" value={d.tools.join(', ')} emptyHint="no agent folders" />
        <FieldRow label="Test" value={d.testCommand} mono emptyHint="npm test" />
      </div>
      {scripts.length ? (
        <Table>
          <TableHeader><TableRow><TableHead>Script</TableHead><TableHead>Runs</TableHead></TableRow></TableHeader>
          <TableBody>{scripts.map(([k, v]) => <TableRow key={k}><TableCell className="font-medium">{k}</TableCell><TableCell className="font-mono text-xs">{v}</TableCell></TableRow>)}</TableBody>
        </Table>
      ) : null}
      {d.qualityChecks.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">{d.qualityChecks.length} quality checks for config.yaml</summary>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono">{d.qualityChecks.map((q) => <li key={q.name}><span className="text-foreground">{q.name}</span> <span className="text-muted-foreground">{q.command}</span></li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

// The folders `codeloop adopt` scans when none is named (src/lib/skills.ts defaultSkillDirs).
const SKILL_DIRS = ['.claude/skills', '.claude/commands', '.cursor/commands', '.agents/skills', '~/.claude/skills', '~/.claude/commands'];

export default function SetupPage() {
  const status = useSetupStatus();
  const config = useConfig();
  const { payload } = useCards();
  const owner = Boolean(payload?.owner);
  const detect = useSetupDetect();
  const adopt = useSetupAdopt();
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const detected = detect.data ?? null;
  const adopted: SetupAdopt | null = adopt.data ?? null;
  const skillCount = adopted?.indexed ?? status.data?.skillsIndexed ?? 0;
  const indexed = skillCount > 0;
  const cfgAgents = (config.data as { agents?: Record<string, unknown> } | undefined)?.agents;
  const agentNames = status.data ? status.data.agents : cfgAgents ? Object.keys(cfgAgents).filter((k) => k !== 'default') : [];
  const agentConfigured = status.data ? status.data.agentsConfigured > 0 : agentNames.length > 0;
  const agentDefault = cfgAgents && typeof cfgAgents.default === 'string' ? cfgAgents.default : agentNames.length === 1 ? agentNames[0] : undefined;
  const snippet = AGENT_SNIPPET;
  const chosen = SKILL_DIRS.filter((f) => picked[f] ?? true);

  const description = 'Three steps, each a card. Reads come from the project; the two buttons write through the API, nothing else does.';
  const missing = Boolean(status.error) && isMissing(status.error);

  // isPending, not isLoading: the server render has no data and is not fetching, so isLoading differs from the client's first render.
  if (status.isPending) return <PageLayout icon={Rocket} title="Set up this project" description={description}><div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}</div></PageLayout>;

  return (
    <PageLayout
      icon={Rocket}
      title="Set up this project"
      description={description}
      badge={status.data ? <StepBadge done={status.data.initialised} label={status.data.initialised ? 'initialised' : 'not initialised'} /> : null}
      actions={<Button size="sm" variant="outline" nativeButton={false} render={<a href={routes.settings} />}><Settings />Settings</Button>}
    >
      {missing ? (
        <div className="flex flex-col gap-4">
          <EmptyState icon={Rocket} title="Setup is not served yet" description="GET /api/setup/status, POST /api/setup/detect and POST /api/setup/adopt are being added. Until they land, the three steps run from the terminal." testId="setup-missing" />
          <CliFallback reason="Detect the stack and write .codeloop" command="codeloop init" />
          <CliFallback reason="Index the skill folders" command="codeloop adopt" testId="cli-fallback-adopt" />
        </div>
      ) : status.error ? (
        <InlineError title="Setup status failed to load" error={status.error} onRetry={() => status.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3" data-testid="setup-steps">
          <Card data-testid="setup-detect">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><ScanSearch className="size-4 text-muted-foreground" />1 · Detect</span><StepBadge done={Boolean(detected)} /></CardTitle>
              <CardDescription>What the repo looks like: language, framework, the scripts and commands the lanes will call.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {detected ? <DetectResult d={detected} /> : <p className="text-sm text-muted-foreground">Nothing detected yet.</p>}
              {detect.error ? <InlineError title="Detect failed" error={detect.error} /> : null}
              <Button size="sm" disabled={!owner || detect.isPending} onClick={() => detect.mutate(undefined, { onSuccess: () => toast.success('Detected') })} data-testid="setup-detect-run"><ScanSearch />{detect.isPending ? 'Detecting…' : detected ? 'Detect again' : 'Detect'}</Button>
            </CardContent>
          </Card>

          <Card data-testid="setup-skills">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><FolderSearch className="size-4 text-muted-foreground" />2 · Index skills</span><StepBadge done={indexed} label={indexed && skillCount !== undefined ? `${skillCount} skills` : undefined} /></CardTitle>
              <CardDescription>The skill folders found in the repo. Adopt indexes them so lanes can name a skill per stage.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="flex flex-col gap-1.5" data-testid="setup-skill-folders">
                {SKILL_DIRS.map((f) => (
                  <li key={f} className="flex items-center gap-2 font-mono text-xs">
                    <Checkbox checked={picked[f] ?? true} onCheckedChange={(v: boolean) => setPicked({ ...picked, [f]: v })} aria-label={`Adopt ${f}`} disabled={!owner} />
                    <span className="truncate">{f}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground" data-testid="setup-skill-counts">
                <Badge variant="secondary" className="rounded-full">{skillCount} indexed</Badge>
                {adopted ? <><Badge variant="outline" className="rounded-full">{adopted.added} added</Badge><Badge variant="outline" className="rounded-full">{adopted.updated} updated</Badge><Badge variant="outline" className="rounded-full">{adopted.removed} removed</Badge></> : null}
                {status.data ? <Badge variant="outline" className="rounded-full">{status.data.lanes} lanes</Badge> : null}
              </div>
              {adopted?.duplicates?.length ? <p className="text-xs text-warning-foreground dark:text-warning">{adopted.duplicates.length} skill names appear in more than one folder: {adopted.duplicates.map((d) => d.name).join(', ')}.</p> : null}
              {adopt.error ? <InlineError title="Adopt failed" error={adopt.error} /> : null}
              <Button
                size="sm"
                disabled={!owner || adopt.isPending}
                onClick={() => adopt.mutate({ from: chosen.length === SKILL_DIRS.length ? undefined : chosen }, { onSuccess: (r) => toast.success(`Indexed ${r.indexed} skills (${r.added} added)`) })}
                data-testid="setup-adopt-run"
              >
                <FolderSearch />{adopt.isPending ? 'Indexing…' : indexed ? 'Adopt again' : 'Adopt'}
              </Button>
            </CardContent>
          </Card>

          <Card data-testid="setup-agent">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Bot className="size-4 text-muted-foreground" />3 · Agent</span><StepBadge done={agentConfigured} label={agentConfigured ? 'configured' : 'not configured'} /></CardTitle>
              <CardDescription>The command “Run this stage” starts. No key or token goes in this file; the agent reads its own.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {agentConfigured ? (
                <div>
                  <FieldRow label="Agents" value={agentNames.join(', ')} />
                  <FieldRow label="Default" value={agentDefault} emptyHint="first configured" />
                </div>
              ) : <p className="text-sm text-muted-foreground">Add these lines to <code className="font-mono text-xs">.codeloop/config.yaml</code>, then reload:</p>}
              <div className="flex flex-col gap-2">
                <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-4" data-testid="setup-agent-snippet">{snippet}</pre>
                <CopyButton text={snippet} variant="outline" size="sm" className="self-start" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {!owner && !missing ? <p className="mt-4 text-xs text-muted-foreground">Read only: the owner runs Detect and Adopt from their own board.</p> : null}
    </PageLayout>
  );
}
