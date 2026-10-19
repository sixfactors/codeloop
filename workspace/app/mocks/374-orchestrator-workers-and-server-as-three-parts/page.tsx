'use client';

// codeloop-mock-app: c-374
// Mock for c-374 Orchestrator, workers and server as three parts. Delete or keep it as the spec's `mock:` line says (`codeloop mock cleanup c-374`).
// Adds views inside three of the six approved places (Today, Knowledge, Agents) and changes nothing else.
// The shell, rail and row pattern are c-322's; the answer buttons follow c-362. Screens are stacked, not
// tabbed, so the mocks gallery can measure each data-screen section. Story and card ids sit in muted
// "Machinery" lines, never in titles.
import { useState } from 'react';
import {
  Archive, BookOpen, Bot, Check, CheckCheck, CircleHelp, Cloud, FileText, Flag, GitFork, Home, Hourglass, Layers, ListChecks, Radar, Settings, ShieldCheck, Sparkles, Table2, Terminal, Users, X, Workflow as WorkflowIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageLayout } from '@/components/shared/page-layout';
import { AttributeCard, RecordStatRow, SectionHeading } from '@/components/shared/record-layout';
import { Holder } from '@/components/shared/holder';
import { EmptyState } from '@/components/shared/empty-state';
import { CopyButton } from '@/components/shared/copy-button';
import { SearchAndFilter, EMPTY_SEARCH, type SearchAndFilterValue } from '@/components/shared/search-and-filter';
import { cn } from '@/lib/utils';
import {
  decide, decisions, dismissReasons, facts, instances, NOISY_BELOW, pages, precision, rules, stages, templates, workflow,
  type DecideItem, type Instance, type PageState, type Rule, type Template,
} from './mock-data';

const NAV = [
  { id: 'today', label: 'Today' },
  { id: 'templates', label: 'Templates' },
  { id: 'live', label: 'Live' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'pages', label: 'Pages' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'facts', label: 'Facts' },
];

// The six approved places. Only Today, Knowledge and Agents carry views in this mock.
type Place = 'today' | 'work' | 'product' | 'knowledge' | 'agents' | 'settings';
const PLACES: { key: Place; label: string; icon: typeof Home; hint: string }[] = [
  { key: 'today', label: 'Today', icon: Home, hint: 'decide, then see what moved' },
  { key: 'work', label: 'Work', icon: Table2, hint: 'ideas to live' },
  { key: 'product', label: 'Product', icon: Layers, hint: 'what runs where' },
  { key: 'knowledge', label: 'Knowledge', icon: BookOpen, hint: 'pages, decisions, facts' },
  { key: 'agents', label: 'Agents', icon: Bot, hint: 'templates, who, workflows' },
  { key: 'settings', label: 'Settings', icon: Settings, hint: 'team, runners, billing' },
];

const initials = (name: string) => name.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

type RowTone = 'plain' | 'wait' | 'bad' | 'ok';

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

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col divide-y">{children}</div>;
}

/** Label over value, so a long value wraps under its label instead of squeezing beside it. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <span className="grid min-w-0 content-start gap-0.5"><span className="text-xs font-medium text-muted-foreground">{label}</span><span className="text-sm">{value}</span></span>;
}

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">{n}</span>;
}

/** The muted line every row ends with: ids and rule names a person never needs to read. */
function Machinery({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground"><span className="font-medium">Machinery</span> · <span className="font-mono">{children}</span></p>;
}

/** A command the terminal would run, copy-ready, under the row it belongs to. */
function Command({ text, label = 'Suggested command' }: { text: string; label?: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md bg-muted px-2 py-1">
      <Terminal className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{text}</code>
      <CopyButton text={text} variant="ghost" size="sm" />
    </div>
  );
}

/** A row that is allowed to wrap: title, sub-line, then free content, with actions under it on phones. */
function WideRow({ icon, tone, title, sub, trailing, children }: { icon: typeof Home; tone?: RowTone; title: React.ReactNode; sub?: React.ReactNode; trailing?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Item size="sm" className="flex-wrap rounded-none px-0">
      <RowTile icon={icon} tone={tone} />
      <ItemContent className="min-w-0 basis-48 flex-1">
        <ItemTitle className="w-full min-w-0 whitespace-normal">{title}</ItemTitle>
        {sub ? <ItemDescription className="line-clamp-none text-xs">{sub}</ItemDescription> : null}
      </ItemContent>
      {trailing ? <ItemActions className="flex-wrap justify-end">{trailing}</ItemActions> : null}
      {children ? <div className="grid w-full gap-1.5 pl-11">{children}</div> : null}
    </Item>
  );
}

const PILL = 'shrink-0 gap-1 rounded-full border-transparent';
const TONE = {
  agent: 'bg-ai/15 text-ai',
  wait: 'bg-warning/15 text-warning-foreground dark:text-warning',
  ok: 'bg-success/15 text-success',
  bad: 'bg-destructive/15 text-destructive',
  plain: 'bg-muted text-foreground',
};

/** The signed-in shell: Protobox's rail with the six approved places; a sub-view strip names the view in the place. */
function AppFrame({ place, views, view, icon: Icon, title, description, actions, children }: { place: Place; views?: string[]; view?: string; icon: typeof Home; title: string; description: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:grid-cols-[208px_1fr]">
      <nav className="hidden flex-col gap-1 border-r bg-sidebar p-3 lg:flex" aria-label="Workspace rail">
        <div className="mb-3 flex items-center gap-2 px-1">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Cloud className="size-4" aria-hidden /></span>
          <span className="grid leading-tight"><span className="text-sm font-semibold">Codeloop</span><span className="text-xs text-muted-foreground">Protobox team</span></span>
        </div>
        {PLACES.map((p) => (
          <Button key={p.key} variant="ghost" size="sm" className={cn('h-auto justify-start py-1.5 font-normal', place === p.key && 'bg-accent font-medium text-accent-foreground')} aria-current={place === p.key ? 'page' : undefined}>
            <p.icon aria-hidden /><span className="grid text-left leading-tight"><span>{p.label}</span><span className="text-xs font-normal text-muted-foreground">{p.hint}</span></span>
          </Button>
        ))}
        <div className="mt-auto flex items-center gap-2 px-1 pt-4">
          <Avatar className="size-5 rounded-full"><AvatarFallback className="rounded-full text-[10px] font-semibold">DG</AvatarFallback></Avatar>
          <span className="grid leading-tight"><span className="text-sm">Dean</span><span className="text-xs text-muted-foreground">Owner</span></span>
        </div>
      </nav>
      <div className="flex min-w-0 flex-col gap-5 bg-muted/40 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-1 lg:hidden" aria-label="Places">
          {PLACES.map((p) => <Badge key={p.key} variant="outline" className={cn('rounded-full', place === p.key && 'bg-accent text-accent-foreground')}>{p.label}</Badge>)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1 basis-48">
            <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {actions}
        </div>
        {views ? (
          <div className="flex flex-wrap gap-1 border-b pb-2" aria-label={`${title} views`}>
            {views.map((v) => <Button key={v} size="xs" variant="ghost" className={cn(view === v && 'bg-accent font-medium text-accent-foreground')} aria-current={view === v ? 'page' : undefined}>{v}</Button>)}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

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

/* ---------------------------------------------------------------- Today */

type Resolved = { kind: 'dismissed'; reason: string } | { kind: 'done'; label: string };

function DismissDialog({ flag, onClose, onDismiss }: { flag: Extract<DecideItem, { kind: 'flag' }> | null; onClose: () => void; onDismiss: (id: string, reason: string) => void }) {
  const [preset, setPreset] = useState<string[]>([dismissReasons[0]]);
  const [more, setMore] = useState('');
  return (
    <Dialog open={Boolean(flag)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dismiss this flag</DialogTitle>
          <DialogDescription>{flag?.title}. The reason is recorded with your name and tunes the rule. Nothing is blocked either way.</DialogDescription>
        </DialogHeader>
        <ToggleGroup value={preset} onValueChange={(v: string[]) => { if (v[0]) setPreset(v); }} orientation="vertical" variant="outline" size="sm" className="w-full flex-col items-stretch">
          {dismissReasons.map((r) => <ToggleGroupItem key={r} value={r} className="justify-start">{r}</ToggleGroupItem>)}
        </ToggleGroup>
        <Textarea value={more} onChange={(e) => setMore(e.target.value)} placeholder="Anything to add (optional)" aria-label="More detail" />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => { if (flag) onDismiss(flag.id, more ? `${preset[0]}: ${more}` : preset[0]); }}>Dismiss with this reason</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DecideRow({ item, resolved, onResolve, onDismiss }: { item: DecideItem; resolved?: Resolved; onResolve: (id: string, label: string) => void; onDismiss: (item: Extract<DecideItem, { kind: 'flag' }>) => void }) {
  if (resolved?.kind === 'done') {
    return <WideRow icon={Check} tone="ok" title={'title' in item ? item.title : ''} sub={resolved.label}><Machinery>{item.machinery}</Machinery></WideRow>;
  }
  switch (item.kind) {
    case 'approve':
      return (
        <WideRow icon={Hourglass} tone="wait" title={item.title} sub={`${item.sub} · ${item.waiting}`}
          trailing={<><Button size="xs" variant="outline" onClick={() => onResolve(item.id, 'Sent back to the plan stage')}><X />Send back</Button><Button size="xs" onClick={() => onResolve(item.id, 'Approved by you just now')}><Check />Approve</Button></>}>
          <Command text={item.command} /><Machinery>{item.machinery}</Machinery>
        </WideRow>
      );
    case 'answer':
      return (
        <WideRow icon={CircleHelp} tone="wait" title={item.title} sub={<>Recommended: {item.recommended} · asked by {item.from}</>}
          trailing={<><Button size="xs" variant="outline">Answer</Button><Button size="xs" onClick={() => onResolve(item.id, 'Accepted the recommended answer, recorded as your decision')}><CheckCheck />Accept</Button></>}>
          <Command text={item.command} /><Machinery>{item.machinery}</Machinery>
        </WideRow>
      );
    case 'decided':
      return (
        <WideRow icon={Check} tone="ok" title={item.title} sub={<><span className="font-medium text-foreground">Decided on {item.date} in {item.source}:</span> {item.answer} By {item.by}. Not asked again.</>}
          trailing={<><Badge variant="outline" className={cn(PILL, TONE.ok)}>Already decided</Badge><Button size="xs" variant="outline">See the decision</Button></>}>
          <Machinery>{item.machinery}</Machinery>
        </WideRow>
      );
    case 'yesno':
      return (
        <WideRow icon={Sparkles} tone="wait" title={item.title} sub={item.sub}
          trailing={<><Button size="xs" variant="outline" onClick={() => onResolve(item.id, 'Not now. Parked')}>Not now</Button><Button size="xs" onClick={() => onResolve(item.id, 'Yes. Taken on')}>Yes</Button></>}>
          <Command text={item.command} /><Machinery>{item.machinery}</Machinery>
        </WideRow>
      );
    case 'flag':
      if (resolved?.kind === 'dismissed') {
        return <WideRow icon={Flag} title={item.title} sub={<>Dismissed by you: {resolved.reason}</>} trailing={<Badge variant="outline" className={cn(PILL, TONE.plain)}>Dismissed</Badge>}><Machinery>{item.machinery}</Machinery></WideRow>;
      }
      return (
        <WideRow icon={Flag} tone="wait" title={item.title} sub={<><span className="font-medium text-foreground">{item.rule}.</span> {item.why}</>}
          trailing={<><Badge variant="outline" className={cn(PILL, TONE.wait)}>Flag</Badge><Button size="xs" variant="outline" onClick={() => onDismiss(item)}>Dismiss</Button></>}>
          <Command text={item.command} /><Machinery>{item.machinery}</Machinery>
        </WideRow>
      );
  }
}

function MovingRow({ a }: { a: Instance }) {
  const stalled = a.state === 'stalled';
  return (
    <WideRow icon={Bot} tone={stalled ? 'wait' : 'plain'}
      title={a.storyTitle}
      sub={<>{a.id} · {a.template} on {a.host} · {a.idleMinutes} min idle</>}
      trailing={<Badge variant="outline" className={cn(PILL, stalled ? TONE.wait : a.state === 'waiting' ? TONE.wait : TONE.agent)}>{stalled ? <Hourglass className="size-3" aria-hidden /> : null}{stalled ? 'Stalled' : a.state === 'waiting' ? 'Waiting' : 'Working'}</Badge>}>
      <p className={cn('flex items-center gap-1.5 text-xs', a.handBackTone === 'warn' ? 'text-warning-foreground dark:text-warning' : 'text-muted-foreground')}>
        {a.handBackTone === 'ok' ? <Check className="size-3.5 text-success" aria-hidden /> : a.handBackTone === 'warn' ? <Hourglass className="size-3.5" aria-hidden /> : null}
        Hand-back: {a.handBack}
      </p>
      <Machinery>{a.story} · stage {a.stage}</Machinery>
    </WideRow>
  );
}

function Today() {
  const [resolved, setResolved] = useState<Record<string, Resolved>>({});
  const [dismissing, setDismissing] = useState<Extract<DecideItem, { kind: 'flag' }> | null>(null);
  const open = decide.filter((d) => d.kind !== 'decided' && !resolved[d.id]);
  const moving = instances.filter((i) => i.kind === 'worker' || i.state === 'working');
  return (
    <AppFrame place="today" views={['Decide', 'Moving']} view="Decide" icon={Home} title="Today" description={`${open.length} things need you. Flags from the monitor sit with the decisions; nothing is blocked.`}>
      <RecordStatRow stats={[{ label: 'Need you', value: open.length }, { label: 'Flags open', value: decide.filter((d) => d.kind === 'flag' && !resolved[d.id]).length }, { label: 'Agents working', value: moving.filter((m) => m.state === 'working').length }, { label: 'Already decided', value: decide.filter((d) => d.kind === 'decided').length }]} />
      <AttributeCard title={<>Decide <Count n={open.length} /></>} icon={Hourglass}>
        <Rows>
          {decide.map((d) => (
            <DecideRow key={d.id} item={d} resolved={resolved[d.id]}
              onResolve={(id, label) => setResolved((r) => ({ ...r, [id]: { kind: 'done', label } }))}
              onDismiss={(f) => setDismissing(f)} />
          ))}
        </Rows>
      </AttributeCard>
      <AttributeCard title={<>Moving <Count n={moving.length} /></>} icon={Bot}>
        <Rows>{moving.map((a) => <MovingRow key={a.id} a={a} />)}</Rows>
      </AttributeCard>
      <DismissDialog flag={dismissing} onClose={() => setDismissing(null)} onDismiss={(id, reason) => { setResolved((r) => ({ ...r, [id]: { kind: 'dismissed', reason } })); setDismissing(null); }} />
    </AppFrame>
  );
}

/* ----------------------------------------------------- Agents · Templates */

function TemplateList({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <AttributeCard title={<>Library <Count n={templates.length} /></>} icon={Users} className="self-start">
      <Rows>
        {templates.map((t) => (
          <Item key={t.id} size="sm" className={cn('cursor-pointer rounded-none px-0', selected === t.id && 'bg-accent/50')} render={<button type="button" onClick={() => onSelect(t.id)} aria-pressed={selected === t.id} className="w-full text-left" />}>
            <ItemMedia><Holder agent={t.name} /></ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="w-full min-w-0"><span className="truncate">{t.name}</span></ItemTitle>
              <ItemDescription className="text-xs">{t.summary}</ItemDescription>
              <span className="text-xs text-muted-foreground">{t.kind} · {t.version} · {t.used} running</span>
            </ItemContent>
          </Item>
        ))}
      </Rows>
    </AttributeCard>
  );
}

function ChipList({ items, mono }: { items: string[]; mono?: boolean }) {
  return <div className="flex flex-wrap gap-1.5">{items.map((i) => <Badge key={i} variant="secondary" className={cn('max-w-full whitespace-normal rounded-md', mono && 'font-mono text-xs')}>{i}</Badge>)}</div>;
}

function TemplatePage({ t }: { t: Template }) {
  return (
    <div className="grid min-w-0 gap-4">
      <AttributeCard title={t.name} icon={FileText} action={<div className="flex gap-1.5"><Button size="xs" variant="outline"><GitFork />Fork</Button><Button size="xs">Edit</Button></div>}>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role" value={t.role} />
            <Field label="Host" value={t.host} />
            <Field label="Version" value={`${t.version}, pinned at each stage start`} />
            <Field label="Forked from" value={t.forkedFrom} />
          </div>
          <Separator />
          <div className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">Owned paths</span><ChipList items={t.ownedPaths} mono /></div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Pinned context pages (always served into the brief)</span>
            <Rows>{t.pinned.map((p) => <WideRow key={p.page} icon={BookOpen} title={p.page} sub={p.why} />)}</Rows>
          </div>
          <div className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">Allowed commands</span><ChipList items={t.commands} mono /></div>
          <div className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">Skills</span><ChipList items={t.skills} /></div>
        </div>
      </AttributeCard>
      <div className="grid gap-4">
        <AttributeCard title="Proof rules" icon={ShieldCheck}>
          <Rows>{t.proofRules.map((r) => <WideRow key={r} icon={Check} tone="ok" title={r} />)}</Rows>
        </AttributeCard>
        <AttributeCard title="Hand-back and questions" icon={ListChecks}>
          <div className="grid gap-3"><Field label="Hand-back format" value={t.handBack} /><Field label="Question policy" value={t.questionPolicy} /></div>
        </AttributeCard>
      </div>
      <Machinery>template {t.id} · {t.version} · served into the brief at each stage start</Machinery>
    </div>
  );
}

function Templates() {
  const [sel, setSel] = useState(templates[0].id);
  const t = templates.find((x) => x.id === sel) ?? templates[0];
  return (
    <AppFrame place="agents" views={['Templates', 'Live', 'Workflows', 'Monitor']} view="Templates" icon={Bot} title="Agents · Templates" description="Who may do what. A template is served into every brief that uses it." actions={<Button size="sm"><Sparkles />New template</Button>}>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[280px_1fr]">
        <TemplateList selected={sel} onSelect={setSel} />
        <TemplatePage t={t} />
      </div>
    </AppFrame>
  );
}

/* ----------------------------------------------------------- Agents · Live */

function Live() {
  return (
    <AppFrame place="agents" views={['Templates', 'Live', 'Workflows', 'Monitor']} view="Live" icon={Bot} title="Agents · Live" description="Who is running, on what, and who started them.">
      <p className="text-sm text-muted-foreground">Instances start and stop on the machine they run on. Release a hold here when a story is stuck behind an idle worker.</p>
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Instance</TableHead><TableHead>Template</TableHead><TableHead>Story and stage</TableHead><TableHead className="text-right">Idle</TableHead><TableHead>Host</TableHead><TableHead>Started by</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.map((a) => (
              <TableRow key={a.id} className={cn(a.state === 'stalled' && 'bg-warning/10 hover:bg-warning/15')}>
                <TableCell><span className="flex items-center gap-1.5"><Holder agent={a.id} /><span className="font-mono text-xs">{a.id}</span></span></TableCell>
                <TableCell>{a.template}</TableCell>
                <TableCell><span className="grid min-w-44"><span className="whitespace-normal">{a.storyTitle}</span><span className="text-xs text-muted-foreground">{a.stage}</span></span></TableCell>
                <TableCell className={cn('text-right tabular-nums', a.idleMinutes > 180 && 'font-medium text-warning-foreground dark:text-warning')}>{a.idleMinutes} min</TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.host}</TableCell>
                <TableCell><span className="flex items-center gap-1.5"><Avatar className="size-5 rounded-full"><AvatarFallback className="rounded-full text-[10px]">{initials(a.startedBy)}</AvatarFallback></Avatar>{a.startedBy}</span></TableCell>
                <TableCell>{a.state === 'stalled' ? <Button size="xs" variant="outline">Release hold</Button> : null}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Machinery>stories {instances.map((i) => i.story).join(', ')} · idle minutes come from each instance’s last activity</Machinery>
    </AppFrame>
  );
}

/* ------------------------------------------------------ Agents · Workflows */

function Workflows() {
  return (
    <AppFrame place="agents" views={['Templates', 'Live', 'Workflows', 'Monitor']} view="Workflows" icon={WorkflowIcon} title="Agents · Workflows" description={`${workflow.name} ${workflow.version}, forked from ${workflow.forkedFrom}. ${workflow.stories} stories follow it.`} actions={<Button size="sm" variant="outline"><GitFork />Fork</Button>}>
      <AttributeCard title={<>Stages in order <Count n={stages.length} /></>} icon={ListChecks}>
        <Rows>
          {stages.map((s) => (
            <Item key={s.n} size="sm" className="flex-wrap items-start rounded-none px-0">
              <ItemMedia className="size-8 rounded-md bg-muted text-sm font-semibold tabular-nums text-muted-foreground">{s.n}</ItemMedia>
              <ItemContent className="min-w-0 basis-40 flex-1">
                <ItemTitle>{s.name}</ItemTitle>
                <ItemDescription className="text-xs">Check: {s.check}</ItemDescription>
              </ItemContent>
              <div className="grid w-full min-w-0 grid-cols-2 gap-x-4 gap-y-1 pl-11 text-xs sm:grid-cols-4">
                <Field label="Template" value={s.template} />
                <Field label="Skill" value={s.skill} />
                <span className="grid gap-0.5"><span className="text-xs font-medium text-muted-foreground">Gate</span>{s.gate === 'none' ? <span className="text-muted-foreground">none</span> : <Badge variant="outline" className={cn(PILL, TONE.wait, 'w-fit whitespace-nowrap')}><Hourglass className="size-3" aria-hidden />{s.gate}</Badge>}</span>
                <Field label="Check time limit" value={s.limit} />
              </div>
            </Item>
          ))}
        </Rows>
      </AttributeCard>
      <Machinery>workflow build-lane {workflow.version} · stages follow the version a story started with</Machinery>
    </AppFrame>
  );
}

/* ------------------------------------------------------- Agents · Monitor */

function Monitor() {
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(rules.map((r) => [r.id, r.enabled])));
  const noisy = (r: Rule) => precision(r) < NOISY_BELOW;
  return (
    <AppFrame place="agents" views={['Templates', 'Live', 'Workflows', 'Monitor']} view="Monitor" icon={Radar} title="Agents · Monitor" description="Rules that watch the record and raise flags. A rule that is often dismissed is marked noisy.">
      <RecordStatRow stats={[{ label: 'Rules', value: rules.length }, { label: 'Fires, last 14 days', value: rules.reduce((n, r) => n + r.fires, 0) }, { label: 'Dismissed', value: rules.reduce((n, r) => n + r.dismissed, 0) }, { label: 'Noisy rules', value: rules.filter(noisy).length }]} />
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead><TableHead className="text-right">Fires</TableHead><TableHead className="text-right">Dismissed</TableHead><TableHead className="text-right">Precision</TableHead><TableHead>Threshold</TableHead><TableHead>On</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id} className={cn(noisy(r) && 'bg-warning/10 hover:bg-warning/15')}>
                <TableCell>
                  <span className="grid min-w-52 gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5">{r.name}{noisy(r) ? <Badge variant="outline" className={cn(PILL, TONE.wait)}>Noisy</Badge> : null}</span>
                    <span className="whitespace-normal text-xs text-muted-foreground">{r.watches}</span>
                    <span className="font-mono text-xs text-muted-foreground">{r.command}</span>
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.fires}</TableCell>
                <TableCell className="text-right tabular-nums">{r.dismissed}</TableCell>
                <TableCell className={cn('text-right tabular-nums', noisy(r) && 'font-medium text-warning-foreground dark:text-warning')}>{precision(r)}%</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{r.threshold} <Button size="xs" variant="ghost">Tune</Button></TableCell>
                <TableCell><Checkbox checked={on[r.id]} onCheckedChange={(v) => setOn((o) => ({ ...o, [r.id]: Boolean(v) }))} aria-label={`${r.name} on`} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">Precision is fires that were not dismissed. Under {NOISY_BELOW}% a rule is marked noisy. A rule only advises; no rule can stop a session.</p>
      <Machinery>seeded from the board-lag script · rules board-lag/*</Machinery>
    </AppFrame>
  );
}

/* ------------------------------------------------------------- Knowledge */

const PAGE_TONE: Record<PageState, string> = { current: TONE.ok, 'needs check': TONE.wait, 'archive candidate': TONE.plain };
const KNOWLEDGE_VIEWS = ['Pages', 'Decisions', 'Facts'];

function Pages() {
  const [view, setView] = useState<string[]>(['all']);
  const [filter, setFilter] = useState<SearchAndFilterValue>(EMPTY_SEARCH);
  const q = filter.q.toLowerCase();
  const rows = pages.filter((p) => (view[0] === 'all' || p.state === view[0]) && (!q || `${p.title} ${p.kind}`.toLowerCase().includes(q)) && (!(filter.facets.kind ?? []).length || filter.facets.kind.includes(p.kind)));
  const kinds = [...new Set(pages.map((p) => p.kind))];
  return (
    <AppFrame place="knowledge" views={KNOWLEDGE_VIEWS} view="Pages" icon={BookOpen} title="Knowledge · Pages" description="Pages agents read, with whether they are still true and whether anyone reads them.">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup value={view} onValueChange={(v: string[]) => { if (v[0]) setView(v); }} variant="outline" size="sm" aria-label="Page state" className="flex-wrap">
          <ToggleGroupItem value="all">All {pages.length}</ToggleGroupItem>
          <ToggleGroupItem value="current">Current</ToggleGroupItem>
          <ToggleGroupItem value="needs check">Needs check</ToggleGroupItem>
          <ToggleGroupItem value="archive candidate">Archive candidates</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <SearchAndFilter value={filter} onChange={setFilter} searchPlaceholder="Search pages" facets={[{ id: 'kind', title: 'Kind', options: kinds.map((k) => ({ label: k, value: k, count: pages.filter((p) => p.kind === k).length })) }]} trailing={<span className="text-xs text-muted-foreground tabular-nums">{rows.length} of {pages.length} pages</span>} />
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader><TableRow><TableHead>Page</TableHead><TableHead>State</TableHead><TableHead>Verified</TableHead><TableHead className="text-right">Served</TableHead><TableHead className="text-right">Cited</TableHead><TableHead>Last served</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><span className="grid min-w-48"><span className="whitespace-normal">{p.title}</span><span className="text-xs text-muted-foreground">{p.kind}</span></span></TableCell>
                  <TableCell><Badge variant="outline" className={cn(PILL, PAGE_TONE[p.state])}>{p.state === 'archive candidate' ? <Archive className="size-3" aria-hidden /> : p.state === 'needs check' ? <Hourglass className="size-3" aria-hidden /> : <Check className="size-3" aria-hidden />}{p.state === 'current' ? 'Current' : p.state === 'needs check' ? 'Needs check' : 'Archive candidate'}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{p.verified}<br /><span className="font-mono">{p.verifiedAt}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{p.served}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.cited}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{p.lastServed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : <Card><EmptyState compact icon={BookOpen} title="No page matches" description="Clear a filter to see every page." /></Card>}
      <p className="text-xs text-muted-foreground">Needs check: files in the page’s scope changed after it was verified. Archive candidate: not served or cited for 30 days. Archiving takes a page out of briefs and never deletes it.</p>
      <Machinery>verified at is the commit the page was last checked against</Machinery>
    </AppFrame>
  );
}

function Decisions() {
  const [filter, setFilter] = useState<SearchAndFilterValue>(EMPTY_SEARCH);
  const q = filter.q.toLowerCase();
  const src = filter.facets.source ?? [];
  const rows = decisions.filter((d) => (!src.length || src.includes(d.source)) && (!q || `${d.question} ${d.answer} ${d.scope}`.toLowerCase().includes(q)));
  const sources = ['chat', 'board', 'interview', 'command line'];
  return (
    <AppFrame place="knowledge" views={KNOWLEDGE_VIEWS} view="Decisions" icon={BookOpen} title="Knowledge · Decisions" description="Everything the owner already decided. Searched before any question reaches the owner.">
      <SearchAndFilter value={filter} onChange={setFilter} searchPlaceholder="Search decisions" facets={[{ id: 'source', title: 'Source', options: sources.map((s) => ({ label: s, value: s, count: decisions.filter((d) => d.source === s).length })) }]} trailing={<span className="text-xs text-muted-foreground tabular-nums">{rows.length} of {decisions.length} decisions</span>} />
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader><TableRow><TableHead>Question</TableHead><TableHead>Answer</TableHead><TableHead>By</TableHead><TableHead>Source</TableHead><TableHead>Date</TableHead><TableHead>Scope</TableHead><TableHead>Replaces</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.map((d) => {
                const replaced = decisions.some((x) => x.replaces.includes(d.date) && x.question === d.question && x.id !== d.id);
                return (
                  <TableRow key={d.id} className={cn(replaced && 'opacity-60')}>
                    <TableCell className="min-w-48 whitespace-normal">{d.question}{replaced ? <Badge variant="outline" className={cn(PILL, TONE.plain, 'ml-1.5')}>Replaced</Badge> : null}</TableCell>
                    <TableCell className="min-w-48 whitespace-normal">{d.answer}</TableCell>
                    <TableCell>{d.by}</TableCell>
                    <TableCell><Badge variant="secondary" className="rounded-md">{d.source}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{d.date}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{d.scope}</TableCell>
                    <TableCell className="min-w-32 whitespace-normal text-xs text-muted-foreground">{d.replaces || 'nothing'}</TableCell>
                    <TableCell><Button size="xs" variant="ghost">Replace</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : <Card><EmptyState compact icon={BookOpen} title="No decision matches" description="Clear the search to see every decision." /></Card>}
      <p className="text-xs text-muted-foreground">A decision is never archived for not being read. Only a newer decision that replaces it retires it.</p>
      <Machinery>decisions {decisions.map((d) => d.id).slice(0, 3).join(', ')} and {decisions.length - 3} more</Machinery>
    </AppFrame>
  );
}

function Facts() {
  return (
    <AppFrame place="knowledge" views={KNOWLEDGE_VIEWS} view="Facts" icon={BookOpen} title="Knowledge · Facts" description="What is true right now: ports, versions, where things live. Read only.">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4 shrink-0" aria-hidden />Generated by probes. Nobody types a fact; a wrong one is fixed by fixing its probe.</p>
      <AttributeCard title={<>Facts <Count n={facts.length} /></>} icon={Sparkles}>
        <Rows>
          {facts.map((f) => (
            <WideRow key={f.key} icon={Sparkles} title={<span className="font-mono text-sm">{f.key}</span>} sub={f.value} trailing={<span className="text-xs text-muted-foreground">refreshed {f.at}</span>}>
              <span className="text-xs text-muted-foreground">Probe: <span className="font-mono">{f.probe}</span></span>
            </WideRow>
          ))}
        </Rows>
      </AttributeCard>
      <Machinery>each fact is also the resource codeloop://fact/&lt;key&gt;</Machinery>
    </AppFrame>
  );
}

/* ------------------------------------------------------------------ Page */

export default function MockC374ThreePartsPage() {
  return (
    <TooltipProvider>
      <PageLayout
        icon={Cloud}
        breadcrumbs={[{ label: 'Mocks' }, { label: 'c-374' }]}
        title="Orchestrator, workers and server"
        description="New views inside Today, Agents and Knowledge. The other places and every approved screen are unchanged. Mock data."
        badge={<Badge variant="outline" className="rounded-full">Mock</Badge>}
      >
        <div style={{ display: 'grid', gap: 40, minWidth: 0 }}>
          <nav className="sticky top-0 z-10 flex flex-wrap gap-1.5 border-b bg-background py-2" aria-label="Screens in this mock">
            {NAV.map((n) => <Button key={n.id} size="xs" variant="ghost" nativeButton={false} render={<a href={`#${n.id}`} />}>{n.label}</Button>)}
          </nav>
          <section id="today" data-screen="today" className="scroll-mt-16">
            <Screen title="Today · Decide and Moving" icon={Home} note="Monitor flags sit with the three decision shapes, each with its suggested command and a Dismiss that asks for a reason. A question the owner already answered shows when it was decided instead of asking again. Moving rows name the instance, template, host, idle minutes and hand-back.">
              <Today />
            </Screen>
          </section>
          <section id="templates" data-screen="templates" className="scroll-mt-16">
            <Screen title="Agents · Templates" icon={Bot} note="The library on the left, one template page on the right. Pick a template to see its role, owned paths, pinned pages, commands, skills, proof rules, hand-back format, question policy, version and where it was forked from.">
              <Templates />
            </Screen>
          </section>
          <section id="live" data-screen="live" className="scroll-mt-16">
            <Screen title="Agents · Live" icon={Users} note="The who view. The stalled worker is amber; release its hold from the row.">
              <Live />
            </Screen>
          </section>
          <section id="workflows" data-screen="workflows" className="scroll-mt-16">
            <Screen title="Agents · Workflows" icon={WorkflowIcon} note="Stages in order. Each names the template that does it, the skill, the check, the gate and how long the check may run.">
              <Workflows />
            </Screen>
          </section>
          <section id="monitor" data-screen="monitor" className="scroll-mt-16">
            <Screen title="Agents · Monitor" icon={Radar} note="Each rule with its fires, dismissals and measured precision. Rules people mostly dismiss are marked noisy.">
              <Monitor />
            </Screen>
          </section>
          <section id="pages" data-screen="pages" className="scroll-mt-16">
            <Screen title="Knowledge · Pages" icon={BookOpen} note="Each page shows its state, when it was last verified, and how often it was served into a brief and cited.">
              <Pages />
            </Screen>
          </section>
          <section id="decisions" data-screen="decisions" className="scroll-mt-16">
            <Screen title="Knowledge · Decisions" icon={BookOpen} note="One searchable list: question, answer, who, source, date, scope and what it replaces.">
              <Decisions />
            </Screen>
          </section>
          <section id="facts" data-screen="facts" className="scroll-mt-16">
            <Screen title="Knowledge · Facts" icon={BookOpen} note="Generated and read only.">
              <Facts />
            </Screen>
          </section>
        </div>
      </PageLayout>
    </TooltipProvider>
  );
}
