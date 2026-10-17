// What each folded section of the story page says on its heading, worked out from the full story
// the API returns. Pure, so a failing check is never hidden by a fold: the checks heading carries
// the failure count whether or not the section is open.

import type { CardFull, SummaryViewLine } from './types';

export interface FoldHeading {
  count: string;
  /** A real failure inside: the heading shows it without opening the section. */
  failing: boolean;
}

export interface FoldHeadings {
  checks: FoldHeading;
  history: FoldHeading;
  raw: FoldHeading;
  tasks: FoldHeading;
  details: FoldHeading;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function foldHeadings(full: Pick<CardFull, 'card' | 'journey' | 'rubric' | 'tasks' | 'commits'>): FoldHeadings {
  const rows = full.rubric?.rows ?? [];
  const failedRows = rows.filter((r) => r.status === 'fail').length;
  const check = full.journey?.check;
  const checkFailed = Boolean(check && !check.pass);
  const failed = failedRows + (checkFailed && !failedRows ? 1 : 0);
  const tasks = full.tasks ?? [];
  const done = tasks.filter((t) => t.done).length;
  const commits = full.commits?.length ?? 0;
  const events = full.card.events?.length ?? 0;
  return {
    checks: { count: failed ? `${failed} failing` : rows.length ? plural(rows.length, 'row', 'rows') : check ? (check.pass ? 'passed' : 'failing') : 'none yet', failing: failed > 0 },
    history: { count: plural(events, 'event', 'events'), failing: false },
    raw: { count: check ? (check.output.trim() ? 'last check' : 'no output') : 'none yet', failing: false },
    tasks: { count: `${tasks.length ? `${done} of ${tasks.length} done` : 'no tasks'} · ${plural(commits, 'commit', 'commits')}`, failing: false },
    details: { count: [full.card.lane, full.card.size].filter(Boolean).join(' · '), failing: false },
  };
}

/** "Fri 09:41": the day and time a summary line was written. */
export function shortWhen(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  return `${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "by claude · Fri 09:41 · at spec", or "from the board · …" for a line nobody wrote. */
export function whoLine(l: SummaryViewLine): string {
  const who = l.byKind === 'board' ? 'from the board' : l.byKind === 'person' ? `by ${l.by === 'owner' ? 'you' : l.by}` : `by ${l.by}`;
  return [who, shortWhen(l.at), `at ${l.step}`].filter(Boolean).join(' · ');
}
