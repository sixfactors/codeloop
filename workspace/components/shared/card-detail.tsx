'use client';

// One card, two presentations (design contract §6): the full page (push from a link) wraps the body
// in PageLayout; the board opens the same body inside DetailSheet. Body = RecordLayout: an
// AttributeCard rail of FieldRows (facts) and a gate card, then RecordStatRow + tabs in the main.

import { useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays, Check, ClipboardList, ExternalLink, FileText, Flag, Gauge, Hash, Layers, Lock, Ruler, Target, User, Waypoints, X, BookOpen, FolderOpen,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AttributeCard, RecordLayout, RecordStatRow } from '@/components/shared/record-layout';
import { FieldRow, FieldSectionLabel } from '@/components/shared/field-row';
import { MetaChip } from '@/components/shared/meta-chip';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { BandChip } from '@/components/shared/band-chip';
import { ToneBadge, cardTone } from '@/components/shared/board-card';
import { Questions } from '@/components/shared/questions';
import { Markdown } from '@/components/shared/markdown';
import { StageCard } from '@/components/shared/stage-card';
import { CardOutputTab } from '@/components/shared/card-output-tab';
import { CardActionMenu } from '@/components/shared/card-action-menu';
import { useCard, useCardFull, useDecide, useQuestions, isMissing } from '@/hooks/use-api';
import { mockUrl } from '@/lib/api';
import { isGateWaiting } from '@/lib/cards';
import { evidenceId, routes } from '@/lib/routes';
import type { Card as CardT, EvidenceFile } from '@/lib/types';

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : undefined);

export function storyLine(card: CardT): string | undefined {
  const s = card.story;
  if (s?.as || s?.can || s?.so) return `As a ${s.as ?? '—'}, I can ${s.can ?? '—'}, so that ${s.so ?? '—'}.`;
  return card.description;
}

/** The gate card: amber because a person is needed. Approve / Reject with an optional note. */
function GateCard({ card }: { card: CardT }) {
  const decide = useDecide();
  const [note, setNote] = useState('');
  if (!isGateWaiting(card) && !(card.gate || card.awaiting)) return null;
  const act = (action: 'approve' | 'reject') =>
    decide.mutate(
      { id: card.id, action, note: note || undefined },
      { onSuccess: () => { toast.success(`${action === 'approve' ? 'Approved' : 'Rejected'} ${card.id}`); setNote(''); }, onError: (e) => toast.error(`${action === 'approve' ? 'Approve' : 'Reject'} failed: ${(e as Error).message}`) }
    );
  return (
    <AttributeCard title="Gate" icon={Lock} className="border-warning/50" testId="gate-card">
      <FieldRow label="Waiting on" value={card.awaiting ?? 'owner'} icon={User} />
      <FieldRow label="Gate" value={card.gate} icon={Flag} />
      <div className="mt-3 flex flex-col gap-2">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" rows={2} aria-label="Gate note" />
        <div className="flex gap-2">
          <Button size="sm" disabled={decide.isPending} onClick={() => act('approve')}><Check />Approve</Button>
          <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => act('reject')}><X />Reject</Button>
        </div>
      </div>
    </AttributeCard>
  );
}

export function CardHeaderTags({ card }: { card: CardT }) {
  return (
    <>
      <Badge variant="outline" className="rounded-full">{card.lane}</Badge>
      <Badge variant="secondary" className="rounded-full">{card.stage}</Badge>
      <BandChip band={card.band} score={card.score} />
      <ToneBadge card={card} />
    </>
  );
}

export function CardActions({ card, inSheet }: { card: CardT; inSheet?: boolean }) {
  return (
    <>
      {card.mock ? <Button size="sm" variant="outline" nativeButton={false} render={<a href={mockUrl(card.mock)} target="_blank" rel="noreferrer" />}><ExternalLink />Mock</Button> : null}
      <Button size="sm" variant="outline" nativeButton={false} render={<Link href={routes.wiki(`.codeloop/wiki/cards/${card.id}.md`)} />}><BookOpen />Wiki</Button>
      <Button size="sm" variant="outline" nativeButton={false} render={<Link href={routes.evidence(evidenceId(card.id))} />}><FolderOpen />Evidence</Button>
      {inSheet ? <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={routes.card(card.id)} />}>Open page</Button> : null}
      <CardActionMenu card={card} />
    </>
  );
}

export function CardDetailSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]" aria-busy="true">
      <div className="space-y-2 rounded-xl border bg-card p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function CardDetailBody({ card, stacked }: { card: CardT; stacked?: boolean }) {
  const full = useCardFull(card.id);
  const questions = useQuestions(card.id);
  const evidence: (EvidenceFile | string)[] = full.data?.evidence ?? card.evidence ?? [];
  const tasks = full.data?.tasks ?? [];
  const fullMissing = full.error && isMissing(full.error);
  const openQ = (questions.data ?? []).filter((q) => !q.answer).length;
  const tone = cardTone(card);

  const rail = (
    <>
      <StageCard card={card} />
      <GateCard card={card} />
      <AttributeCard title="Details" icon={ClipboardList} testId="card-details">
        <FieldRow icon={Hash} label="Id" value={card.id} mono />
        <FieldRow icon={Waypoints} label="Lane" value={card.lane} />
        <FieldRow icon={Layers} label="Stage" value={card.stage} adornment={tone !== 'none' ? <ToneBadge card={card} /> : undefined} />
        <FieldRow icon={Target} label="Initiative" value={card.initiative} />
        <FieldRow icon={Flag} label="Epic" value={card.epic} href={card.epic ? routes.card(card.epic) : undefined} />
        <FieldRow icon={FileText} label="Feature" value={card.feature} />
        <FieldRow icon={Gauge} label="Metric" value={card.metric} />
        <FieldSectionLabel>Sizing</FieldSectionLabel>
        <FieldRow icon={Ruler} label="Size" value={card.size} />
        <FieldRow icon={Ruler} label="Points" value={card.points !== undefined ? String(card.points) : undefined} mono />
        <FieldRow icon={User} label="Persona" value={card.persona} />
        <FieldSectionLabel>Dates</FieldSectionLabel>
        <FieldRow icon={CalendarDays} label="Created" value={fmtDate(card.createdAt)} />
        <FieldRow icon={CalendarDays} label="Updated" value={fmtDate(card.updatedAt)} />
      </AttributeCard>
    </>
  );

  return (
    <RecordLayout rail={rail} className={stacked ? 'lg:grid-cols-1' : undefined}>
      <div className="flex flex-col gap-4">
        <RecordStatRow
          stats={[
            { label: 'Open questions', value: !questions.data && !questions.error ? <Skeleton className="h-7 w-8" /> : openQ },
            { label: 'Events', value: card.events?.length ?? 0 },
            { label: 'Tasks done', value: `${tasks.filter((t) => t.done).length}/${tasks.length}` },
            { label: 'Evidence files', value: evidence.length },
          ]}
        />
        <Tabs defaultValue="questions">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="questions">Questions</TabsTrigger>
            <TabsTrigger value="output" data-testid="tab-output">Output</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="spec">Spec</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
          </TabsList>
          <TabsContent value="questions" className="pt-2"><Questions cardId={card.id} /></TabsContent>
          <TabsContent value="output" className="pt-2"><CardOutputTab card={card} /></TabsContent>
          <TabsContent value="history" className="pt-2">
            {card.events?.length ? (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Stage</TableHead><TableHead>Note</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...card.events].reverse().map((e, i) => (
                      <TableRow key={`${e.at}-${i}`}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">{fmt(e.at)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={e.human ? 'rounded-full' : 'rounded-full border-transparent bg-ai/15 text-ai'}>{e.actor ?? (e.human ? 'human' : 'agent')}</Badge>
                        </TableCell>
                        <TableCell>{e.action}</TableCell>
                        <TableCell>{e.stage}</TableCell>
                        <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={e.note}>{e.note}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : <EmptyState compact icon={ClipboardList} title="No events yet" description="Every advance, park and answer lands here." />}
          </TabsContent>
          <TabsContent value="spec" className="pt-2">
            {full.data?.spec ? <Markdown>{full.data.spec}</Markdown>
              : !full.data && !full.error ? <Skeleton className="h-16 w-full" />
              : full.error && !fullMissing ? <InlineError title="Spec failed to load" error={full.error} onRetry={() => full.refetch()} />
              : <EmptyState compact icon={FileText} title="No spec yet" description={fullMissing ? `Spec text arrives with GET /api/cards/:id/full${card.spec ? ` (folder: ${card.spec})` : ''}.` : `The spec step writes it${card.spec ? ` to ${card.spec}` : ''}.`} />}
          </TabsContent>
          <TabsContent value="tasks" className="pt-2">
            {tasks.length ? (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader><TableRow><TableHead className="w-10">Done</TableHead><TableHead>Task</TableHead><TableHead>Layer</TableHead><TableHead>Accept</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {tasks.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.done ? <Check className="size-4 text-success" aria-label="done" /> : null}</TableCell>
                        <TableCell>{t.text}</TableCell>
                        <TableCell>{t.layer ? <Badge variant="outline" className="rounded-full">{t.layer}</Badge> : null}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.accept}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : <EmptyState compact icon={ClipboardList} title="No tasks" description={fullMissing ? 'Tasks arrive with GET /api/cards/:id/full.' : 'The spec step lists tasks here.'} />}
          </TabsContent>
          <TabsContent value="evidence" className="pt-2">
            {evidence.length ? (
              <div className="rounded-xl border bg-card px-4">
                {evidence.map((e, i) => {
                  const f = typeof e === 'string' ? { name: e } : e;
                  return <FieldRow key={`${f.name}-${i}`} icon={FolderOpen} label={f.kind ?? 'file'} value={f.name} mono adornment={f.path ? <span className="text-xs text-muted-foreground">{f.path}</span> : undefined} />;
                })}
              </div>
            ) : <EmptyState compact icon={FolderOpen} title="No evidence recorded" description="Verify writes its proof here." action={{ label: 'Open evidence folder', href: routes.evidence(evidenceId(card.id)) }} />}
          </TabsContent>
        </Tabs>
      </div>
    </RecordLayout>
  );
}

/** Sheet body: loading → ready | missing | error, same body as the page. */
export function CardDetail({ id, stacked }: { id: string; stacked?: boolean }) {
  const { data: card, isLoading, error, refetch } = useCard(id);
  if (isLoading) return <CardDetailSkeleton />;
  if (error) return <InlineError title="Card failed to load" error={error} onRetry={() => refetch()} />;
  if (!card) return <EmptyState icon={Hash} title={`No card ${id}`} description="It may have been dropped or renamed." action={{ label: 'Back to board', href: routes.board }} />;
  return <CardDetailBody card={card} stacked={stacked} />;
}

export function CardSizingChips({ card }: { card: CardT }) {
  const sizing = card.points !== undefined ? `${card.points} pt` : card.size;
  return (
    <>
      {sizing ? <MetaChip label="Size" value={sizing} /> : null}
      {card.persona ? <MetaChip label="For" value={card.persona} /> : null}
      {card.initiative ? <MetaChip label="Initiative" value={card.initiative} /> : null}
    </>
  );
}
