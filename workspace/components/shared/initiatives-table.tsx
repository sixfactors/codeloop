'use client';

// Initiatives as a plain table, Jira-style: one row per initiative, the rollup columns the API
// serves (epics, features, stories done/total, score), highest score first. A row opens the tree.
// The list carries each initiative's score; the epic, feature and story counts come from its tree,
// one small request per row, so the table and the detail page print the same numbers.

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { ProgressBar } from '@/components/shared/progress-bar';
import { fmtScore } from '@/components/shared/band-chip';
import { isMissing, useInitiativeList, useInitiativeTrees } from '@/hooks/use-api';
import { routes } from '@/lib/routes';
import type { InitiativeRow, InitiativeTree } from '@/lib/types';

const num = (v: number | undefined) => (v === undefined ? '—' : String(v));

export function InitiativesTable() {
  const router = useRouter();
  const list = useInitiativeList();
  const rows = useMemo(() => [...(list.data ?? [])].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.title.localeCompare(b.title)), [list.data]);
  const trees = useInitiativeTrees(rows.map((b) => b.id));
  const countsOf = (i: number) => {
    const t: InitiativeTree | undefined = trees[i]?.data;
    if (!t) return undefined;
    const feats = [...t.epics.flatMap((e) => e.features), ...t.features];
    return { epics: t.epics.length, features: feats.length, done: feats.reduce((n, f) => n + f.done, 0), total: feats.reduce((n, f) => n + f.total, 0) };
  };

  if (list.isLoading) return <PageSkeleton statCards={0} showToolbar={false} tableRows={4} />;
  if (list.error) {
    return isMissing(list.error)
      ? <EmptyState icon={Layers} title="Initiatives are not served yet" description="GET /api/initiatives is being added; initiatives, epics and features land here." />
      : <InlineError title="Initiatives failed to load" error={list.error} onRetry={() => list.refetch()} />;
  }
  if (!rows.length) return <EmptyState icon={Layers} title="No initiatives yet" description="Write one under .codeloop/wiki/initiatives, or run `codeloop initiative new`, and it appears here with its epics and features." />;

  const open = (b: InitiativeRow) => router.push(routes.initiative(b.id));
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table className="table-fixed" data-testid="initiatives-table">
        <TableHeader>
          <TableRow>
            <TableHead>Initiative</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="hidden w-[18%] md:table-cell">Metric</TableHead>
            <TableHead className="hidden w-[20%] xl:table-cell">Goal</TableHead>
            <TableHead className="w-16 text-right">Epics</TableHead>
            <TableHead className="w-20 text-right">Features</TableHead>
            <TableHead className="w-32">Stories</TableHead>
            <TableHead className="w-16 text-right">Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b, i) => { const c = countsOf(i); return (
            <TableRow
              key={b.id}
              tabIndex={0}
              role="link"
              aria-label={`Open ${b.title}`}
              className="cursor-pointer"
              onClick={() => open(b)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(b); } }}
              data-testid={`initiative-row-${b.id}`}
            >
              <TableCell className="font-medium"><span className="block truncate" title={b.title}>{b.title}</span></TableCell>
              <TableCell>{b.status ? <Badge variant="outline" className="rounded-full">{b.status}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="hidden truncate text-muted-foreground md:table-cell" title={b.metric}>{b.metric ?? '—'}</TableCell>
              <TableCell className="hidden truncate text-muted-foreground xl:table-cell" title={b.goal}>{b.goal ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums">{num(c?.epics)}</TableCell>
              <TableCell className="text-right tabular-nums">{num(c?.features)}</TableCell>
              <TableCell>{c ? <ProgressBar done={c.done} total={c.total} /> : <span className="text-muted-foreground">…</span>}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{fmtScore(b.score)}</TableCell>
            </TableRow>
          ); })}
        </TableBody>
      </Table>
    </div>
  );
}
