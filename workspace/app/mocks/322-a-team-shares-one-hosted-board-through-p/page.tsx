'use client';

// codeloop-mock-app: c-322
// Mock for c-322 A team shares one hosted board through Protobox. Delete or keep it as the spec's `mock:` line says (`codeloop mock cleanup c-322`).
// Codeloop Cloud coordinates agents that people run on their own machines: it holds the board, the wiki
// and knowledge base, skills and agent presence. No screen here starts an agent, merges or deploys.
// Every screen is stacked rather than tabbed: the mocks gallery measures each data-screen section, and
// a hidden tab panel has no size to measure.
import { useState } from 'react';
import { Bot, Check, CheckCircle2, Cloud, Eye, EyeOff, GitBranch, Home, Hourglass, Laptop, Link2, Lock, Minus, ShieldCheck, Table2, UserRound, Users, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageLayout } from '@/components/shared/page-layout';
import { AttributeCard, RecordStatRow, SectionHeading } from '@/components/shared/record-layout';
import { FieldRow } from '@/components/shared/field-row';
import { Holder } from '@/components/shared/holder';
import { StatePill } from '@/components/shared/state-pill';
import { StoryKey } from '@/components/shared/story-key';
import { StorySummary } from '@/components/shared/story-summary';
import { MetaChip } from '@/components/shared/meta-chip';
import { SearchAndFilter, EMPTY_SEARCH, type SearchAndFilterValue } from '@/components/shared/search-and-filter';
import { EmptyState } from '@/components/shared/empty-state';
import { CopyButton } from '@/components/shared/copy-button';
import { cn } from '@/lib/utils';
import { agents, connect, home, people, permissions, personName, plans, projects, publicView, ROLE_LABEL, story, type Agent, type AgentState, type Role } from './mock-data';

const NAV = [
  { id: 'team-home', label: 'Team home' },
  { id: 'agents', label: 'Agents' },
  { id: 'story-page', label: 'Story' },
  { id: 'people-and-roles', label: 'People and roles' },
  { id: 'plans', label: 'Open source and Cloud' },
  { id: 'connect-project', label: 'Connect a project' },
  { id: 'public-view', label: 'Public view' },
];

// Same tones the home page uses for agent tiles: ai for working, amber for a person needed, green for done.
const AGENT_TONE: Record<AgentState, string> = {
  working: 'border-transparent bg-ai/15 text-ai',
  'waiting on owner': 'border-transparent bg-warning/15 text-warning-foreground dark:text-warning',
  stalled: 'border-transparent bg-warning/15 text-warning-foreground dark:text-warning',
  done: 'border-transparent bg-success/15 text-success',
};

const AGENT_LABEL: Record<AgentState, string> = { working: 'Working', 'waiting on owner': 'Waiting on owner', stalled: 'Stalled', done: 'Done' };

const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** A person is round, an agent is square (Holder); the same rule as the board. */
function PersonAvatar({ id }: { id: string }) {
  return (
    <Avatar className="size-5 rounded-full">
      <AvatarFallback className="rounded-full text-[10px] font-semibold">{initials(personName(id))}</AvatarFallback>
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

function Screen({ title, icon, note, children }: { title: string; icon: typeof Home; note: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <div>
        <SectionHeading title={title} icon={icon} className="mb-1" />
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      <Card>
        <CardContent style={{ display: 'grid', gap: 16, minWidth: 0 }}>{children}</CardContent>
      </Card>
    </div>
  );
}

function TeamHome() {
  const working = agents.filter((a) => a.state !== 'done');
  return (
    <>
      <RecordStatRow
        stats={[
          { label: 'Need you, across 3 projects', value: home.needsYou.length },
          { label: 'Agents on 5 machines', value: working.length },
          { label: 'Failing', value: home.failing.length },
          { label: 'Shipped this week', value: home.shipped.length },
        ]}
      />
      <AttributeCard title="Needs you" icon={Lock}>
        <div className="flex flex-col">
          {home.needsYou.map((s) => (
            <FieldRow
              key={s.id}
              label={s.id}
              value={<span className="grid min-w-0"><span className="truncate">{s.title}</span><span className="truncate text-xs text-muted-foreground">{s.why} · {s.since}</span></span>}
              adornment={<span className="flex flex-wrap items-center justify-end gap-1.5"><MetaChip label="Project" value={s.project} /><StatePill display={s.display} /><Button size="xs" variant="outline">Open</Button></span>}
            />
          ))}
        </div>
      </AttributeCard>
      <AttributeCard title="Failing" icon={XCircle}>
        {home.failing.map((s) => (
          <FieldRow
            key={s.id}
            label={s.id}
            value={<span className="grid min-w-0"><span className="truncate">{s.title}</span><span className="truncate text-xs text-muted-foreground">{s.why}</span></span>}
            adornment={<span className="flex flex-wrap items-center justify-end gap-1.5"><MetaChip label="Project" value={s.project} /><StatePill display={s.display} /></span>}
          />
        ))}
      </AttributeCard>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <AttributeCard title="Agents working now" icon={Bot}>
          <ItemGroup className="gap-2">
            {working.map((a) => (
              <Item key={a.id} variant="outline" size="sm" className={cn('flex-col items-stretch', a.state === 'stalled' && 'border-warning/50 bg-warning/10')}>
                <ItemContent className="min-w-0">
                  <ItemTitle className="flex w-full min-w-0 items-center gap-2">
                    <Holder agent={`${a.kind} on ${a.machine}`} />
                    <span className="truncate">{a.kind} · {personName(a.person)} · {a.machine}</span>
                    <span className="ml-auto"><AgentStateBadge state={a.state} /></span>
                  </ItemTitle>
                  <ItemDescription className="truncate text-foreground">{a.story} {a.storyTitle}<span className="text-muted-foreground"> · {a.project}</span></ItemDescription>
                  <ItemDescription className="truncate">{a.lastAction} · {a.lastActivity}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </AttributeCard>
        <AttributeCard title="Shipped this week" icon={CheckCircle2}>
          <div className="flex flex-col">
            {home.shipped.map((s) => (
              <FieldRow key={s.id} label={s.id} value={s.title} adornment={<span className="text-xs text-muted-foreground">{s.who} · {s.at}</span>} />
            ))}
          </div>
        </AttributeCard>
      </div>
    </>
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
    <>
      <Alert>
        <Laptop />
        <AlertTitle>Agents run on your own machines</AlertTitle>
        <AlertDescription>Each row was reported by the machine the agent runs on. Cloud shows where every agent is; starting or stopping one happens on that machine.</AlertDescription>
      </Alert>
      <SearchAndFilter
        value={filter}
        onChange={setFilter}
        searchPlaceholder="Search story, branch or machine"
        facets={[
          { id: 'person', title: 'Person', options: people.map((p) => ({ label: p.name, value: p.id, count: agents.filter((a) => a.person === p.id).length })) },
          { id: 'project', title: 'Project', options: projects.map((p) => ({ label: p.name, value: p.id, count: agents.filter((a) => a.project === p.id).length })) },
        ]}
        trailing={<span className="text-xs text-muted-foreground">{rows.length} of {agents.length} agents</span>}
      />
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Machine</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Story</TableHead>
                <TableHead className="hidden md:table-cell">Branch</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id} className={cn(a.state === 'stalled' && 'bg-warning/10 hover:bg-warning/15')} data-stalled={a.state === 'stalled' || undefined}>
                  <TableCell><span className="flex items-center gap-1.5"><PersonAvatar id={a.person} />{personName(a.person)}</span></TableCell>
                  <TableCell className="font-mono text-xs">{a.machine}</TableCell>
                  <TableCell><span className="flex items-center gap-1.5"><Holder agent={`${a.kind} on ${a.machine}`} />{a.kind}</span></TableCell>
                  <TableCell>{a.project}</TableCell>
                  <TableCell><span className="flex min-w-0 items-center gap-1.5"><StoryKey id={a.story} /><span className="max-w-56 truncate">{a.storyTitle}</span></span></TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{a.branch}</TableCell>
                  <TableCell><AgentStateBadge state={a.state} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.lastActivity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : <EmptyState compact icon={Bot} title="No agent matches" description="Clear a filter to see agents from every person and project." />}
    </>
  );
}

function AgentRow({ a, current }: { a: Agent; current?: boolean }) {
  return (
    <Item variant="outline" size="sm" className="flex-col items-stretch">
      <ItemContent className="min-w-0">
        <ItemTitle className="flex w-full min-w-0 items-center gap-2">
          <Holder agent={`${a.kind} on ${a.machine}`} />
          <span className="truncate">{a.kind} on {a.machine}</span>
          <span className="ml-auto flex items-center gap-1.5">{current ? <Badge variant="outline" className="rounded-full">Holds it now</Badge> : null}<AgentStateBadge state={a.state} /></span>
        </ItemTitle>
        <ItemDescription className="flex min-w-0 items-center gap-1.5"><PersonAvatar id={a.person} /><span className="truncate">Started by {personName(a.person)} · {a.startedAt}</span></ItemDescription>
        <ItemDescription className="truncate">{a.lastAction} · {a.lastActivity}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

function StoryPage() {
  const list = story.agents.map((id) => agents.find((a) => a.id === id)!);
  const current = list.filter((a) => a.state !== 'done');
  const past = list.filter((a) => a.state === 'done');
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StoryKey id={story.id} />
        <strong className="min-w-0">{story.title}</strong>
        <StatePill display={story.display} agent={story.holder.label} />
        <MetaChip label="Project" value={story.project} />
      </div>
      <StorySummary cardId={story.id} summary={story.summary} />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <AttributeCard title="Who has it" icon={UserRound}>
          <FieldRow label="Held by" value={story.holder.label} valueLeading={<Holder agent={story.holder.label} />} />
          <FieldRow label="Started by" value={personName(story.holder.person)} valueLeading={<PersonAvatar id={story.holder.person} />} />
          <FieldRow label="Owner" value={personName(story.owner)} valueLeading={<PersonAvatar id={story.owner} />} />
          <FieldRow label="Branch" icon={GitBranch} value={story.branch} mono adornment={<CopyButton text={story.branch} size="icon" />} />
        </AttributeCard>
        <AttributeCard title="Agents on this story" icon={Bot}>
          <div className="grid gap-3">
            <ItemGroup className="gap-2">{current.map((a) => <AgentRow key={a.id} a={a} current />)}</ItemGroup>
            <p className="text-xs font-medium text-muted-foreground">Earlier</p>
            <ItemGroup className="gap-2">{past.map((a) => <AgentRow key={a.id} a={a} />)}</ItemGroup>
          </div>
        </AttributeCard>
      </div>
    </>
  );
}

function Allowed({ yes }: { yes: boolean }) {
  return yes ? <Check className="size-4 text-success" aria-label="Yes" /> : <Minus className="size-4 text-muted-foreground" aria-label="No" />;
}

const ROLES: Role[] = ['owner', 'reviewer', 'member', 'visitor'];

function PeopleAndRoles() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Ruiz and Co · 3 people · 3 projects</span>
        <Button size="sm" variant="outline" className="ml-auto"><Users />Invite someone</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Machines</TableHead>
              <TableHead>Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((p) => (
              <TableRow key={p.id}>
                <TableCell><span className="flex items-center gap-2"><PersonAvatar id={p.id} /><span className="grid"><span>{p.name}</span><span className="text-xs text-muted-foreground">{p.email}</span></span></span></TableCell>
                <TableCell><Badge variant="outline" className="rounded-full">{ROLE_LABEL[p.role]}</Badge></TableCell>
                <TableCell><span className="flex flex-wrap gap-1">{p.machines.map((m) => <MetaChip key={m} label={m} value={agents.some((a) => a.machine === m && a.state !== 'done') ? 'agent working' : 'idle'} />)}</span></TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.lastSeen}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell><span className="flex items-center gap-2"><Eye className="size-4 text-muted-foreground" />Anyone with the public link</span></TableCell>
              <TableCell><Badge variant="outline" className="rounded-full">{ROLE_LABEL.visitor}</Badge></TableCell>
              <TableCell className="text-xs text-muted-foreground">None</TableCell>
              <TableCell className="text-xs text-muted-foreground">storefront only</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
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
      </AttributeCard>
    </>
  );
}

function PlanCell({ v, cloudOnly }: { v: boolean | string; cloudOnly?: boolean }) {
  if (typeof v === 'string') return <span className="text-sm">{v}</span>;
  if (v) return <Check className="size-4 text-success" aria-label="Included" />;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="rounded-full text-muted-foreground">Open source (local)</Badge>
      <span className="text-xs text-muted-foreground">{cloudOnly ? 'Not included, Cloud only' : 'Not included'}</span>
    </span>
  );
}

function Plans() {
  return (
    <>
      <p className="text-sm">Open source is Codeloop Cloud you download and run on one machine, with fewer features. It is the same product, so a project moves to Cloud without changing how you work.</p>
      <div className="overflow-x-auto rounded-xl border bg-card">
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
                <TableCell className="whitespace-normal"><PlanCell v={p.local} cloudOnly={p.local === false} /></TableCell>
                <TableCell className="whitespace-normal"><PlanCell v={p.cloud} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function ConnectProject() {
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <AttributeCard title={`Connect ${connect.project} to ${connect.team}`} icon={Cloud}>
        <div className="grid gap-3">
          <FieldRow label="Project" value={connect.project} mono />
          <FieldRow label="Team" value={connect.team} />
          <FieldRow label="Public demo" value="Off. You can turn it on later." />
          <p className="text-xs font-medium text-muted-foreground">What will sync</p>
          <div className="grid gap-2">
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
      <div className="grid gap-4">
        <AttributeCard title="Stays on your machine" icon={Lock}>
          <ItemGroup className="gap-2">
            {connect.stays.map((s) => (
              <Item key={s} variant="outline" size="sm"><ItemContent><ItemTitle><EyeOff className="size-4 text-muted-foreground" />{s}</ItemTitle></ItemContent></Item>
            ))}
          </ItemGroup>
        </AttributeCard>
        <AttributeCard title="After you connect" icon={Link2}>
          <p className="mb-2 text-sm">Paste this MCP link into any agent on any machine, and it reads and updates the shared board.</p>
          <FieldRow label="MCP link" value={connect.mcpLink} mono adornment={<CopyButton text={connect.mcpLink} size="icon" />} />
        </AttributeCard>
      </div>
    </div>
  );
}

function PublicView() {
  return (
    <>
      <Alert>
        <Eye />
        <AlertTitle>You are viewing a public demo</AlertTitle>
        <AlertDescription>This board is read only. People, machines and private projects are hidden.</AlertDescription>
      </Alert>
      <AttributeCard title={`${publicView.project} board`} icon={Table2}>
        <div className="flex flex-col">
          {publicView.stories.map((s) => (
            <FieldRow key={s.id} label={s.id} value={s.title} adornment={<StatePill display={s.display} />} />
          ))}
        </div>
      </AttributeCard>
      <div className="grid gap-4 sm:grid-cols-2">
        <AttributeCard title="Agents" icon={Bot}>
          <p className="text-sm">{publicView.agentsWorking} agents are working on this board right now.</p>
          <p className="text-xs text-muted-foreground">Who started them and on which machine is visible to the team only.</p>
        </AttributeCard>
        <AttributeCard title="Hidden from visitors" icon={EyeOff}>
          <FieldRow label="Private stories" value={`${publicView.hidden.stories} hidden`} />
          <FieldRow label="Private projects" value={`${publicView.hidden.projects} hidden`} />
          <FieldRow label="People and machines" value="Hidden" />
        </AttributeCard>
      </div>
    </>
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
      <div style={{ display: 'grid', gap: 32, minWidth: 0 }}>
        <nav className="sticky top-0 z-10 flex flex-wrap gap-1.5 border-b bg-background py-2" aria-label="Screens in this mock">
          {NAV.map((n) => <Button key={n.id} size="xs" variant="outline" nativeButton={false} render={<a href={`#${n.id}`} />}>{n.label}</Button>)}
        </nav>
        <section id="team-home" data-screen="team-home" className="scroll-mt-16">
          <Screen title="Team home" icon={Home} note="What needs me across every project, the agents working now on everyone's machines, and what shipped. Waiting and stuck read amber with an hourglass; the failing check is the only red.">
          <TeamHome />
        </Screen>
        </section>
        <section id="agents" data-screen="agents" className="scroll-mt-16">
          <Screen title="Agents" icon={Bot} note="Every agent the team's machines report, filtered by person and project. The stalled agent is highlighted in amber. There is no start button: agents start on the machine they run on.">
          <AgentsTable />
        </Screen>
        </section>
        <section id="story-page" data-screen="story-page" className="scroll-mt-16">
          <Screen title="Story page" icon={GitBranch} note="The summary on top, then the branch, who holds the story now, and every agent that worked it with the person who started each.">
          <StoryPage />
        </Screen>
        </section>
        <section id="people-and-roles" data-screen="people-and-roles" className="scroll-mt-16">
          <Screen title="People and roles" icon={Users} note="Members, their roles and machines, and which approvals each role can give. No role merges or deploys: Cloud never touches code.">
          <PeopleAndRoles />
        </Screen>
        </section>
        <section id="plans" data-screen="plans" className="scroll-mt-16">
          <Screen title="Open source and Cloud" icon={Cloud} note="The same product. A feature Open source (local) does not have carries its badge in that column.">
          <Plans />
        </Screen>
        </section>
        <section id="connect-project" data-screen="connect-project" className="scroll-mt-16">
          <Screen title="Connect a project to Cloud" icon={Link2} note="One screen to link a local project to the team. The board, wiki, skills and agent presence sync; code never leaves the machine.">
          <ConnectProject />
        </Screen>
        </section>
        <section id="public-view" data-screen="public-view" className="scroll-mt-16">
          <Screen title="Public read-only view" icon={Eye} note="What a visitor with the public link sees: one public project, story states, a count of working agents, and nothing private.">
          <PublicView />
        </Screen>
        </section>
      </div>
    </PageLayout>
  );
}
