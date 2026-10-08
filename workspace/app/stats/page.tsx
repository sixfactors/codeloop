'use client';

// /api/stats → RecordStatRow of plain-labelled numbers, an AttributeCard of the rates, and the
// by-gate table with a readable header. Unknown keys still show, humanised, so a new field is
// never hidden.

import { BarChart3, Gauge } from 'lucide-react';
import { PageLayout } from '@/components/shared/page-layout';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { AttributeCard, RecordStatRow, type RecordStat } from '@/components/shared/record-layout';
import { FieldRow } from '@/components/shared/field-row';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { isMissing, useStats } from '@/hooks/use-api';

const num = (v: unknown, digits = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: digits }) : undefined);
const hours = (v: unknown) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  if (v >= 48) return `${num(v / 24)} days`;
  if (v >= 1) return `${num(v)} h`;
  return `${num(v * 60, 0)} min`;
};
const pct = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? `${num(v * 100, 0)}%` : undefined);
const humanise = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// Known keys get a label and a unit; the stat row is the four headline numbers.
const HEADLINE: { key: string; label: string; fmt: (v: unknown) => string | undefined }[] = [
  { key: 'cards', label: 'Cards', fmt: (v) => num(v, 0) },
  { key: 'done', label: 'Done', fmt: (v) => num(v, 0) },
  { key: 'human_turns_per_card', label: 'Human turns per card', fmt: (v) => num(v) },
  { key: 'unattended_span_hours', label: 'Unattended span', fmt: hours },
];
const RATES: { key: string; label: string; fmt: (v: unknown) => string | undefined }[] = [
  { key: 'cycle_time_hours', label: 'Cycle time', fmt: hours },
  { key: 'rework', label: 'Rework', fmt: (v) => num(v, 0) },
  { key: 'stuck_rate', label: 'Stuck', fmt: pct },
  { key: 'first_pass_rate', label: 'First-pass verify', fmt: pct },
  { key: 'cost_per_card', label: 'Cost per card', fmt: (v) => (typeof v === 'number' ? `$${num(v, 2)}` : undefined) },
];

export default function StatsPage() {
  const stats = useStats();
  if (stats.isLoading) return <PageLayout icon={BarChart3} title="Stats" description="How the loop is running."><PageSkeleton statCards={4} showToolbar={false} tableRows={3} /></PageLayout>;
  if (stats.error) {
    return (
      <PageLayout icon={BarChart3} title="Stats" description="How the loop is running.">
        {isMissing(stats.error)
          ? <EmptyState icon={BarChart3} title="Stats are not served yet" description="GET /api/stats is being added. Cost per card, human turns, first-pass verify, cycle time and unattended span land here." />
          : <InlineError title="Stats failed to load" error={stats.error} onRetry={() => stats.refetch()} />}
      </PageLayout>
    );
  }

  const data = (stats.data ?? {}) as Record<string, unknown>;
  const known = new Set([...HEADLINE, ...RATES].map((h) => h.key));
  const headline: RecordStat[] = HEADLINE.map((h) => ({ label: h.label, value: h.fmt(data[h.key]) ?? '—', testId: `stat-${h.key}` }));
  const extras = Object.entries(data).filter(([k, v]) => !known.has(k) && (typeof v !== 'object' || v === null));
  const byGate = data.first_pass_rate_by_gate as Record<string, number> | undefined;
  const tables = Object.entries(data).filter(([k, v]) => k !== 'first_pass_rate_by_gate' && typeof v === 'object' && v !== null);

  return (
    <PageLayout icon={BarChart3} title="Stats" description="How the loop is running: cards, human turns, unattended span, cycle time, first-pass verify.">
      <div className="flex flex-col gap-6">
        <RecordStatRow stats={headline} testId="stats-headline" />
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <AttributeCard title="Rates" icon={Gauge} testId="stats-rates">
            {RATES.map((r) => <FieldRow key={r.key} label={r.label} value={r.fmt(data[r.key])} emptyHint="not yet" />)}
            {extras.map(([k, v]) => <FieldRow key={k} label={humanise(k)} value={typeof v === 'number' ? num(v) : String(v)} />)}
          </AttributeCard>
          <Card data-testid="stats-by-gate">
            <CardHeader>
              <CardTitle>First-pass rate by gate</CardTitle>
              <CardDescription>Share of cards that cleared each gate on the first try.</CardDescription>
            </CardHeader>
            <CardContent>
              {byGate && Object.keys(byGate).length ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Gate</TableHead><TableHead className="text-right">First pass</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {Object.entries(byGate).map(([gate, rate]) => (
                      <TableRow key={gate}><TableCell className="font-medium">{gate}</TableCell><TableCell className="text-right tabular-nums">{pct(rate) ?? '—'}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <EmptyState compact icon={Gauge} title="No gate has been passed yet" description="Rates appear once a card clears its first gate." />}
            </CardContent>
          </Card>
        </div>
        {tables.map(([k, v]) => {
          const rows = Array.isArray(v) ? v : Object.entries(v as Record<string, unknown>).map(([id, val]) => (typeof val === 'object' && val ? { id, ...(val as object) } : { id, value: val }));
          const cols = [...new Set(rows.flatMap((r) => Object.keys(r as object)))];
          return (
            <Card key={k}>
              <CardHeader><CardTitle>{humanise(k)}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{humanise(c)}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>{rows.map((r, i) => <TableRow key={i}>{cols.map((c) => { const val = (r as Record<string, unknown>)[c]; return <TableCell key={c} className="tabular-nums">{typeof val === 'number' ? num(val) : String(val ?? '')}</TableCell>; })}</TableRow>)}</TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageLayout>
  );
}
