'use client';

// codeloop-mock-app: c-381
// Mock for c-381 Install learns my existing service and asks six setup questions. Delete or keep it as the spec's `mock:` line says (`codeloop mock cleanup c-381`).
// Two screens inside the approved Settings place: Getting started (what install found, learning, the
// ten-line summary) and Setup questions (six questions with recommended answers, accept all, the preset
// with each step switchable). The shell, rail and row pattern are the approved three-parts frames;
// nothing else in the app changes. Screens are stacked so the mocks gallery can measure each one.
// Layout only in style={{ }} (display, gap, grid, padding, minWidth); the components do the rest.
import { useState } from 'react';
import {
  Ban, BookOpen, Bot, Check, CheckCheck, Cloud, Database, FileText, Flame, GitBranch, Home, Hourglass, Layers, ListChecks, Rocket, ScanSearch, Settings, ShieldCheck, SkipForward, Sparkles, Table2, Terminal, Timer, Users, X,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageLayout } from '@/components/shared/page-layout';
import { AttributeCard, RecordStatRow, SectionHeading } from '@/components/shared/record-layout';
import { ProgressBar } from '@/components/shared/progress-bar';
import { cn } from '@/lib/utils';
import {
  commands, conventions, filesAdded, found, hotSpots, modulePages, neverRules, presets, questions, summary,
  type CommandRun, type Preset, type QuestionCard,
} from './mock-data';

const NAV = [
  { id: 'getting-started', label: 'Getting started' },
  { id: 'setup-questions', label: 'Setup questions' },
];

// The six approved places. Both screens live in Settings, where the shell already sends a project that is not set up.
type Place = 'today' | 'work' | 'product' | 'knowledge' | 'agents' | 'settings';
const PLACES: { key: Place; label: string; icon: typeof Home; hint: string }[] = [
  { key: 'today', label: 'Today', icon: Home, hint: 'decide, then see what moved' },
  { key: 'work', label: 'Work', icon: Table2, hint: 'ideas to live' },
  { key: 'product', label: 'Product', icon: Layers, hint: 'what runs where' },
  { key: 'knowledge', label: 'Knowledge', icon: BookOpen, hint: 'pages, decisions, facts' },
  { key: 'agents', label: 'Agents', icon: Bot, hint: 'templates, who, workflows' },
  { key: 'settings', label: 'Settings', icon: Settings, hint: 'team, process, rules' },
];
const VIEWS = ['Getting started', 'Setup questions'];

type RowTone = 'plain' | 'wait' | 'bad' | 'ok';

const PILL = 'shrink-0 gap-1 rounded-full border-transparent';
const TONE: Record<RowTone | 'agent', string> = {
  agent: 'bg-ai/15 text-ai',
  wait: 'bg-warning/15 text-warning-foreground dark:text-warning',
  ok: 'bg-success/15 text-success',
  bad: 'bg-destructive/15 text-destructive',
  plain: 'bg-muted text-foreground',
};

function RowTile({ icon: Icon, tone = 'plain' }: { icon: typeof Home; tone?: RowTone }) {
  return (
    <ItemMedia className={cn('size-8 rounded-md', tone === 'plain' && 'bg-muted text-muted-foreground', tone === 'wait' && 'bg-warning/15 text-warning', tone === 'bad' && 'bg-destructive/10 text-destructive', tone === 'ok' && 'bg-success/15 text-success')}>
      <Icon className="size-4" aria-hidden />
    </ItemMedia>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col divide-y">{children}</div>;
}

/** Label over value, so a long value wraps under its label instead of squeezing beside it. */
function Field({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <span className="grid min-w-0 content-start gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="break-words text-sm">{value}</span>
      {sub ? <span className="break-all font-mono text-xs text-muted-foreground">{sub}</span> : null}
    </span>
  );
}

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">{n}</span>;
}

/** A row that is allowed to wrap: title, sub-line, then free content, with actions under it on phones. */
function WideRow({ icon, tone, title, sub, trailing, leading, children }: { icon?: typeof Home; tone?: RowTone; title: React.ReactNode; sub?: React.ReactNode; trailing?: React.ReactNode; leading?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Item size="sm" className="flex-wrap rounded-none px-0">
      {leading}
      {icon ? <RowTile icon={icon} tone={tone} /> : null}
      <ItemContent className="min-w-0 basis-48 flex-1">
        <ItemTitle className="w-full min-w-0 whitespace-normal">{title}</ItemTitle>
        {sub ? <ItemDescription className="line-clamp-none text-xs">{sub}</ItemDescription> : null}
      </ItemContent>
      {trailing ? <ItemActions className="flex-wrap justify-end max-sm:w-full max-sm:justify-start max-sm:pl-11">{trailing}</ItemActions> : null}
      {children ? <div className="grid w-full gap-1.5 pl-11">{children}</div> : null}
    </Item>
  );
}

/** The signed-in shell: the rail with the six approved places; a view strip names the view in the place. */
function AppFrame({ place, view, icon: Icon, title, description, actions, children }: { place: Place; view: string; icon: typeof Home; title: string; description: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:grid-cols-[208px_1fr]">
      <nav className="hidden flex-col gap-1 border-r bg-sidebar p-3 lg:flex" aria-label="Workspace rail">
        <div className="mb-3 flex items-center gap-2 px-1">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Cloud className="size-4" aria-hidden /></span>
          <span className="grid leading-tight"><span className="text-sm font-semibold">Codeloop</span><span className="text-xs text-muted-foreground">Acme billing</span></span>
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
        <div className="flex flex-wrap gap-1 border-b pb-2" aria-label={`${title} views`}>
          {VIEWS.map((v) => <Button key={v} size="xs" variant="ghost" className={cn(view === v && 'bg-accent font-medium text-accent-foreground')} aria-current={view === v ? 'page' : undefined}>{v}</Button>)}
        </div>
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

/* ------------------------------------------------------- Getting started */

const RESULT: Record<CommandRun['result'], { label: string; tone: RowTone; icon: typeof Home }> = {
  ok: { label: 'Works', tone: 'ok', icon: Check },
  failed: { label: 'Fails today', tone: 'bad', icon: X },
  stopped: { label: 'Did not complete', tone: 'wait', icon: Timer },
  skipped: { label: 'Skipped', tone: 'plain', icon: SkipForward },
};

const seconds = (s?: number) => (s === undefined ? '' : s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`);

function GettingStarted() {
  const ran = commands.filter((c) => c.result !== 'skipped');
  const finished = ran.filter((c) => c.result !== 'stopped');
  return (
    <AppFrame place="settings" view="Getting started" icon={Rocket} title="Getting started" description="Installed and learned. Nothing left this machine. Read the summary, then answer the six questions." actions={<Button size="sm"><ListChecks />Answer the six questions</Button>}>
      <RecordStatRow stats={[{ label: 'Languages found', value: 2 }, { label: 'Files added to the repo', value: filesAdded.length }, { label: 'Commands that completed', value: `${finished.length} of ${ran.length}` }, { label: 'Pages drafted', value: modulePages.length + 2 }]} />

      <div className="rounded-xl bg-card px-3 ring-1 ring-foreground/10">
        <WideRow icon={Bot} tone="ok" title="Your AI tool now opens as the lead agent for this repository" sub="Its first message: “I am the lead agent for this repository. I have learned the codebase; six questions are waiting for you on Setup questions.” A session it starts for a task gets the task-agent instructions instead.">
          <div className="flex flex-wrap gap-1.5"><Badge variant="outline" className={cn(PILL, TONE.agent)}>Claude Code</Badge><Badge variant="outline" className={cn(PILL, TONE.plain)}>Cursor</Badge><Badge variant="outline" className={cn(PILL, TONE.plain)}>Codex</Badge></div>
        </WideRow>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_320px]">
        <AttributeCard title="What Codeloop found" icon={ScanSearch}>
          <div className="grid gap-4 sm:grid-cols-2">
            {found.map((f) => <Field key={f.label} label={f.label} value={f.value} sub={f.source} />)}
          </div>
        </AttributeCard>
        <AttributeCard title="Five files added" icon={FileText} action={<Badge variant="outline" className={cn(PILL, TONE.ok)}><Check className="size-3" aria-hidden />nothing else changed</Badge>}>
          <Rows>
            {filesAdded.map((f) => (
              <Item key={f} size="sm" className="rounded-none px-0">
                <ItemMedia className="size-6 text-success"><Check className="size-3.5" aria-hidden /></ItemMedia>
                <ItemContent className="min-w-0"><ItemTitle className="font-mono text-xs font-normal">{f}</ItemTitle></ItemContent>
              </Item>
            ))}
          </Rows>
          <p className="mt-3 text-xs text-muted-foreground">Skills, steps and agent roles stay in the Codeloop package; agents get them when they ask for a brief. The git hooks sit under .git, outside the repository.</p>
        </AttributeCard>
      </div>

      <AttributeCard title={<>Learning <Count n={commands.length} /></>} icon={Terminal} action={<span className="flex items-center gap-2 text-xs text-muted-foreground"><ProgressBar done={commands.length} total={commands.length} /> done in 9 min 14 s</span>}>
        <p className="mb-3 text-sm text-muted-foreground">Every build and test command found was run once, under a five-minute limit each, so the checks Codeloop proposes are the ones that work here. A command that looks like a deploy is never run.</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Command</TableHead><TableHead>Where</TableHead><TableHead>Result</TableHead><TableHead className="text-right">Time</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
            <TableBody>
              {commands.map((c) => {
                const r = RESULT[c.result];
                return (
                  <TableRow key={c.command} className={cn(c.result === 'stopped' && 'bg-warning/10 hover:bg-warning/15')}>
                    <TableCell className="font-mono text-xs">{c.command}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.where}</TableCell>
                    <TableCell><Badge variant="outline" className={cn(PILL, TONE[r.tone])}><r.icon className="size-3" aria-hidden />{r.label}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">{seconds(c.seconds)}</TableCell>
                    <TableCell className="whitespace-normal text-xs text-muted-foreground">{c.note}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </AttributeCard>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <AttributeCard title={<>Pages drafted <Count n={modulePages.length + 2} /></>} icon={BookOpen} action={<Button size="xs" variant="outline">Open Knowledge</Button>}>
          <Rows>
            {modulePages.map((m) => (
              <WideRow key={m.module} icon={Database} title={<span className="font-mono text-sm">{m.module}</span>} sub={<>Owns {m.owns}</>} trailing={<Badge variant="outline" className={cn(PILL, TONE.wait)}><Hourglass className="size-3" aria-hidden />Draft</Badge>} />
            ))}
            <WideRow icon={GitBranch} title="Conventions" sub="Three rules the code follows today, each with where it was seen" trailing={<Badge variant="outline" className={cn(PILL, TONE.wait)}><Hourglass className="size-3" aria-hidden />Draft</Badge>} />
            <WideRow icon={Flame} title="Risky areas" sub="Files changed most in twelve months, and changes that were later reverted" trailing={<Badge variant="outline" className={cn(PILL, TONE.wait)}><Hourglass className="size-3" aria-hidden />Draft</Badge>} />
          </Rows>
          <p className="mt-3 text-xs text-muted-foreground">A draft is served to agents marked as draft. Confirm or correct a page on Knowledge; a correction is kept as a decision so no agent asks again.</p>
        </AttributeCard>
        <AttributeCard title="The summary, ten lines" icon={Sparkles}>
          <ol className="grid list-decimal gap-1.5 pl-5 text-sm marker:text-muted-foreground">
            {summary.map((line) => <li key={line}>{line}</li>)}
          </ol>
        </AttributeCard>
      </div>
    </AppFrame>
  );
}

/* -------------------------------------------------------- Setup questions */

function Decided({ children }: { children?: React.ReactNode }) {
  return <Badge variant="outline" className={cn(PILL, TONE.ok)}><Check className="size-3" aria-hidden />{children ?? 'Decided by Dean, just now'}</Badge>;
}

function QuestionBlock({ q, decided, onAccept, onReopen, children }: { q: QuestionCard; decided: boolean; onAccept: () => void; onReopen: () => void; children: React.ReactNode }) {
  return (
    <AttributeCard
      title={<><span className="text-muted-foreground tabular-nums">{q.n}</span> {q.title}</>}
      action={decided
        ? <span className="flex items-center gap-1.5"><Decided /><Button size="xs" variant="ghost" onClick={onReopen}>Change</Button></span>
        : <span className="flex items-center gap-1.5"><Button size="xs" variant="outline">Change</Button><Button size="xs" onClick={onAccept}><Check />Accept</Button></span>}
    >
      <div className="grid gap-3">
        <p className="text-sm"><span className="font-medium">Recommended:</span> {q.recommended} <span className="text-muted-foreground">Based on {q.from}.</span></p>
        <Separator />
        {children}
      </div>
    </AttributeCard>
  );
}

function PresetPicker({ preset, onPreset }: { preset: Preset; onPreset: (id: Preset['id']) => void }) {
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const isOn = (name: string, fallback: boolean) => steps[`${preset.id}:${name}`] ?? fallback;
  return (
    <div className="grid gap-3">
      <ToggleGroup value={[preset.id]} onValueChange={(v: string[]) => { if (v[0]) onPreset(v[0] as Preset['id']); }} variant="outline" size="sm" aria-label="How much process" className="flex-wrap">
        {presets.map((p) => <ToggleGroupItem key={p.id} value={p.id} className="gap-1.5">{p.name}{p.recommended ? <Badge variant="secondary" className="rounded-full text-[10px]">recommended</Badge> : null}</ToggleGroupItem>)}
      </ToggleGroup>
      <p className="text-sm text-muted-foreground">{preset.summary} Switch any step off below; a step that is off is skipped and the skip is recorded on the item.</p>
      <Rows>
        {preset.steps.map((s, i) => (
          <WideRow key={s.name} leading={<Checkbox checked={isOn(s.name, s.on)} disabled={s.fixed} onCheckedChange={(v) => setSteps((o) => ({ ...o, [`${preset.id}:${s.name}`]: Boolean(v) }))} aria-label={`${s.name} on`} />}
            title={<><span className="text-muted-foreground tabular-nums">{i + 1}.</span> {s.name}</>}
            sub={s.fixed ? 'Always on' : s.note ? `Runs for ${s.note}` : undefined} />
        ))}
      </Rows>
    </div>
  );
}

function SetupQuestions() {
  const [decided, setDecided] = useState<Record<number, boolean>>({});
  const [presetId, setPresetId] = useState<Preset['id']>('standard');
  const [sensitive, setSensitive] = useState<Record<string, boolean>>(() => Object.fromEntries(hotSpots.map((h) => [h.module, h.suggested])));
  const [rules, setRules] = useState<string[]>(neverRules.map((r) => r.rule));
  const [newRule, setNewRule] = useState('');
  const [keep, setKeep] = useState<Record<string, boolean>>(() => Object.fromEntries(conventions.map((c) => [c.rule, true])));
  const preset = presets.find((p) => p.id === presetId) ?? presets[1];
  const left = questions.filter((q) => !decided[q.n]).length;
  const all = Object.fromEntries(questions.map((q) => [q.n, true]));
  const block = (n: number) => ({ decided: Boolean(decided[n]), onAccept: () => setDecided((d) => ({ ...d, [n]: true })), onReopen: () => setDecided((d) => ({ ...d, [n]: false })) });
  return (
    <AppFrame place="settings" view="Setup questions" icon={ListChecks} title="Setup questions" description={left ? `Six questions about what the code cannot tell us. Each has a recommended answer from what was learned; ${left} still open.` : 'All six answered. Your work process, rules and six decisions are recorded; the first piece of work can start.'}
      actions={left ? <><Button size="sm" variant="outline">Answer one by one</Button><Button size="sm" onClick={() => setDecided(all)}><CheckCheck />Accept all six</Button></> : <Button size="sm"><Rocket />Start the first piece of work</Button>}>
      <RecordStatRow stats={[{ label: 'Open', value: left }, { label: 'Decided', value: questions.length - left }, { label: 'Process', value: preset.name }, { label: 'Never-rules', value: rules.length }]} />

      <QuestionBlock q={questions[0]} {...block(1)}>
        <Rows>
          {hotSpots.map((h) => (
            <WideRow key={h.module} leading={<Checkbox checked={sensitive[h.module]} onCheckedChange={(v) => setSensitive((s) => ({ ...s, [h.module]: Boolean(v) }))} aria-label={`${h.module} is sensitive`} />}
              title={<span className="font-mono text-sm">{h.module}</span>}
              sub={<>{h.changes} changes in twelve months{h.reverts ? ` · ${h.reverts} reverted` : ''}</>}
              trailing={h.reverts ? <Badge variant="outline" className={cn(PILL, TONE.bad)}><Flame className="size-3" aria-hidden />{h.reverts} {h.reverts === 1 ? 'revert' : 'reverts'}</Badge> : h.suggested ? <Badge variant="outline" className={cn(PILL, TONE.wait)}>writes balances</Badge> : null} />
          ))}
        </Rows>
        <p className="text-xs text-muted-foreground">A work item that touches a ticked area waits for your approval of its plan before build. Nothing else changes for the other areas.</p>
      </QuestionBlock>

      <QuestionBlock q={questions[1]} {...block(2)}>
        <PresetPicker preset={preset} onPreset={setPresetId} />
      </QuestionBlock>

      <QuestionBlock q={questions[2]} {...block(3)}>
        <Rows>
          <WideRow icon={Bot} tone="ok" title="A separate AI reviewer checks every change" sub="It never reviews its own work; a task agent and its reviewer are always two sessions." trailing={<Badge variant="outline" className={cn(PILL, TONE.agent)}>every change</Badge>} />
          <WideRow icon={Users} title="You review sensitive areas and anything that leaves the machine" sub="Pushes, releases and anything that touches a production system wait for you by name." trailing={<Badge variant="outline" className={cn(PILL, TONE.wait)}><Hourglass className="size-3" aria-hidden />waits for Dean</Badge>} />
        </Rows>
      </QuestionBlock>

      <QuestionBlock q={questions[3]} {...block(4)}>
        <Rows>
          <WideRow leading={<Checkbox checked aria-label="lint counts as done" />} icon={Check} tone="bad" title={<span className="font-mono text-sm">npm run lint</span>} sub="From the pipeline. Red today: 3 errors in admin/src/pages. An item is not done while it fails." trailing={<Badge variant="outline" className={cn(PILL, TONE.bad)}>fails today</Badge>} />
          <WideRow leading={<Checkbox checked aria-label="test counts as done" />} icon={Check} tone="ok" title={<span className="font-mono text-sm">./mvnw -q test</span>} sub="From the pipeline. 318 tests, 4 min 12 s." trailing={<Badge variant="outline" className={cn(PILL, TONE.ok)}>works</Badge>} />
          <WideRow leading={<Checkbox checked aria-label="build counts as done" />} icon={Check} tone="ok" title={<span className="font-mono text-sm">npm run build</span>} sub="From the pipeline. 48 s." trailing={<Badge variant="outline" className={cn(PILL, TONE.ok)}>works</Badge>} />
          <WideRow leading={<Checkbox disabled aria-label="deploy is not a check" />} icon={Ban} title={<span className="font-mono text-sm">deploy</span>} sub="The pipeline's deploy job is not a check; it runs after done, and only when you say so." trailing={<Badge variant="outline" className={cn(PILL, TONE.plain)}>not a check</Badge>} />
        </Rows>
      </QuestionBlock>

      <QuestionBlock q={questions[4]} {...block(5)}>
        <Rows>
          {neverRules.filter((r) => rules.includes(r.rule)).map((r) => (
            <WideRow key={r.rule} leading={<Checkbox checked onCheckedChange={(v) => { if (!v) setRules((all) => all.filter((x) => x !== r.rule)); }} aria-label={`${r.rule} is a rule`} />}
              icon={r.how === 'hook' ? ShieldCheck : Users} tone={r.how === 'hook' ? 'ok' : 'plain'} title={r.rule} sub={r.why}
              trailing={<Badge variant="outline" className={cn(PILL, r.how === 'hook' ? TONE.ok : TONE.plain)}>{r.how === 'hook' ? 'enforced by a hook' : 'checked at review'}</Badge>} />
          ))}
          {rules.filter((r) => !neverRules.some((n) => n.rule === r)).map((r) => (
            <WideRow key={r} leading={<Checkbox checked onCheckedChange={(v) => { if (!v) setRules((all) => all.filter((x) => x !== r)); }} aria-label={`${r} is a rule`} />} icon={Users} title={r} sub="Added by you" trailing={<Badge variant="outline" className={cn(PILL, TONE.plain)}>checked at review</Badge>} />
          ))}
        </Rows>
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (newRule.trim()) { setRules((all) => [...all, newRule.trim()]); setNewRule(''); } }}>
          <Input value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="Add a rule, for example: never change the invoice numbering sequence" aria-label="New rule" className="min-w-0 flex-1 basis-64" />
          <Button size="sm" variant="outline" type="submit" disabled={!newRule.trim()}>Add</Button>
        </form>
      </QuestionBlock>

      <QuestionBlock q={questions[5]} {...block(6)}>
        <Rows>
          {conventions.map((c) => (
            <WideRow key={c.rule} leading={<Checkbox checked={keep[c.rule]} onCheckedChange={(v) => setKeep((k) => ({ ...k, [c.rule]: Boolean(v) }))} aria-label={`Keep: ${c.rule}`} />} icon={GitBranch} title={c.rule} sub={<>Seen in {c.from}</>} />
          ))}
        </Rows>
        <p className="text-xs text-muted-foreground">A kept convention is a rule every agent reads before it edits a file it applies to, with the date and where it was seen.</p>
      </QuestionBlock>

      <p className="text-xs text-muted-foreground">Each answer becomes a recorded decision with your name and the time, and sets the work process and the rules. Change any of them later under Settings; a change is a new decision, and the old one is kept.</p>
    </AppFrame>
  );
}

/* ------------------------------------------------------------------ Page */

export default function MockC381SetupPage() {
  return (
    <TooltipProvider>
      <PageLayout
        icon={Rocket}
        breadcrumbs={[{ label: 'Mocks' }, { label: 'Getting started' }]}
        title="Install learns the service and asks six questions"
        description="The first day's two screens inside Settings: Getting started and Setup questions. Every other place and approved screen is unchanged. Mock data for a made-up Java billing service."
        badge={<Badge variant="outline" className="rounded-full">Mock</Badge>}
      >
        <div style={{ display: 'grid', gap: 40, minWidth: 0 }}>
          <nav className="flex flex-wrap gap-1.5 border-b bg-background py-2" aria-label="Screens in this mock">
            {NAV.map((n) => <Button key={n.id} size="xs" variant="ghost" nativeButton={false} render={<a href={`#${n.id}`} />}>{n.label}</Button>)}
          </nav>
          <section id="getting-started" data-screen="Getting started" className="scroll-mt-16">
            <Screen title="Getting started" icon={Rocket} note="After one install command and about ten minutes of learning. What was found with where it was read, the five files and nothing else, every command run with its result and time (one failed, one stopped at its limit, one deploy skipped), the drafted pages, and the ten-line summary. The lead-agent row says what the AI tool will say when opened.">
              <GettingStarted />
            </Screen>
          </section>
          <section id="setup-questions" data-screen="Setup questions" className="scroll-mt-16">
            <Screen title="Setup questions" icon={ListChecks} note="Six questions, each with a recommended answer and where it came from. Accept all six at once or one at a time; Change reopens one. The process question shows the three presets with every step switchable; sensitive areas carry their churn and reverts; the never-rules say whether a hook enforces them or a reviewer checks them.">
              <SetupQuestions />
            </Screen>
          </section>
        </div>
      </PageLayout>
    </TooltipProvider>
  );
}
