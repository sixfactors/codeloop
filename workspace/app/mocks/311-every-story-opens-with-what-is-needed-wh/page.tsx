'use client';

// codeloop-mock-app: c-311
// Mock for c-311 Every story opens with what is needed, what is done and what I must do. Delete or keep it as the spec's `mock:` line says (`codeloop mock cleanup c-311`).
import { Check, ChevronRight, ClipboardList, FileText, History, ListChecks, Pencil, Sparkles, SquareCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AttributeCard } from '@/components/shared/record-layout';
import { FieldRow } from '@/components/shared/field-row';
import { JourneyStepper } from '@/components/shared/journey-stepper';
import { RubricRows } from '@/components/shared/rubric-rows';
import { TasksAndCommits } from '@/components/shared/tasks-commits';
import { StoryKey } from '@/components/shared/story-key';
import { InlineError } from '@/components/shared/inline-error';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { Markdown } from '@/components/shared/markdown';
import type { Journey } from '@/lib/types';
import { screens, type Line, type Summary } from './mock-data';

const s = screens['story-page'];

function Frame({ name, note, children }: { name: string; note: string; children: React.ReactNode }) {
  return (
    <Card data-frame={name}>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <p>{note}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Who({ l }: { l: Line }) {
  return <span className="text-xs text-muted-foreground">{l.byKind === 'board' ? 'from the board' : `by ${l.by}`} · {l.at} · at {l.step}</span>;
}

function SummaryLine({ label, l }: { label: string; l: Line }) {
  return (
    <FieldRow
      label={label}
      value={
        <span style={{ display: 'grid', gap: 2 }}>
          <span>{l.text}</span>
          <Who l={l} />
        </span>
      }
    />
  );
}

function StorySummary({ summary }: { summary: Summary }) {
  return (
    <AttributeCard
      title="Summary"
      icon={Sparkles}
      testId="story-summary"
      action={<Button size="sm" variant="ghost"><Pencil />Edit</Button>}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        {summary.mark === 'unwritten' ? <Badge variant="outline">Not yet written by an agent</Badge> : null}
        {summary.mark === 'stale' ? <Badge variant="outline">Written before the latest step</Badge> : null}
        <SummaryLine label="What it needs" l={summary.needed} />
        <SummaryLine label="What is done" l={summary.done} />
        <SummaryLine label="What you must do" l={summary.you} />
      </div>
    </AttributeCard>
  );
}

function Fold({ title, count, icon: Icon, open, children }: { title: string; count: string; icon: typeof History; open?: boolean; children: React.ReactNode }) {
  return (
    <Collapsible defaultOpen={open}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm">
        <ChevronRight className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
        <Icon className="size-4 text-muted-foreground" />
        <span>{title}</span>
        <Badge variant="outline" className="ml-auto">{count}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div style={{ display: 'grid', gap: 8, padding: 8 }}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function StoryPage({ summary, journey, gate, openChecks }: { summary: Summary; journey: Journey; gate: boolean; openChecks?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <div className="flex flex-wrap items-center gap-2">
        <StoryKey id={s.story.id} />
        <strong>{s.story.title}</strong>
      </div>
      <StorySummary summary={summary} />
      {gate ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm"><Check />Approve the plan</Button>
          <Button size="sm" variant="outline"><X />Send it back</Button>
        </div>
      ) : null}
      <JourneyStepper journey={journey} />
      <div style={{ display: 'grid', gap: 6 }}>
        <Fold title="Checks and scores" count="1 failing" icon={ListChecks} open={openChecks}>
          <RubricRows rubric={s.rubric} />
        </Fold>
        <Fold title="History" count={`${s.history.length} events`} icon={History}>
          <ItemGroup className="gap-1">
            {s.history.map((h) => (
              <Item key={h.at + h.text} variant="outline" size="sm">
                <ItemContent>
                  <ItemTitle>{h.text}</ItemTitle>
                  <ItemDescription>{h.at}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </Fold>
        <Fold title="Raw output" count="last check" icon={FileText}>
          <Markdown>{'```\n' + s.raw + '\n```'}</Markdown>
        </Fold>
        <Fold title="Tasks and commits" count="2 of 3 done" icon={SquareCheck}>
          <TasksAndCommits tasks={s.tasks} counts={{ done: 2, total: 3 }} commits={s.commits} />
        </Fold>
        <Fold title="Details" count={`${s.story.lane} · ${s.story.size}`} icon={ClipboardList}>
          <FieldRow label="Lane" value={s.story.lane} />
          <FieldRow label="Size" value={s.story.size} />
          <FieldRow label="Feature" value={s.story.feature} />
          <FieldRow label="Persona" value={s.story.persona} />
        </Fold>
      </div>
    </div>
  );
}

export default function MockC311StoryPagePage() {
  return (
    <TooltipProvider>
      <main style={{ display: 'grid', gap: 24, padding: 24 }}>
        <header>
          <h1>Every story opens with what is needed, what is done and what I must do</h1>
          <p>As a founder, I can open any story and read, above everything else, a short plain-English summary of what it needs, what is already done, and the one thing waiting on me, so that I don't dig through checks, rubric rows and logs to find my part.</p>
        </header>
        <section data-screen="story-page" style={{ display: 'grid', gap: 16 }}>
          <h2>Story page</h2>
          <Frame name="Needs you: an agent wrote the summary, the plan waits for you" note="US1, US2. Three lines on top, each with who wrote it and when; the buttons and the step bar sit under it; every other section is folded and keeps a count, and the failing check shows on its heading.">
            <StoryPage summary={s.written.summary} journey={s.written.journey} gate />
          </Frame>
          <Frame name="Normal: you edited a line, the agent added to it" note="US3. Your line on what it needs is kept and marked as yours; the agent's later turn added to what is done instead of replacing your words.">
            <StoryPage summary={s.edited.summary} journey={s.edited.journey} gate />
          </Frame>
          <Frame name="Normal: a folded section opened" note="US2. Opening Checks and scores shows the full rubric in place; nothing else moves.">
            <StoryPage summary={s.written.summary} journey={s.written.journey} gate openChecks />
          </Frame>
          <Frame name="Empty: no agent has written a summary yet" note="US4. The three lines are worked out from the board and marked as not yet written by an agent; nothing waits on you, so there are no buttons.">
            <StoryPage summary={s.unwritten.summary} journey={s.unwritten.journey} gate={false} />
          </Frame>
          <Frame name="Needs you: the summary is older than the story" note="US5. The agent's lines date from research and are marked as written before the latest step; what you must do comes from the board, so the waiting plan still shows.">
            <StoryPage summary={s.stale.summary} journey={s.stale.journey} gate />
          </Frame>
          <Frame name="Loading" note="The story has not arrived; the summary and sections show placeholders, not blank rows.">
            <PageSkeleton statCards={0} tableRows={5} showToolbar={false} />
          </Frame>
          <Frame name="Error: the story failed to load" note="The page says what failed and offers to try again; no summary is guessed.">
            <InlineError title={s.error.title} error={new Error(s.error.message)} onRetry={() => {}} />
          </Frame>
        </section>
      </main>
    </TooltipProvider>
  );
}
