'use client';

// codeloop-mock-app: c-132
// Mock for c-132 The building blocks show every state on one page. Delete or keep it as the spec's `mock:` line says (`codeloop mock cleanup c-132`).
import { Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemContent, ItemDescription, ItemTitle, ItemMedia } from '@/components/ui/item';
import { TooltipProvider } from '@/components/ui/tooltip';
import { StoryKey } from '@/components/shared/story-key';
import { StatePill } from '@/components/shared/state-pill';
import { Holder } from '@/components/shared/holder';
import { BandChip } from '@/components/shared/band-chip';
import { ProgressBar } from '@/components/shared/progress-bar';
import { FieldRow } from '@/components/shared/field-row';
import { SearchAndFilter } from '@/components/shared/search-and-filter';
import { Markdown } from '@/components/shared/markdown';
import { EmptyState } from '@/components/shared/empty-state';
import { screens } from './mock-data';

const g = screens['blocks-gallery'];

function Block({ n, name, rule, children }: { n: number; name: string; rule: string; children: React.ReactNode }) {
  return (
    <Card data-block={name}>
      <CardHeader>
        <CardTitle>{n}. {name}</CardTitle>
        <p>{rule}</p>
      </CardHeader>
      <CardContent>
        <div style={{ display: 'grid', gap: 12 }}>{children}</div>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, minWidth: 0 }}>
      <span style={{ minWidth: 200 }}>{label}</span>
      {children}
    </div>
  );
}

export default function MockC132UiDesignSystemPage() {
  return (
    <TooltipProvider>
      <main style={{ display: 'grid', gap: 24, padding: 24 }}>
        <header>
          <h1>Building blocks</h1>
          <p>The twelve pieces every screen is assembled from, each in every state the design names.</p>
        </header>
        <section data-screen="blocks-gallery" style={{ display: 'grid', gap: 16 }}>
          <Block n={1} name="Key" rule="Monospace, copyable, links to the story everywhere.">
            {g.keys.map((k) => (
              <Row key={k.id} label={k.note}><StoryKey id={k.id} href={'href' in k ? k.href : undefined} /></Row>
            ))}
          </Block>
          <Block n={2} name="Status pill" rule="One state per story. A dot means an agent is working on it now.">
            {g.statuses.map((s) => (
              <Row key={s.label} label={s.label}><StatePill display={s.display} agent={'agent' in s ? s.agent : undefined} /></Row>
            ))}
          </Block>
          <Block n={3} name="Holder" rule="Square for an agent, round for a person. Hover shows the session.">
            {g.holders.map((h) => (
              <Row key={h.label} label={h.label}>
                {h.agent ? <Holder agent={h.agent} /> : <Badge variant="outline">Unassigned</Badge>}
              </Row>
            ))}
          </Block>
          <Block n={4} name="Priority" rule="Text, not an icon set.">
            {g.priorities.map((p) => (
              <Row key={p.band} label={p.band}><BandChip band={p.band} score={p.score} /></Row>
            ))}
          </Block>
          <Block n={5} name="Proof meter" rule="One segment per acceptance line: passed, failed, no evidence.">
            {g.proofs.map((p) => (
              <Row key={p.label} label={p.label}>
                <ProgressBar done={p.done} total={p.total} />
                {'failed' in p ? <Badge variant="destructive">{p.failed} failed</Badge> : null}
              </Row>
            ))}
          </Block>
          <Block n={6} name="Gate badge" rule="Which decision is waiting, and on whom.">
            {g.gates.map((x) => (
              <Row key={x.label} label={x.label}><StatePill display={x.display} /></Row>
            ))}
          </Block>
          <Block n={7} name="Question bubble" rule="Opens the questions with the recommended answers.">
            {g.questions.map((q) => (
              <Row key={q.label} label={q.label}><Badge variant="secondary">{q.text}</Badge></Row>
            ))}
          </Block>
          <Block n={8} name="Link chip" rule="Typed links between stories, and to wiki pages.">
            {g.links.map((l) => (
              <Row key={l.type} label={l.type}><Badge variant="outline">{l.text}</Badge></Row>
            ))}
          </Block>
          <Block n={9} name="Property row" rule="Label and value, editable in place. The right panel is a stack of these.">
            {g.properties.map((p) => (
              <FieldRow key={p.label} label={p.label} value={p.value} mono={'mono' in p ? p.mono : undefined} />
            ))}
          </Block>
          <Block n={10} name="Activity entry" rule="Who, what, when. Agents' entries collapse into one line per session.">
            {g.activity.map((a) => (
              <Item key={a.when} variant="outline" size="sm">
                <ItemMedia variant="icon"><Bot /></ItemMedia>
                <ItemContent>
                  <ItemTitle>{a.who}</ItemTitle>
                  <ItemDescription>{a.what} · {a.when}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </Block>
          <Block n={11} name="Query bar" rule="Chips for each part of the query. Saved as a view.">
            {g.queries.map((q) => (
              <Row key={q.label} label={q.label}>
                <SearchAndFilter
                  value={{ q: q.q, facets: {} }}
                  onChange={() => {}}
                  facets={[
                    { id: 'status', title: 'Status', options: [{ label: 'Build', value: 'build' }, { label: 'Spec', value: 'spec' }] },
                    { id: 'holder', title: 'Holder', options: [{ label: 'Agent', value: 'agent' }, { label: 'Person', value: 'person' }] },
                  ]}
                  searchPlaceholder="status:build holder:agent P1"
                />
              </Row>
            ))}
          </Block>
          <Block n={12} name="Doc block" rule="Rendered markdown with a table of contents, backlinks and changed-by stories.">
            <Markdown>{g.doc}</Markdown>
            <EmptyState icon={Bot} title="No backlinks yet" description="Pages that link here appear on this list." compact />
          </Block>
        </section>
      </main>
    </TooltipProvider>
  );
}
