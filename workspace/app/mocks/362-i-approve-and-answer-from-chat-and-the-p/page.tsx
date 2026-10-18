'use client';

// codeloop-mock-app: c-362
// Mock for c-362 I approve and answer from chat, and the page loads fast and lists every artifact. Delete or keep it as the spec's `mock:` line says (`codeloop mock cleanup c-362`).
import { Check, CheckCheck, ExternalLink, FileWarning, Image as ImageIcon, Images, Kanban, MessageCircleQuestion, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/shared/empty-state';
import { EntityCard } from '@/components/shared/entity-card';
import { FoldSection } from '@/components/shared/fold-section';
import { InlineError } from '@/components/shared/inline-error';
import { MetaChip } from '@/components/shared/meta-chip';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { SavedViewTabs } from '@/components/shared/saved-view-tabs';
import { StoryKey } from '@/components/shared/story-key';
import { noRecommendation, open, pages, story, waived, type Open, type Page } from './mock-data';

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

function Header() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StoryKey id={story.id} />
      <strong>{story.title}</strong>
      <Badge variant="outline">waiting on you at the {story.gate} gate</Badge>
    </div>
  );
}

function OpenRows({ list }: { list: Open[] }) {
  return (
    <ItemGroup className="gap-2">
      {list.map((q) => (
        <Item key={q.n} variant="outline" size="sm">
          <ItemContent>
            <ItemTitle>Q{q.n} {q.kind === 'review' ? 'Finding' : 'Question'}: {q.text}</ItemTitle>
            <ItemDescription>{q.recommended ? `${q.kind === 'review' ? 'Waive it; the fix it suggests' : 'Recommended'}: ${q.recommended}` : 'No recommendation: this one needs your answer.'}</ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}

function GateButtons({ conditions }: { conditions: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {conditions ? <Button size="sm"><CheckCheck />Approve with conditions ({conditions})</Button> : <Button size="sm"><Check />Approve</Button>}
      <Button size="sm" variant="outline"><X />Send it back</Button>
    </div>
  );
}

/** The confirm step: what will be accepted and what waived, before anything is recorded. */
function Confirm() {
  const answers = open.filter((q) => q.kind === 'interview');
  const findings = open.filter((q) => q.kind === 'review');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Approve {story.id} with conditions</CardTitle>
        <CardDescription>{answers.length} recommended answers are recorded as yours and {findings.length} finding is waived, then the story moves on. The same step runs from `codeloop approve {story.id} --accept-recommended` or when the orchestrator relays your yes from chat.</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ display: 'grid', gap: 12 }}>
          <strong>Answers to accept</strong>
          <OpenRows list={answers} />
          <strong>Findings to waive</strong>
          <OpenRows list={findings} />
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button size="sm"><CheckCheck />Accept, waive and approve</Button>
        <Button size="sm" variant="outline">Cancel</Button>
      </CardFooter>
    </Card>
  );
}

function WaivedList({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <FoldSection title="Waived findings" heading={{ count: `${waived.length} waived`, failing: false }} icon={FileWarning} defaultOpen={defaultOpen}>
      <ItemGroup className="gap-1">
        {waived.map((w) => (
          <Item key={w.n} variant="outline" size="sm">
            <ItemContent>
              <ItemTitle>Q{w.n}: {w.text}</ItemTitle>
              <ItemDescription>waived by {w.by} · {w.at} · approved with conditions</ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </FoldSection>
  );
}

function Artifacts({ list, topic }: { list: Page[]; topic: string }) {
  const topics = [...new Set(list.map((p) => p.topic))];
  return (
    <div className="flex flex-col gap-4">
      <SavedViewTabs
        presets={topics.map((t) => ({ id: t, label: `${t} · ${list.filter((p) => p.topic === t).length}` }))}
        savedViews={[]}
        activePresetId={topic}
        activeSavedViewId={null}
        onSelectPreset={() => {}}
        onSelectSavedView={() => {}}
        onSaveView={() => {}}
        onDeleteView={() => {}}
        canSave={false}
      />
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]">
        {list.filter((p) => p.topic === topic).map((p) => (
          <EntityCard
            key={p.id}
            name={p.title}
            description={`${p.id} · ${p.updated}`}
            icon={ImageIcon}
            menuItems={[
              { label: 'Open in new tab', icon: ExternalLink, onClick: () => {} },
              { label: `Story ${p.cardId}`, icon: Kanban, onClick: () => {} },
            ]}
            footer={
              <div className="mt-3 flex flex-wrap gap-1">
                <MetaChip label="Kind" value={p.kind} />
                <MetaChip label="Story" value={p.cardId} />
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

export default function MockC362Page() {
  return (
    <TooltipProvider>
      <main style={{ display: 'grid', gap: 24, padding: 24 }}>
        <header>
          <h1>I approve and answer from chat, and the page loads fast and lists every artifact</h1>
          <p>As a founder, I can answer the orchestrator&apos;s questions in chat, approve with conditions in one step, and open any story or artifact without waiting, so that clearing my work takes seconds.</p>
        </header>
        <section data-screen="story-page" style={{ display: 'grid', gap: 16 }}>
          <h2>Story page</h2>
          <Frame name="Needs you: open questions and a finding, each with a recommendation" note="US1. The gate shows one button that accepts every recommendation and waives the finding; the open items are listed under it so nothing is accepted unseen.">
            <div style={{ display: 'grid', gap: 12 }}>
              <Header />
              <GateButtons conditions={open.length} />
              <OpenRows list={open} />
            </div>
          </Frame>
          <Frame name="Needs you: the confirm step" note="US1. Approve with conditions lists the answers it records as yours and the findings it waives; one click does all of it and moves the story.">
            <Confirm />
          </Frame>
          <Frame name="Error: one question has no recommendation" note="US2. Nothing was recorded. The page names the question that needs your answer; the other recommendations are still open.">
            <div style={{ display: 'grid', gap: 12 }}>
              <Header />
              <Alert variant="destructive">
                <MessageCircleQuestion />
                <AlertTitle>Nothing was approved</AlertTitle>
                <AlertDescription>Q{noRecommendation.n} has no recommendation: {noRecommendation.text} Answer it, then approve with conditions again.</AlertDescription>
              </Alert>
              <OpenRows list={[...open, noRecommendation]} />
            </div>
          </Frame>
          <Frame name="Normal: approved with conditions, the waived finding kept on the story" note="US3. The story moved on; the waived finding is listed with who waived it and when, so the accepted defect stays visible.">
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="flex flex-wrap items-center gap-2">
                <StoryKey id={story.id} />
                <strong>{story.title}</strong>
                <Badge variant="outline">staging</Badge>
              </div>
              <WaivedList defaultOpen />
            </div>
          </Frame>
          <Frame name="Empty: nothing open" note="With no open question or finding, the gate shows the plain Approve button and no list.">
            <div style={{ display: 'grid', gap: 12 }}>
              <Header />
              <GateButtons conditions={0} />
            </div>
          </Frame>
          <Frame name="Loading, cold or warm" note="US4. The frame and placeholders paint at once, before the server has the story; the story text replaces them within 1 s even after the index closed while the board sat idle.">
            <PageSkeleton statCards={0} tableRows={5} showToolbar={false} />
          </Frame>
          <Frame name="Error: the story failed to load" note="The page says what failed and offers to try again.">
            <InlineError title="The story failed to load" error={new Error('GET /api/cards/c-412/full: the board server did not answer')} onRetry={() => {}} />
          </Frame>
        </section>
        <section data-screen="artifacts" style={{ display: 'grid', gap: 16 }}>
          <h2>Artifacts</h2>
          <Frame name="Normal: nested pages listed, designs and plans first" note="US5. Every page under docs/artifacts at any depth and every story's mock, each with its kind and story. The cloud tab opens first because it holds the newest designs and plans; mocks sort after them.">
            <Artifacts list={pages} topic="cloud" />
          </Frame>
          <Frame name="Normal: a topic with a design and mocks" note="US5. Within a topic the system design comes before the mocks, newest first in each.">
            <Artifacts list={pages} topic="board" />
          </Frame>
          <Frame name="Loading" note="Placeholders while the list loads.">
            <PageSkeleton statCards={0} tableRows={3} />
          </Frame>
          <Frame name="Empty: no artifacts yet" note="Nothing under docs/artifacts and no mock on any story.">
            <EmptyState icon={Images} title="No artifacts yet" description="A system design, plan, workflow or mock appears here once a story produces one." />
          </Frame>
          <Frame name="Error: the list failed to load" note="The page says what failed and offers to try again.">
            <InlineError title="Artifacts failed to load" error={new Error('GET /api/artifacts: the board server did not answer')} onRetry={() => {}} />
          </Frame>
        </section>
      </main>
    </TooltipProvider>
  );
}
