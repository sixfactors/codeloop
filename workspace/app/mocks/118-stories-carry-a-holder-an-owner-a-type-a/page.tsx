'use client';

// codeloop-mock-app: c-118
// Mock for c-118 Stories carry a holder, an owner, a type and links. Delete or keep it as the spec's `mock:` line says (`codeloop mock cleanup c-118`).
import { Link2, User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TooltipProvider } from '@/components/ui/tooltip';
import { StoryKey } from '@/components/shared/story-key';
import { StatePill } from '@/components/shared/state-pill';
import { Holder } from '@/components/shared/holder';
import { BandChip } from '@/components/shared/band-chip';
import { FieldRow } from '@/components/shared/field-row';
import { InlineError } from '@/components/shared/inline-error';
import { EmptyState } from '@/components/shared/empty-state';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { screens } from './mock-data';

const p = screens['story-properties'];
const l = screens['story-links'];

type Story = typeof p.heldByAgent | typeof p.heldByPerson | typeof p.unassigned;

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

function Person({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar><AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
      {name}
    </span>
  );
}

function Properties({ s }: { s: Story }) {
  const holderPerson = 'holderPerson' in s ? s.holderPerson : undefined;
  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <div className="flex flex-wrap items-center gap-2">
        <StoryKey id={s.id} />
        <strong>{s.title}</strong>
        <Badge variant="outline">{s.type}</Badge>
      </div>
      <FieldRow label="Status" value={<StatePill display={s.status} agent={s.holderAgent} />} />
      <FieldRow
        label="Holder"
        value={s.holderAgent ? s.holderAgent : holderPerson ? <Person name={holderPerson} /> : undefined}
        valueLeading={s.holderAgent ? <Holder agent={s.holderAgent} /> : undefined}
        emptyHint="Unassigned. Nobody has this story."
      />
      <FieldRow label="Owner" icon={User} value={<Person name={s.owner} />} />
      <FieldRow label="Reviewer" value={s.reviewer} emptyHint="No reviewer yet" />
      <FieldRow label="Priority" value={<BandChip band={s.priority as 'P1'} />} />
      <FieldRow label="Risk" value={s.risk} />
      <FieldRow label="Area" value={s.area} />
      <FieldRow label="Labels" value={s.labels.length ? s.labels.join(', ') : undefined} emptyHint="No labels" />
      <FieldRow label="Release" value={s.release} emptyHint="Not targeted" />
    </div>
  );
}

function LinkRow({ type, id, title, href }: { type: string; id: string; title: string; href: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Badge variant="outline"><Link2 />{type}</Badge>
      <StoryKey id={id} href={href} />
      <span>{title}</span>
    </div>
  );
}

export default function MockC118StoryRecordPage() {
  return (
    <TooltipProvider>
      <main style={{ display: 'grid', gap: 24, padding: 24 }}>
        <header>
          <h1>Stories carry a holder, an owner, a type and links</h1>
          <p>As a founder, I can read who holds a story, who owns it, what type it is and what it blocks, so that nobody has to ask in chat who has it.</p>
        </header>

        <section data-screen="story-properties" style={{ display: 'grid', gap: 16 }}>
          <h2>Story properties</h2>
          <Frame name="Normal: an agent holds it" note="US1. Holder is a square avatar with the session on hover; owner and reviewer are people.">
            <Properties s={p.heldByAgent} />
          </Frame>
          <Frame name="Needs you: a person holds it" note="US1, US3. Round avatar for the person; the pill says the review waits on them; type reads Bug.">
            <Properties s={p.heldByPerson} />
          </Frame>
          <Frame name="Empty: nobody holds it" note="US2. Holder reads Unassigned, the owner is still named, the type reads Chore.">
            <Properties s={p.unassigned} />
          </Frame>
          <Frame name="Loading" note="The record's data has not arrived; the panel shows placeholders, not blank rows.">
            <PageSkeleton statCards={0} tableRows={6} showToolbar={false} />
          </Frame>
          <Frame name="Error: write refused" note="US5. The refused field is named and the stored story is unchanged.">
            <InlineError title={p.error.title} error={new Error(p.error.message)} onRetry={() => {}} />
          </Frame>
        </section>

        <section data-screen="story-links" style={{ display: 'grid', gap: 16 }}>
          <h2>Story links</h2>
          <Frame name="Normal: c-142 blocks one story and is blocked by one" note="US4. Each story carries the chip for the link in both directions; a blocked story never enters Up next.">
            <div style={{ display: 'grid', gap: 8 }}>
              {[...l.blocks, ...l.blockedBy].map((x) => <LinkRow key={x.type + x.id} {...x} />)}
            </div>
          </Frame>
          <Frame name="Empty: no links" note="US4. The record offers to add the first link.">
            <EmptyState icon={Link2} title="No links yet" description="Blocks, blocked by, relates and duplicates appear here." action={{ label: 'Add link', onClick: () => {} }} compact />
          </Frame>
          <Frame name="Loading" note="Links arrive with the story; they show placeholders until it does.">
            <PageSkeleton statCards={0} tableRows={2} showToolbar={false} />
          </Frame>
          <Frame name="Error: link refused" note="US5. A link to a story that does not exist is refused and nothing is stored.">
            <InlineError title={l.error.title} error={new Error(l.error.message)} />
          </Frame>
        </section>
      </main>
    </TooltipProvider>
  );
}
