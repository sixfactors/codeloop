'use client';

// codeloop-mock-app: c-322
// Mock for c-322 A team shares one hosted board through Protobox. Delete or keep it as the spec's `mock:` line says (`codeloop mock cleanup c-322`).
// Codeloop Cloud coordinates agents that people run on their own machines: it holds the board, the wiki
// and knowledge base, skills and agent presence. No screen here starts an agent, merges or deploys.
// Every screen is stacked rather than tabbed: the mocks gallery measures each data-screen section, and
// a hidden tab panel has no size to measure. Tabs inside one screen are fine, the section keeps its size.
// The look follows the Protobox web app; the traits it borrows are listed in the Design notes block
// at the bottom of the page, outside the screens.
import { useState } from 'react';
import {
  BookOpen, Bot, Check, CheckCircle2, Cloud, Eye, EyeOff, FolderGit2, GitBranch, Globe, Home, Hourglass, KeyRound, Laptop, Link2, Lock,
  Minus, Palette, Plug, Settings, ShieldCheck, Table2, Terminal, UserPlus, UserRound, Users, XCircle,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PageLayout } from '@/components/shared/page-layout';
import { AttributeCard, RecordStatRow, SectionHeading } from '@/components/shared/record-layout';
import { FieldRow } from '@/components/shared/field-row';
import { Holder } from '@/components/shared/holder';
import { StatePill } from '@/components/shared/state-pill';
import { StoryKey } from '@/components/shared/story-key';
import { StorySummary } from '@/components/shared/story-summary';
import { SearchAndFilter, EMPTY_SEARCH, type SearchAndFilterValue } from '@/components/shared/search-and-filter';
import { EmptyState } from '@/components/shared/empty-state';
import { CopyButton } from '@/components/shared/copy-button';
import { CliFallback } from '@/components/shared/cli-fallback';
import { cn } from '@/lib/utils';
import type { StoryState } from '@/lib/types';
import {
  agents, connect, connectAgents, deviceLink, home, people, permissions, personName, plans, projects, projectSettings, publicView, publicWiki,
  ROLE_LABEL, signUp, story, type Agent, type AgentState, type Role,
} from './mock-data';

const NAV = [
  { id: 'sign-up', label: 'Sign up' },
  { id: 'device-link', label: 'Link a machine' },
  { id: 'team-home', label: 'Team home' },
  { id: 'agents', label: 'Agents' },
  { id: 'story-page', label: 'Story' },
  { id: 'connect-agents', label: 'Connect your agents' },
  { id: 'people-and-roles', label: 'People and roles' },
  { id: 'connect-project', label: 'Connect a project' },
  { id: 'project-settings', label: 'Project settings' },
  { id: 'public-view', label: 'Public page' },
  { id: 'plans', label: 'Open source and Cloud' },
  { id: 'design-notes', label: 'Design notes' },
];

// The sidebar every signed-in screen shares, grouped the way Protobox groups its own.
type NavKey = 'home' | 'agents' | 'stories' | 'connect-agents' | 'people' | 'projects' | 'settings';
const SIDEBAR: { group: string; items: { key: NavKey; label: string; icon: typeof Home }[] }[] = [
  { group: 'Work', items: [{ key: 'home', label: 'Home', icon: Home }, { key: 'stories', label: 'Stories', icon: Table2 }, { key: 'agents', label: 'Agents', icon: Bot }] },
  { group: 'Team', items: [{ key: 'connect-agents', label: 'Connect your agents', icon: Plug }, { key: 'people', label: 'People and roles', icon: Users }, { key: 'projects', label: 'Projects', icon: FolderGit2 }, { key: 'settings', label: 'Settings', icon: Settings }] },
];

// Agent tiles: ai for working, amber with an hourglass for waiting or stalled, green for done.
const AGENT_TONE: Record<AgentState, string> = {
  working: 'border-transparent bg-ai/15 text-ai',
  'waiting on owner': 'border-transparent bg-warning/15 text-warning-foreground dark:text-warning',
  stalled: 'border-transparent bg-warning/15 text-warning-foreground dark:text-warning',
  done: 'border-transparent bg-success/15 text-success',
};

const AGENT_LABEL: Record<AgentState, string> = { working: 'Working', 'waiting on owner': 'Waiting on owner', stalled: 'Stalled', done: 'Done' };

const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** A person is round, an agent is square (Holder); the same rule as the board. */
function PersonAvatar({ id, name }: { id?: string; name?: string }) {
  return (
    <Avatar className="size-5 rounded-full">
      <AvatarFallback className="rounded-full text-[10px] font-semibold">{initials(name ?? personName(id ?? ''))}</AvatarFallback>
    </Avatar>
  );
}

function AgentStateBadge({ state }: { state: AgentState }) {
  const waits = state === 'waiting on owner' || state === 'stalled';
  return (
    <Badge variant="outline" className={cn('shrink-0 gap-1 rounded-full', AGENT_TONE[state])}>
      {waits ? <Hourglass className="size-3" aria-hidden /> : null}
      {AGENT_LABEL[state]}
    </Badge>
  );
}

/** The story pill, with the hourglass in front whenever the story waits on a person or is stuck. */
function StoryPill({ display, agent }: { display: StoryState; agent?: string }) {
  const waits = display.state === 'needs-you' || display.health === 'stuck';
  return (
    <span className="inline-flex items-center gap-1">
      {waits ? <Hourglass className="size-3.5 text-warning" aria-hidden /> : null}
      <StatePill display={display} agent={agent} />
    </span>
  );
}

type RowTone = 'plain' | 'wait' | 'bad' | 'ok';

/** A muted size-8 tile carrying the row's type, the way Protobox opens every row. */
function RowTile({ icon: Icon, tone = 'plain' }: { icon: typeof Home; tone?: RowTone }) {
  return (
    <ItemMedia
      className={cn(
        'size-8 rounded-md',
        tone === 'plain' && 'bg-muted text-muted-foreground',
        tone === 'wait' && 'bg-warning/15 text-warning',
        tone === 'bad' && 'bg-destructive/10 text-destructive',
        tone === 'ok' && 'bg-success/15 text-success',
      )}
    >
      <Icon className="size-4" aria-hidden />
    </ItemMedia>
  );
}

/** One row: type tile, friendly title, then a muted sub-line that carries the key. */
function Row({ icon, tone, title, sub, trailing }: { icon: typeof Home; tone?: RowTone; title: React.ReactNode; sub?: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <Item size="sm" className="rounded-none px-0">
      <RowTile icon={icon} tone={tone} />
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full min-w-0"><span className="truncate">{title}</span></ItemTitle>
        {sub ? <ItemDescription className="truncate text-xs">{sub}</ItemDescription> : null}
      </ItemContent>
      {trailing ? <ItemActions className="flex-wrap justify-end">{trailing}</ItemActions> : null}
    </Item>
  );
}

/** Rows divided by a hairline instead of each boxed in its own border. */
function Rows({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col divide-y">{children}</div>;
}

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">{n}</span>;
}

/** A copy-ready block of config, inset on the raised card. */
function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <CopyButton text={code} variant="outline" size="sm" className="ml-auto" />
      </div>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre">{code}</pre>
    </div>
  );
}

/** The terminal pane, inset like a code block, with the lines the CLI prints. */
function TerminalLines({ lines, highlight }: { lines: string[]; highlight?: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre text-muted-foreground">
      {lines.map((l, i) => {
        const hit = Boolean(highlight && l.includes(highlight));
        return <span key={i} className={cn('block', (i === 0 || hit) && 'text-foreground', hit && 'font-semibold')}>{l}</span>;
      })}
    </pre>
  );
}

/** The quiet amber line a waiting state reads as. */
function WaitingLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-warning-foreground dark:text-warning">
      <Hourglass className="size-4 shrink-0 text-warning" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** The signed-in app around a screen: Protobox's grouped sidebar and its icon-tile page header. */
function AppFrame({ active, icon: Icon, title, description, actions, children }: { active: NavKey; icon: typeof Home; title: string; description: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:grid-cols-[208px_1fr]">
      <nav className="hidden flex-col gap-4 border-r bg-sidebar p-3 lg:flex" aria-label="Cloud sidebar">
        <div className="flex items-center gap-2 px-1">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Cloud className="size-4" aria-hidden /></span>
          <span className="grid leading-tight"><span className="text-sm font-semibold">Codeloop Cloud</span><span className="text-xs text-muted-foreground">Ruiz and Co</span></span>
        </div>
        {SIDEBAR.map((g) => (
          <div key={g.group} className="grid gap-0.5">
            <span className="px-2 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{g.group}</span>
            {g.items.map((it) => (
              <Button key={it.key} variant="ghost" size="sm" className={cn('justify-start font-normal', active === it.key && 'bg-accent font-medium text-accent-foreground')} aria-current={active === it.key ? 'page' : undefined}>
                <it.icon aria-hidden />{it.label}
              </Button>
            ))}
          </div>
        ))}
        <div className="mt-auto flex items-center gap-2 px-1 pt-4">
          <PersonAvatar id="ana" />
          <span className="grid leading-tight"><span className="text-sm">Ana Ruiz</span><span className="text-xs text-muted-foreground">Owner</span></span>
        </div>
      </nav>
      <div className="flex min-w-0 flex-col gap-6 bg-muted/40 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}

/** One screen of the mock: a heading and one line saying what the screen shows, then the screen. */
function Screen({ title, icon, note, children }: { title: string; icon: typeof Home; note: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <div>
        <SectionHeading title={title} icon={icon} className="mb-1" />
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      {children}
    </div>
  );
}

function SignUp() {
  return (
    <div className="flex justify-center rounded-xl bg-muted/50 p-4 sm:p-10">
      <div className="grid w-full max-w-3xl gap-4">
        <Card className="py-0">
          <CardContent className="grid p-0 md:grid-cols-2">
            <form className="flex flex-col gap-6 p-6 md:p-8" onSubmit={(e) => e.preventDefault()}>
              <div className="grid gap-1 text-center">
                <h3 className="text-2xl font-semibold">Create your account</h3>
                <p className="text-sm text-balance text-muted-foreground">One account for Codeloop Cloud and the Protobox behind it.</p>
              </div>
              <div className="grid gap-3">
                <div className="grid gap-2"><Label htmlFor="su-name">Your name</Label><Input id="su-name" defaultValue={signUp.name} /></div>
                <div className="grid gap-2"><Label htmlFor="su-email">Work email</Label><Input id="su-email" type="email" defaultValue={signUp.email} /></div>
                <div className="grid gap-2"><Label htmlFor="su-password">Password</Label><Input id="su-password" type="password" defaultValue="mock-password" /></div>
                <div className="grid gap-2"><Label htmlFor="su-team">Team name</Label><Input id="su-team" defaultValue={signUp.team} /></div>
              </div>
              <Button type="submit" className="w-full">Create account</Button>
              <div className="flex items-center gap-3 text-xs text-muted-foreground"><Separator className="flex-1" />or<Separator className="flex-1" /></div>
              <Button type="button" variant="outline" className="w-full">Continue with GitHub</Button>
              <p className="text-center text-sm text-muted-foreground">Already use Protobox? <Button type="button" variant="link" size="sm" className="h-auto p-0">Sign in with that account</Button></p>
            </form>
            <div className="hidden flex-col justify-between gap-8 bg-primary p-8 text-primary-foreground md:flex">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary-foreground/20"><Cloud className="size-4" aria-hidden /></span>
                <span className="text-lg font-semibold">Codeloop Cloud</span>
              </div>
              <div className="grid gap-3">
                <h4 className="text-2xl font-semibold">One board for your team and its agents</h4>
                <ul className="grid gap-2 text-sm text-primary-foreground/85">
                  <li>Your agents keep running on your own machines.</li>
                  <li>Cloud holds the board, the wiki, and who is working on what.</li>
                  <li>Any agent connects through one MCP link.</li>
                </ul>
              </div>
              <p className="text-xs text-primary-foreground/70">Works with Claude Code, Cursor and Codex</p>
            </div>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-balance text-muted-foreground">Creating this account also creates your Protobox account, with the same email and password. There is no second sign-up.</p>
      </div>
    </div>
  );
}

function DeviceLink() {
  return (
    <div className="grid gap-4 rounded-xl bg-muted/50 p-4 sm:p-6">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <AttributeCard title="1. In your terminal" icon={Terminal}>
          <div className="grid gap-3">
            <TerminalLines lines={deviceLink.terminal} highlight={deviceLink.code} />
            <WaitingLine>Waiting for you to approve the code in the browser. It expires in {deviceLink.expiresIn}.</WaitingLine>
          </div>
        </AttributeCard>
        <AttributeCard title="2. In your browser" icon={Globe}>
          <div className="grid gap-4">
            <div className="grid gap-1">
              <p className="text-base font-medium">Link this machine to Cloud</p>
              <p className="text-sm text-muted-foreground">Check the code matches the one in your terminal, then approve.</p>
            </div>
            <div className="rounded-md bg-muted py-4 text-center font-mono text-2xl font-semibold tracking-widest">{deviceLink.code}</div>
            <div className="flex flex-col divide-y">
              <FieldRow label="Machine" value={deviceLink.machine} mono icon={Laptop} />
              <FieldRow label="Signed in as" value={signUp.name} valueLeading={<PersonAvatar id="ana" />} />
              <FieldRow label="Team" value={signUp.team} />
            </div>
            <p className="text-xs text-muted-foreground">Only approve a code you can see in your own terminal. Approving saves an agent key on that machine, nothing else.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm"><Check />Approve</Button>
              <Button size="sm" variant="outline">Deny</Button>
            </div>
          </div>
        </AttributeCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success"><Check className="size-6" aria-hidden /></span>
            <div className="grid gap-1">
              <p className="font-medium">This machine is linked</p>
              <p className="text-sm text-muted-foreground">You can close this tab. Agents on {deviceLink.machine} now reach the board.</p>
            </div>
          </CardContent>
        </Card>
        <AttributeCard title="3. Back in your terminal" icon={Terminal}>
          <TerminalLines lines={deviceLink.terminalApproved} />
        </AttributeCard>
      </div>
    </div>
  );
}

function TeamHome() {
  const working = agents.filter((a) => a.state !== 'done');
  return (
    <AppFrame active="home" icon={Home} title="Team home" description="What needs you across every project, and the agents working now.">
      <RecordStatRow
        stats={[
          { label: 'Need you, across 3 projects', value: home.needsYou.length },
          { label: 'Agents on 5 machines', value: working.length },
          { label: 'Failing', value: home.failing.length },
          { label: 'Shipped this week', value: home.shipped.length },
        ]}
      />
      <AttributeCard title={<>Needs you <Count n={home.needsYou.length} /></>} icon={Hourglass}>
        <Rows>
          {home.needsYou.map((s) => (
            <Row
              key={s.id}
              icon={Hourglass}
              tone="wait"
              title={s.title}
              sub={<><span className="font-mono">{s.id}</span> · {s.project} · {s.why} · {s.since}</>}
              trailing={<><StoryPill display={s.display} /><Button size="xs" variant="outline">Open</Button></>}
            />
          ))}
        </Rows>
      </AttributeCard>
      <AttributeCard title={<>Failing <Count n={home.failing.length} /></>} icon={XCircle}>
        <Rows>
          {home.failing.map((s) => (
            <Row key={s.id} icon={XCircle} tone="bad" title={s.title} sub={<><span className="font-mono">{s.id}</span> · {s.project} · {s.why}</>} trailing={<StoryPill display={s.display} />} />
          ))}
        </Rows>
      </AttributeCard>
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <AttributeCard title={<>Agents working now <Count n={working.length} /></>} icon={Bot}>
          <Rows>
            {working.map((a) => (
              <Item key={a.id} size="sm" className="rounded-none px-0">
                <ItemMedia><Holder agent={`${a.kind} on ${a.machine}`} /></ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full min-w-0"><span className="truncate">{a.storyTitle}</span></ItemTitle>
                  <ItemDescription className="truncate text-xs"><span className="font-mono">{a.story}</span> · {a.kind} · {personName(a.person)} on {a.machine} · {a.lastActivity}</ItemDescription>
                </ItemContent>
                <ItemActions><AgentStateBadge state={a.state} /></ItemActions>
              </Item>
            ))}
          </Rows>
        </AttributeCard>
        <AttributeCard title="Shipped this week" icon={CheckCircle2}>
          <Rows>
            {home.shipped.map((s) => (
              <Row key={s.id} icon={CheckCircle2} tone="ok" title={s.title} sub={<><span className="font-mono">{s.id}</span> · {s.project}</>} trailing={<span className="text-xs text-muted-foreground">{s.who} · {s.at}</span>} />
            ))}
          </Rows>
        </AttributeCard>
      </div>
    </AppFrame>
  );
}

function AgentsTable() {
  const [filter, setFilter] = useState<SearchAndFilterValue>(EMPTY_SEARCH);
  const byPerson = filter.facets.person ?? [];
  const byProject = filter.facets.project ?? [];
  const q = filter.q.toLowerCase();
  const rows = agents.filter((a) =>
    (!byPerson.length || byPerson.includes(a.person)) &&
    (!byProject.length || byProject.includes(a.project)) &&
    (!q || `${a.story} ${a.storyTitle} ${a.branch} ${a.machine}`.toLowerCase().includes(q)));
  return (
    <AppFrame active="agents" icon={Bot} title="Agents" description="Every agent the team’s machines report. Agents start and stop on the machine they run on.">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Laptop className="size-4 shrink-0" aria-hidden />Each row was reported by the machine the agent runs on. There is no start button here.</p>
      <SearchAndFilter
        value={filter}
        onChange={setFilter}
        searchPlaceholder="Search story, branch or machine"
        facets={[
          { id: 'person', title: 'Person', options: people.map((p) => ({ label: p.name, value: p.id, count: agents.filter((a) => a.person === p.id).length })) },
          { id: 'project', title: 'Project', options: projects.map((p) => ({ label: p.name, value: p.id, count: agents.filter((a) => a.project === p.id).length })) },
        ]}
        trailing={<span className="text-xs text-muted-foreground tabular-nums">{rows.length} of {agents.length} agents</span>}
      />
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Story</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Person</TableHead>
                <TableHead className="hidden md:table-cell">Branch</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id} className={cn(a.state === 'stalled' && 'bg-warning/10 hover:bg-warning/15')} data-stalled={a.state === 'stalled' || undefined}>
                  <TableCell><span className="grid min-w-0"><span className="max-w-64 truncate">{a.storyTitle}</span><span className="text-xs text-muted-foreground"><StoryKey id={a.story} /> · {a.project}</span></span></TableCell>
                  <TableCell><span className="flex items-center gap-1.5"><Holder agent={`${a.kind} on ${a.machine}`} /><span className="grid"><span>{a.kind}</span><span className="font-mono text-xs text-muted-foreground">{a.machine}</span></span></span></TableCell>
                  <TableCell><span className="flex items-center gap-1.5"><PersonAvatar id={a.person} />{personName(a.person)}</span></TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{a.branch}</TableCell>
                  <TableCell><AgentStateBadge state={a.state} /></TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{a.lastActivity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Card><EmptyState compact icon={Bot} title="No agent matches" description="Clear a filter to see agents from every person and project." /></Card>
      )}
    </AppFrame>
  );
}

function AgentRow({ a, current }: { a: Agent; current?: boolean }) {
  return (
    <Item size="sm" className="rounded-none px-0">
      <ItemMedia><Holder agent={`${a.kind} on ${a.machine}`} /></ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full min-w-0"><span className="truncate">{a.kind} on {a.machine}</span></ItemTitle>
        <ItemDescription className="truncate text-xs">Started by {personName(a.person)} · {a.startedAt} · {a.lastAction}</ItemDescription>
      </ItemContent>
      <ItemActions>{current ? <Badge variant="outline" className="rounded-full">Holds it now</Badge> : null}<AgentStateBadge state={a.state} /></ItemActions>
    </Item>
  );
}

function StoryPage() {
  const list = story.agents.map((id) => agents.find((a) => a.id === id)!);
  const current = list.filter((a) => a.state !== 'done');
  const past = list.filter((a) => a.state === 'done');
  return (
    <AppFrame
      active="stories"
      icon={Table2}
      title={story.title}
      description={`${story.id} · ${story.project}`}
      actions={<StoryPill display={story.display} agent={story.holder.label} />}
    >
      <Card><CardContent><StorySummary cardId={story.id} summary={story.summary} /></CardContent></Card>
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <AttributeCard title="Who has it" icon={UserRound}>
          <div className="flex flex-col divide-y">
            <FieldRow label="Held by" value={story.holder.label} valueLeading={<Holder agent={story.holder.label} />} />
            <FieldRow label="Started by" value={personName(story.holder.person)} valueLeading={<PersonAvatar id={story.holder.person} />} />
            <FieldRow label="Owner" value={personName(story.owner)} valueLeading={<PersonAvatar id={story.owner} />} />
            <FieldRow label="Branch" icon={GitBranch} value={story.branch} mono adornment={<CopyButton text={story.branch} size="icon" />} />
          </div>
        </AttributeCard>
        <AttributeCard title={<>Agents on this story <Count n={list.length} /></>} icon={Bot}>
          <Rows>{current.map((a) => <AgentRow key={a.id} a={a} current />)}</Rows>
          <p className="pt-3 pb-1 text-xs font-medium text-muted-foreground">Earlier</p>
          <Rows>{past.map((a) => <AgentRow key={a.id} a={a} />)}</Rows>
        </AttributeCard>
      </div>
    </AppFrame>
  );
}

function ConnectAgents() {
  return (
    <AppFrame active="connect-agents" icon={Plug} title="Connect your agents" description="One MCP link for every agent the team runs. Cloud coordinates them; it never starts one.">
      <AttributeCard title="Your MCP link" icon={Link2}>
        <div className="grid gap-2">
          <FieldRow label="MCP link" value={connectAgents.mcpLink} mono adornment={<CopyButton text={connectAgents.mcpLink} size="icon" />} />
          <p className="text-xs text-muted-foreground">Any agent with this link and an agent key reads and updates the {connectAgents.team} board.</p>
        </div>
      </AttributeCard>
      <AttributeCard title="Set up an agent" icon={Bot}>
        <Tabs defaultValue="claude-code">
          <TabsList>
            {connectAgents.clients.map((c) => <TabsTrigger key={c.id} value={c.id}>{c.label}</TabsTrigger>)}
          </TabsList>
          {connectAgents.clients.map((c) => (
            <TabsContent key={c.id} value={c.id} className="pt-3">
              <CodeBlock code={c.snippet} label={c.where} />
            </TabsContent>
          ))}
        </Tabs>
        <p className="pt-3 text-xs text-muted-foreground">Each setup reads the agent key from <span className="font-mono">CODELOOP_KEY</span>, which <span className="font-mono">codeloop login</span> saves on the machine.</p>
      </AttributeCard>
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <AttributeCard title="Sign in from the terminal" icon={Terminal}>
          <div className="grid gap-3">
            <CliFallback reason="Links this machine and saves its agent key" command={connectAgents.login} testId="cloud-login" />
            <p className="text-sm text-muted-foreground">The command is a shortcut. It makes these two API calls, which any script can make too:</p>
            <div className="flex flex-col divide-y">
              {connectAgents.loginApi.map((s) => <FieldRow key={s.call} label={s.step} value={s.call} mono />)}
            </div>
          </div>
        </AttributeCard>
        <AttributeCard title="Keys in use" icon={KeyRound}>
          <Rows>
            {connectAgents.keys.map((k) => (
              <Item key={k.id} size="sm" className="rounded-none px-0">
                <ItemMedia>{k.kind === 'person' ? <PersonAvatar name={k.label} /> : <Holder agent={k.label} />}</ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full min-w-0"><span className="truncate">{k.label}</span><span className="text-xs font-normal text-muted-foreground">{k.kind === 'person' ? 'Person' : 'Agent key'}</span></ItemTitle>
                  <ItemDescription className="truncate text-xs">{k.detail} · <span className="font-mono">{k.key}</span> · used {k.lastUsed}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  {k.inUse ? <Badge variant="outline" className="rounded-full border-transparent bg-success/15 text-success">In use now</Badge> : <Badge variant="outline" className="rounded-full">Idle</Badge>}
                  {k.kind === 'agent' ? <Button size="xs" variant="ghost">Revoke</Button> : null}
                </ItemActions>
              </Item>
            ))}
          </Rows>
        </AttributeCard>
      </div>
    </AppFrame>
  );
}

function Allowed({ yes }: { yes: boolean }) {
  return yes ? <Check className="size-4 text-success" aria-label="Yes" /> : <Minus className="size-4 text-muted-foreground" aria-label="No" />;
}

const ROLES: Role[] = ['owner', 'reviewer', 'member', 'visitor'];

function PeopleAndRoles() {
  return (
    <AppFrame active="people" icon={Users} title="People and roles" description="Ruiz and Co · 3 people · 3 projects" actions={<Button size="sm"><UserPlus />Invite someone</Button>}>
      <AttributeCard title={<>People <Count n={people.length} /></>} icon={Users}>
        <Rows>
          {people.map((p) => (
            <Item key={p.id} size="sm" className="rounded-none px-0">
              <ItemMedia><PersonAvatar id={p.id} /></ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full min-w-0"><span className="truncate">{p.name}</span></ItemTitle>
                <ItemDescription className="truncate text-xs">{p.email} · {p.machines.join(', ')} · seen {p.lastSeen}</ItemDescription>
              </ItemContent>
              <ItemActions><Badge variant="outline" className="rounded-full">{ROLE_LABEL[p.role]}</Badge></ItemActions>
            </Item>
          ))}
          <Row icon={Eye} title="Anyone with the public link" sub="Sees a published project only, once publishing ships" trailing={<Badge variant="outline" className="rounded-full">{ROLE_LABEL.visitor}</Badge>} />
        </Rows>
      </AttributeCard>
      <AttributeCard title="What each role can approve" icon={ShieldCheck}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                {ROLES.map((r) => <TableHead key={r} className="text-center">{ROLE_LABEL[r]}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {permissions.map((row) => (
                <TableRow key={row.action}>
                  <TableCell className="whitespace-normal">{row.action}</TableCell>
                  {ROLES.map((r) => <TableCell key={r}><span className="flex justify-center"><Allowed yes={row.roles.includes(r)} /></span></TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="pt-3 text-xs text-muted-foreground">No role merges or deploys. Cloud never touches code.</p>
      </AttributeCard>
    </AppFrame>
  );
}

function ConnectProject() {
  return (
    <AppFrame active="projects" icon={FolderGit2} title={`Connect ${connect.project}`} description={`Link this local project to ${connect.team}. Code never leaves the machine.`}>
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <AttributeCard title="What will sync" icon={Cloud}>
          <div className="grid gap-4">
            <div className="flex flex-col divide-y">
              <FieldRow label="Project" value={connect.project} mono />
              <FieldRow label="Team" value={connect.team} />
              <FieldRow label="Public page" value="Off. Publishing comes later, from project settings." />
            </div>
            <div className="grid gap-3">
              {connect.syncs.map((s) => (
                <label key={s.what} className="flex items-start gap-2 text-sm">
                  <Checkbox defaultChecked />
                  <span className="grid"><span>{s.what}</span><span className="text-xs text-muted-foreground">{s.detail}</span></span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm"><Link2 />Connect {connect.project}</Button>
              <Button size="sm" variant="outline">Cancel</Button>
            </div>
          </div>
        </AttributeCard>
        <AttributeCard title="Stays on your machine" icon={Lock}>
          <Rows>
            {connect.stays.map((s) => <Row key={s} icon={EyeOff} title={s} />)}
          </Rows>
        </AttributeCard>
      </div>
    </AppFrame>
  );
}

function PublicPreview({ small }: { small?: boolean }) {
  return (
    <div className="grid overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary"><BookOpen className="size-4" aria-hidden /></span>
        <span className="grid leading-tight"><span className="text-sm font-semibold">{publicView.project}</span><span className="text-xs text-muted-foreground">by {projectSettings.team}</span></span>
        <span className="ml-auto flex gap-1">
          <Button size="xs" variant="ghost" className="bg-accent">Board</Button>
          <Button size="xs" variant="ghost">Wiki</Button>
        </span>
      </div>
      <div className={cn('grid gap-4 p-4', !small && 'lg:grid-cols-[1fr_240px]')}>
        <Rows>
          {(small ? publicView.stories.slice(0, 3) : publicView.stories).map((s) => (
            <Row key={s.id} icon={Table2} title={s.title} sub={<span className="font-mono">{s.id}</span>} trailing={<StatePill display={s.display} />} />
          ))}
        </Rows>
        {small ? null : (
          <div className="grid content-start gap-2">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Wiki</span>
            {publicWiki.map((w) => (
              <span key={w.title} className="grid text-sm"><span>{w.title}</span><span className="text-xs text-muted-foreground">Updated {w.updated}</span></span>
            ))}
          </div>
        )}
      </div>
      <div className="border-t px-4 py-2 text-xs text-muted-foreground">Read only · {publicView.agentsWorking} agents working now · Published with Codeloop Cloud</div>
    </div>
  );
}

function ProjectSettings() {
  const [publish, setPublish] = useState<string[]>(['off']);
  return (
    <AppFrame active="settings" icon={Settings} title={`${projectSettings.project} settings`} description={`A project in ${projectSettings.team}.`}>
      <AttributeCard title="General" icon={FolderGit2}>
        <div className="flex flex-col divide-y">
          <FieldRow label="Project" value={projectSettings.project} mono />
          <FieldRow label="Story keys" value={<span className="grid"><span className="font-mono">{projectSettings.keyPrefix}</span><span className="text-xs text-muted-foreground">The next story reads {projectSettings.nextKey}, a short key people can say out loud.</span></span>} />
          <FieldRow label="Who can see it" value={projectSettings.visibility} />
        </div>
      </AttributeCard>
      <AttributeCard title={<>Public page <Badge variant="outline" className="rounded-full">Later</Badge></>} icon={Globe}>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <p className="text-sm font-medium">Publish the board and wiki at a public link</p>
              <p className="text-xs text-muted-foreground">Like a docs site: one switch per project, read only for visitors. Only the owner can turn it on.</p>
            </div>
            <ToggleGroup value={publish} onValueChange={(v: string[]) => { if (v[0]) setPublish(v); }} variant="outline" size="sm" aria-label="Publish this project">
              <ToggleGroupItem value="off">Off</ToggleGroupItem>
              <ToggleGroupItem value="on" disabled>On</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <FieldRow label="Public link" value={projectSettings.publicUrl} mono icon={Link2} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Published</span>
              {projectSettings.publishes.map((p) => <span key={p} className="flex items-center gap-2 text-sm"><Eye className="size-4 text-muted-foreground" aria-hidden />{p}</span>)}
            </div>
            <div className="grid content-start gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Never published</span>
              {projectSettings.neverPublished.map((p) => <span key={p} className="flex items-center gap-2 text-sm"><EyeOff className="size-4 text-muted-foreground" aria-hidden />{p}</span>)}
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Preview of the public page</span>
              <Button size="xs" variant="link" className="ml-auto" nativeButton={false} render={<a href="#public-view" />}>Open the full preview</Button>
            </div>
            <PublicPreview small />
          </div>
        </div>
      </AttributeCard>
    </AppFrame>
  );
}

function PublicView() {
  return (
    <div className="grid gap-4 rounded-xl bg-muted/50 p-4 sm:p-6">
      <FieldRow label="Address" value={projectSettings.publicUrl} mono icon={Globe} />
      <PublicPreview />
      <div className="grid gap-4 sm:grid-cols-2">
        <AttributeCard title="Hidden from visitors" icon={EyeOff}>
          <div className="flex flex-col divide-y">
            <FieldRow label="Private stories" value={`${publicView.hidden.stories} hidden`} />
            <FieldRow label="Other projects" value={`${publicView.hidden.projects} hidden`} />
            <FieldRow label="People, machines and keys" value="Hidden" />
          </div>
        </AttributeCard>
        <Card>
          <EmptyState compact icon={Globe} title="Not published yet" description="Publishing ships later. Until then this page exists only as this preview." />
        </Card>
      </div>
    </div>
  );
}

function PlanCell({ v }: { v: boolean | string }) {
  if (typeof v === 'string') return <span className="text-sm">{v}</span>;
  if (v) return <Check className="size-4 text-success" aria-label="Included" />;
  return <span className="text-xs text-muted-foreground">Cloud only</span>;
}

function Plans() {
  return (
    <div className="grid gap-4 rounded-xl bg-muted/50 p-4 sm:p-6">
      <p className="text-sm">Open source is Codeloop Cloud you download and run on one machine, with fewer features. It is the same product, so a project moves to Cloud without changing how you work.</p>
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Feature</TableHead>
              <TableHead>Open source (local)</TableHead>
              <TableHead>Cloud</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((p) => (
              <TableRow key={p.feature}>
                <TableCell className="whitespace-normal">{p.feature}</TableCell>
                <TableCell className="whitespace-normal"><PlanCell v={p.local} /></TableCell>
                <TableCell className="whitespace-normal"><PlanCell v={p.cloud} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const TRAITS: { trait: string; how: string }[] = [
  { trait: 'One accent colour', how: 'Primary appears on the page-header icon tile, the product mark and one main button per screen. Everything else is foreground or muted.' },
  { trait: 'Raised cards on a muted ground', how: 'Each screen sits on a muted ground with white cards on it, and no card sits inside another card.' },
  { trait: 'One edge per surface', how: 'A card has a hairline ring and nothing else: never a border, a background and a shadow on one element.' },
  { trait: 'Rows divided, not boxed', how: 'Lists are hairline-divided rows inside one card, not a stack of separately bordered boxes.' },
  { trait: 'Icon, name, then a muted sub-line', how: 'Every row opens with a small type tile, then a readable title, then one muted line that carries the story key, project and why.' },
  { trait: 'A short type scale', how: 'Page titles text-xl, panel titles text-base, body text-sm, sub-lines and labels text-xs. Identifiers are mono, counts are tabular, labels are sentence case.' },
  { trait: 'Grouped sidebar with small uppercase labels', how: 'Work and Team groups, the product mark on top and the signed-in person at the foot.' },
  { trait: 'Calm empty and status states', how: 'A round muted icon, one sentence and at most one action, as on the not-published card and the machine-linked card. Waiting reads amber with an hourglass.' },
];

function DesignNotes() {
  return (
    <aside id="design-notes" aria-label="Design notes" className="scroll-mt-16">
      <Card>
        <CardContent className="grid gap-4">
          <SectionHeading title="Design notes" icon={Palette} className="mb-0" />
          <p className="text-sm text-muted-foreground">What makes the Protobox web app feel clean, and how this mock applies it with the codeloop workspace’s own components and tokens.</p>
          <ol className="grid gap-3 text-sm">
            {TRAITS.map((t, i) => (
              <li key={t.trait} className="grid gap-0.5"><span className="font-medium">{i + 1}. {t.trait}</span><span className="text-muted-foreground">{t.how}</span></li>
            ))}
          </ol>
          <Separator />
          <ul className="grid gap-1.5 text-xs text-muted-foreground">
            <li>No new tokens. Codeloop already shares Protobox’s primary and warm neutral scale. The muted ground is the existing muted token at reduced opacity, set in this page only.</li>
            <li>The workspace has no Switch primitive, so the publish control is a two-item toggle group. A Switch would be a wrapper in components/shared, not a change to components/ui.</li>
            <li>Story keys read SC-142 everywhere. The internal id is never shown.</li>
            <li>No screen starts an agent, merges or deploys.</li>
          </ul>
        </CardContent>
      </Card>
    </aside>
  );
}

export default function MockC322CloudPage() {
  return (
    <PageLayout
      icon={Cloud}
      breadcrumbs={[{ label: 'Mocks' }, { label: 'c-322' }]}
      title="Codeloop Cloud"
      description="One board for a team, with every agent the team runs on its own machines. Mock data."
      badge={<Badge variant="outline" className="rounded-full">Mock</Badge>}
    >
      <div style={{ display: 'grid', gap: 40, minWidth: 0 }}>
        <nav className="sticky top-0 z-10 flex flex-wrap gap-1.5 border-b bg-background py-2" aria-label="Screens in this mock">
          {NAV.map((n) => <Button key={n.id} size="xs" variant="ghost" nativeButton={false} render={<a href={`#${n.id}`} />}>{n.label}</Button>)}
        </nav>
        <section id="sign-up" data-screen="sign-up" className="scroll-mt-16">
          <Screen title="Sign up" icon={UserPlus} note="One identity: creating a codeloop account creates the Protobox account behind it, so nobody signs up twice.">
          <SignUp />
        </Screen>
        </section>
        <section id="device-link" data-screen="device-link" className="scroll-mt-16">
          <Screen title="Link this machine to Cloud" icon={Laptop} note="codeloop login prints a code in the terminal; the person approves it in the browser where they are already signed in.">
          <DeviceLink />
        </Screen>
        </section>
        <section id="team-home" data-screen="team-home" className="scroll-mt-16">
          <Screen title="Team home" icon={Home} note="What needs me across every project, the agents working now on everyone’s machines, and what shipped. Waiting reads amber with an hourglass; failing is the only red.">
          <TeamHome />
        </Screen>
        </section>
        <section id="agents" data-screen="agents" className="scroll-mt-16">
          <Screen title="Agents" icon={Bot} note="Every agent the team’s machines report, filtered by person and project. The stalled agent is highlighted in amber. There is no start button.">
          <AgentsTable />
        </Screen>
        </section>
        <section id="story-page" data-screen="story-page" className="scroll-mt-16">
          <Screen title="Story page" icon={GitBranch} note="The story by its short key, SC-142. The summary on top, then who holds it and every agent that worked it.">
          <StoryPage />
        </Screen>
        </section>
        <section id="connect-agents" data-screen="connect-agents" className="scroll-mt-16">
          <Screen title="Connect your agents" icon={Plug} note="The team’s MCP link, copy-ready setup for Claude Code, Cursor and Codex, the login command and the keys in use.">
          <ConnectAgents />
        </Screen>
        </section>
        <section id="people-and-roles" data-screen="people-and-roles" className="scroll-mt-16">
          <Screen title="People and roles" icon={Users} note="Members, their roles and machines, and which approvals each role can give.">
          <PeopleAndRoles />
        </Screen>
        </section>
        <section id="connect-project" data-screen="connect-project" className="scroll-mt-16">
          <Screen title="Connect a project to Cloud" icon={Link2} note="One screen to link a local project to the team. The board, wiki, skills and agent presence sync; code never leaves the machine.">
          <ConnectProject />
        </Screen>
        </section>
        <section id="project-settings" data-screen="project-settings" className="scroll-mt-16">
          <Screen title="Project settings" icon={Settings} note="Story keys, and the later public page: a per-project switch that publishes the board and wiki, with a preview.">
          <ProjectSettings />
        </Screen>
        </section>
        <section id="public-view" data-screen="public-view" className="scroll-mt-16">
          <Screen title="Public page" icon={Eye} note="What a visitor sees once a project is published: the board and wiki, read only, and nothing private. Shown as a later feature.">
          <PublicView />
        </Screen>
        </section>
        <section id="plans" data-screen="plans" className="scroll-mt-16">
          <Screen title="Open source and Cloud" icon={Cloud} note="The same product. A feature only Cloud has says so in the open source column.">
          <Plans />
        </Screen>
        </section>
        <DesignNotes />
      </div>
    </PageLayout>
  );
}
