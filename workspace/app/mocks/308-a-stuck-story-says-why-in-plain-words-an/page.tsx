'use client';

// codeloop-mock-app: c-308
// Mock for c-308 A stuck story says why in plain words and which action will move it. Delete or keep it as the spec's `mock:` line says (`codeloop mock cleanup c-308`).
import { AlertCircle, ArrowRight, CheckCircle2, ChevronRight, RotateCcw, Sparkles, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AttributeCard } from '@/components/shared/record-layout';
import { FieldRow } from '@/components/shared/field-row';
import { MetaChip } from '@/components/shared/meta-chip';
import { StoryKey } from '@/components/shared/story-key';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { Markdown } from '@/components/shared/markdown';
import { screens, type Stuck } from './mock-data';

const st = screens['stuck-story'];
const ib = screens['inbox-failing'];

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

function YouMustDo({ s }: { s: Stuck }) {
  return (
    <span style={{ display: 'grid', gap: 6 }}>
      <span>{s.action}</span>
      <span className="text-xs text-muted-foreground">Work tried: {s.tried}</span>
      <span className="text-xs text-muted-foreground">Shipped: {s.shipped}</span>
      <span className="text-xs text-muted-foreground">from the board · {s.at} · at {s.step}</span>
    </span>
  );
}

function StuckStory({ s }: { s: Stuck }) {
  return (
    <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <div className="flex flex-wrap items-center gap-2">
        <StoryKey id={s.id} />
        <strong>{s.title}</strong>
        <Badge variant="outline">Stuck at {s.step}</Badge>
      </div>
      <AttributeCard title="Summary" icon={Sparkles} testId="story-summary">
        <div style={{ display: 'grid', gap: 8 }}>
          <FieldRow label="What it needs" value={s.needed} />
          <FieldRow label="What is done" value={s.done} />
          <FieldRow label="What you must do" value={<YouMustDo s={s} />} />
        </div>
      </AttributeCard>
      <div className="flex flex-wrap gap-2">
        {s.buttons.includes('move') ? <Button size="sm"><ArrowRight />Move it to {s.moveTo}</Button> : null}
        {s.buttons.includes('retry') ? <Button size="sm"><RotateCcw />Let an agent try once more</Button> : null}
        {s.buttons.includes('retry-after-fix') ? <Button size="sm" variant="outline"><RotateCcw />Try again now the check is fixed</Button> : null}
        <Button size="sm" variant="outline"><X />Send it back</Button>
      </div>
      {s.error ? (
        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <ChevronRight className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
            <span>Show the error</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div style={{ padding: 8 }}>
              <Markdown>{'```\n' + s.error + '\n```'}</Markdown>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function FailingList({ rows }: { rows: { id: string; title: string; stage: string }[] }) {
  return (
    <AttributeCard title="Failing checks" icon={AlertCircle} testId="inbox-failing">
      <div className="flex flex-col gap-1">
        {rows.map((c) => (
          <FieldRow key={c.id} label={c.id} value={c.title} adornment={<MetaChip label="Stage" value={c.stage} />} testId={`failing-row-${c.id}`} />
        ))}
      </div>
    </AttributeCard>
  );
}

export default function MockC308StoryPagePage() {
  return (
    <main style={{ display: 'grid', gap: 24, padding: 24 }}>
      <header>
        <h1>A stuck story says why in plain words and which action will move it</h1>
        <p>As a founder, I can open a stuck story and read whether any work was tried, what already shipped under its id, and which action changes the outcome, so that I never approve a retry that will fail the same way.</p>
      </header>

      <section data-screen="stuck-story" style={{ display: 'grid', gap: 16 }}>
        <h2>Stuck story</h2>
        <Frame name="Needs you: no work tried, the code already shipped" note="US1, US2. No agent worked the step and 18 commits shipped, so the one button moves it to the step its work shows and stops there for your approval. No retry is offered.">
          <StuckStory s={st.shipped} />
        </Frame>
        <Frame name="Needs you: something changed since the last try" note="US2. The file changed after the last try, so letting an agent try once more is offered.">
          <StuckStory s={st.changed} />
        </Frame>
        <Frame name="Needs you: nothing changed, nothing shipped" note="US1, US2. A retry would fail the same way, so there is no retry button; the action is said in words.">
          <StuckStory s={st.unchanged} />
        </Frame>
        <Frame name="Error: the check itself broke" note="US3. It says the check broke, not the work, with the step and time; the raw error is folded under Show the error instead of becoming the reason.">
          <StuckStory s={st.broken} />
        </Frame>
        <Frame name="Loading" note="The story has not arrived; placeholders, not blank rows.">
          <PageSkeleton statCards={0} tableRows={4} showToolbar={false} />
        </Frame>
        <Frame name="Error: the story failed to load" note="Says what failed and offers to try again; no explanation is guessed.">
          <InlineError title={st.loadError.title} error={new Error(st.loadError.message)} onRetry={() => {}} />
        </Frame>
      </section>

      <section data-screen="inbox-failing" style={{ display: 'grid', gap: 16 }}>
        <h2>Inbox: failing checks</h2>
        <Frame name="Normal: only stories still failing" note={`US4, US5. ${ib.gone.id} failed and then passed at the same step, so it is no longer listed; the rows read the same explanation as each story page.`}>
          <FailingList rows={ib.rows} />
          <p className="text-xs text-muted-foreground">{ib.gone.id} {ib.gone.title}: {ib.gone.note}</p>
        </Frame>
        <Frame name="Empty: nothing failing" note="US4. Once every later try has passed, the list is empty.">
          <EmptyState compact icon={CheckCircle2} title="No check is failing" description="A story whose check fails shows up here until a later try passes." />
        </Frame>
        <Frame name="Loading" note="The inbox has not arrived.">
          <PageSkeleton statCards={0} tableRows={3} showToolbar={false} />
        </Frame>
        <Frame name="Error: the inbox failed to load" note="Says what failed and offers to try again.">
          <InlineError title={ib.loadError.title} error={new Error(ib.loadError.message)} onRetry={() => {}} />
        </Frame>
      </section>
    </main>
  );
}
