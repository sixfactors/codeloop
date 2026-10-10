'use client';

// What needs you. One filter bar (initiative, epic, feature, priority, needs me), a stat row, then
// the gates waiting on a person grouped by RICE band, P1 first, highest score first inside a band
// and the oldest wait first on a tie. Ten rows show by default; "Show all" opens the rest.
// Below it: questions, shipped this week, numbers per lane. Everything comes from one
// GET /api/inbox: three lists capped at 50 rows and the per-lane numbers, so a 5k-card project
// draws the same handful of rows as a small one.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { CheckCircle2, Inbox, Lock, MessageSquare, Waypoints } from 'lucide-react';
import { PageLayout } from '@/components/shared/page-layout';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { AttributeCard, RecordStatRow } from '@/components/shared/record-layout';
import { FieldRow } from '@/components/shared/field-row';
import { MetaChip } from '@/components/shared/meta-chip';
import { UsageBar } from '@/components/shared/usage-bar';
import { Questions } from '@/components/shared/questions';
import { ToneBadge } from '@/components/shared/board-card';
import { BAND_LABEL, BandChip } from '@/components/shared/band-chip';
import { EMPTY_SEARCH, SearchAndFilter, type FacetDef, type SearchAndFilterValue } from '@/components/shared/search-and-filter';
import { Button } from '@/components/ui/button';
import { inboxSince, useCardCount, useCardFacets, useCards, useInbox, useLanes } from '@/hooks/use-api';
import { routes } from '@/lib/routes';
import { BANDS, type Band, type Card as CardT, type InboxCard, type InboxQuery } from '@/lib/types';

const CardDrawer = dynamic(() => import('@/components/shared/card-drawer').then((m) => m.CardDrawer), { ssr: false });

const QUESTION_CARDS = 12;
const TOP = 10;
const NO_CARDS: CardT[] = [];
const INBOX_FACETS = ['initiative', 'epic', 'feature', 'band'] as const;
const TITLES: Record<(typeof INBOX_FACETS)[number], string> = { initiative: 'Initiative', epic: 'Epic', feature: 'Feature', band: 'Priority' };

/** The filter bar as the inbox query: each facet comma-joined as the route takes it, "needs me" as the flag, score order. */
function toInboxQuery(f: SearchAndFilterValue): Omit<InboxQuery, 'shippedSince'> {
  const q: Omit<InboxQuery, 'shippedSince'> = { sort: 'score' };
  for (const k of INBOX_FACETS) if (f.facets[k]?.length) q[k] = f.facets[k].join(',');
  if (f.facets.needsMe?.includes('yes')) q.needsMe = true;
  return q;
}

const waitedSince = (c: InboxCard) => c.since ?? c.first ?? c.updatedAt ?? '';

/** Score descending, then the longest wait first; the server's order already, re-applied to the rows on the page. */
function rank(cards: InboxCard[]): InboxCard[] {
  return cards.map((c, i) => [c, i] as const)
    .sort(([a, ai], [b, bi]) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || waitedSince(a).localeCompare(waitedSince(b)) || ai - bi)
    .map(([c]) => c);
}

type Group = { band: Band | 'none'; label: string; cards: InboxCard[] };
function groupByBand(cards: InboxCard[]): Group[] {
  const groups: Group[] = [...BANDS.map((b) => ({ band: b, label: BAND_LABEL[b], cards: [] as InboxCard[] })), { band: 'none', label: 'Unranked', cards: [] }];
  for (const c of cards) (groups.find((g) => g.band === (c.band ?? 'none')) ?? groups[groups.length - 1]).cards.push(c);
  return groups.filter((g) => g.cards.length);
}

export function InboxView() {
  const since = inboxSince();
  const [filters, setFilters] = useState<SearchAndFilterValue>(EMPTY_SEARCH);
  const [pending, setPending] = useState(false);
  const extra = useMemo(() => toInboxQuery(filters), [filters]);
  const { data, isLoading, error, refetch } = useInbox({ shippedSince: since, ...extra });
  const backlog = useCardCount({ stage: ['proposed'] });
  const lanes = useLanes();
  const facets = useCardFacets(NO_CARDS);
  const { payload } = useCards();
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const description = payload?.inbox?.summary ?? data?.summary ?? 'What needs you, highest priority first.';

  const facetDefs = useMemo<FacetDef[]>(() => {
    const defs: FacetDef[] = INBOX_FACETS.map((k) => ({
      id: k,
      title: TITLES[k],
      searchable: k !== 'band',
      options: k === 'band'
        ? BANDS.map((b) => ({ label: BAND_LABEL[b], value: b, count: facets.band?.find((o) => o.value === b)?.count }))
        : (facets[k] ?? []).map((o) => ({ label: o.value, value: o.value, count: o.count })),
    }));
    defs.push({ id: 'needsMe', title: 'Needs me', options: [{ label: 'Waiting on me', value: 'yes' }] });
    return defs;
  }, [facets]);

  const gates = data?.needsYou;
  const ranked = useMemo(() => rank(gates?.cards ?? []), [gates?.cards]);
  const shown = all ? ranked : ranked.slice(0, TOP);
  const groups = useMemo(() => groupByBand(shown), [shown]);
  const hidden = (gates?.total ?? 0) - shown.length;

  const bar = (
    <SearchAndFilter value={filters} onChange={setFilters} onPending={setPending} facets={facetDefs} searchPlaceholder="Search title, id…" trailing={<span className="text-xs text-muted-foreground tabular-nums" data-testid="inbox-total">{gates ? `${gates.total} waiting` : ''}</span>} />
  );

  if (isLoading || !data) {
    return (
      <PageLayout icon={Inbox} title="Inbox" description={description}>
        <div className="flex flex-col gap-6">
          {bar}
          {error ? <InlineError title="Inbox failed to load" error={error} onRetry={() => refetch()} /> : <PageSkeleton statCards={4} showToolbar={false} tableRows={4} />}
        </div>
      </PageLayout>
    );
  }

  const asking = data.questions;
  const shipped = data.shipped;
  const openQuestions = asking.cards.reduce((n, c) => n + (c.openQuestions ?? 0), 0);
  const more = (list: { cards: unknown[]; total: number }) => Math.max(0, list.total - list.cards.length);
  // The search box narrows the rows on the page by title or id; the facets go to the server.
  const q = filters.q.trim().toLowerCase();
  const matches = (c: InboxCard) => !q || c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);

  return (
    <PageLayout icon={Inbox} title="Inbox" description={description}>
      <div className={pending ? 'flex flex-col gap-6 opacity-60 transition-opacity' : 'flex flex-col gap-6 transition-opacity'} aria-busy={pending}>
        {bar}
        <RecordStatRow
          testId="inbox-stats"
          stats={[
            { label: 'Gates waiting', value: data.needsYou.total },
            // The sum is exact when every asking card is in the list; past the cap it is a floor and the card count is shown instead.
            { label: 'Open questions', value: asking.total > asking.cards.length ? asking.total : openQuestions },
            { label: 'Shipped this week', value: shipped.total },
            { label: 'Backlog', value: backlog.data ?? 0 },
          ]}
        />

        <AttributeCard
          title="Gates waiting"
          icon={Lock}
          testId="inbox-gates"
          action={ranked.length > TOP || all ? (
            <Button size="xs" variant="outline" onClick={() => setAll((v) => !v)} data-testid="inbox-show-all">{all ? `Top ${TOP}` : `Show all ${data.needsYou.total}`}</Button>
          ) : null}
        >
          {groups.length ? (
            <div className="flex flex-col gap-4">
              {groups.map((g) => {
                const rows = g.cards.filter(matches);
                if (!rows.length) return null;
                return (
                  <section key={g.band} data-testid={`inbox-band-${g.band}`}>
                    <div className="flex items-center gap-2 border-b-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                      {g.band === 'none' ? <span>Unranked</span> : <><BandChip band={g.band} /><span className="normal-case tracking-normal">{BAND_LABEL[g.band].split(' · ')[1]}</span></>}
                      <b className="font-semibold text-foreground tabular-nums">{g.cards.length}</b>
                    </div>
                    {rows.map((c) => (
                      <FieldRow
                        key={c.id}
                        label={c.id}
                        value={<button type="button" className="truncate text-left hover:underline" onClick={() => setOpen(c.id)}>{c.title}</button>}
                        adornment={
                          <span className="flex items-center gap-1.5">
                            {c.feature ? <MetaChip label="Feature" value={c.feature} className="hidden max-w-[12rem] lg:inline-flex [&>span:last-child]:truncate" /> : null}
                            {typeof c.score === 'number' ? <span className="text-xs text-muted-foreground tabular-nums">{c.score}</span> : null}
                            <ToneBadge card={c} />
                            <Button size="xs" onClick={() => setOpen(c.id)}>Review</Button>
                          </span>
                        }
                        testId={`gate-row-${c.id}`}
                      />
                    ))}
                  </section>
                );
              })}
              {hidden > 0 && !all ? <p className="text-xs text-muted-foreground">{hidden} more wait. <button type="button" className="underline" onClick={() => setAll(true)}>Show all {data.needsYou.total}</button></p> : null}
              {all && more(data.needsYou) ? <p className="text-xs text-muted-foreground">{more(data.needsYou)} more wait on the board.</p> : null}
            </div>
          ) : <EmptyState compact icon={CheckCircle2} title="No gate is waiting on you" description={Object.keys(filters.facets).length ? 'Nothing matches these filters.' : 'A story parked at a gate shows up here.'} />}
        </AttributeCard>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <AttributeCard title="Questions to answer" icon={MessageSquare} testId="inbox-questions">
            {asking.cards.length ? (
              <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
                {asking.cards.slice(0, QUESTION_CARDS).map((c) => (
                  <div key={c.id} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Link className="font-mono text-xs text-muted-foreground" href={routes.card(c.id)}>{c.id}</Link>
                      <span className="truncate">{c.title}</span>
                      <BandChip band={c.band} score={c.score} />
                    </div>
                    <Questions cardId={c.id} compact />
                  </div>
                ))}
                {asking.total > QUESTION_CARDS ? <p className="text-xs text-muted-foreground">{asking.total - QUESTION_CARDS} more stories have questions; open them from the board.</p> : null}
              </div>
            ) : <EmptyState compact icon={MessageSquare} title="Nothing to answer" description="Questions the agent asks land here with a recommended answer." />}
          </AttributeCard>

          <AttributeCard title="Shipped this week" icon={CheckCircle2} testId="inbox-shipped">
            {shipped.cards.length ? (
              <>
                {shipped.cards.map((c) => <FieldRow key={c.id} label={c.id} value={c.title} href={routes.card(c.id)} adornment={<MetaChip label="Lane" value={c.lane} tone="good" />} />)}
                {more(shipped) ? <p className="pt-2 text-xs text-muted-foreground">{more(shipped)} more shipped this week.</p> : null}
              </>
            ) : <EmptyState compact icon={CheckCircle2} title="Nothing shipped yet" description="Stories that reach a done stage in the last 7 days show here." />}
          </AttributeCard>

          <AttributeCard title="Numbers per lane" icon={Waypoints} testId="inbox-lanes" className="lg:col-span-2">
            {data.perLane.length ? data.perLane.map((l) => {
              const lane = lanes.data.find((x) => x.id === l.lane);
              const inFlight = l.active + l.parked;
              return (
                <FieldRow
                  key={l.lane}
                  label={l.lane}
                  value={
                    <span className="flex flex-wrap items-center gap-1">
                      <MetaChip label="Active" value={String(l.active)} />
                      <MetaChip label="Gated" value={String(l.parked)} tone={l.parked ? 'warn' : 'default'} />
                      <MetaChip label="Done" value={String(l.done)} tone={l.done ? 'good' : 'default'} />
                      {l.metric ? <MetaChip label="Metric" value={l.target ? `${l.metric} → ${l.target}` : l.metric} /> : null}
                      {typeof l.first_pass_rate === 'number' ? <MetaChip label="First pass" value={`${Math.round(l.first_pass_rate * 100)}%`} /> : null}
                    </span>
                  }
                  adornment={lane?.wip ? <UsageBar label="WIP" current={inFlight} limit={lane.wip} size="sm" showLabel={false} className="w-16" /> : undefined}
                />
              );
            }) : <EmptyState compact icon={Waypoints} title="No lanes yet" description="Lane numbers appear once stories exist." />}
          </AttributeCard>
        </div>
      </div>
      {open ? <CardDrawer id={open} onClose={() => setOpen(null)} ids={ranked.map((c) => c.id)} onNavigate={setOpen} /> : null}
    </PageLayout>
  );
}
