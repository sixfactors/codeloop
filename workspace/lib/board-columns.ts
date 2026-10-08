// Which card queries the board draws, one per column. Shared by the board (client) and its page's
// server component, which prefetches the same queries, so the two never ask for different pages.

import type { SearchAndFilterValue } from '@/components/shared/search-and-filter';
import { DONE_STAGE_IDS } from './cards';
import { BOARD_FACETS, CARD_FACETS, type CardsQuery, type Lane } from './types';

/** Every column is ordered by RICE score; the server sorts, and a column re-sorts its loaded rows the same way. */
export const BOARD_BASE: CardsQuery = { q: '', sort: 'score' };

/** Search and facets go to the server; the "show dropped" toggle only adds a dropped column per lane. */
export function toQuery(f: SearchAndFilterValue): CardsQuery {
  const q: CardsQuery = { ...BOARD_BASE, q: f.q };
  for (const k of [...CARD_FACETS, ...BOARD_FACETS]) if (f.facets[k]?.length) q[k] = f.facets[k];
  if (f.facets.needsMe?.includes('yes')) q.needsMe = true;
  return q;
}

/** The columns the board asks the server for; the page's server component prefetches the same list. */
export interface ColumnSpec {
  key: string;
  label: string;
  query: CardsQuery;
  lane?: Lane;
  stageId?: string;
  /** Hidden until its total is known to be non-zero (a done or dropped column a lane does not declare). */
  optional?: boolean;
}

/** One lane's columns: its declared stages, then a done column and (when asked) a dropped column for cards parked outside the lane's stages. */
export function laneColumns(lane: Lane, base: CardsQuery, showDropped: boolean): ColumnSpec[] {
  const declared = lane.stages.map((s) => s.id);
  const cols: ColumnSpec[] = declared.map((s) => ({ key: `${lane.id}/${s}`, label: s, query: { ...base, lane: [lane.id], stage: [s] }, lane, stageId: s }));
  const doneExtra = DONE_STAGE_IDS.filter((s) => !declared.includes(s));
  if (doneExtra.length) cols.push({ key: `${lane.id}/done`, label: 'done', query: { ...base, lane: [lane.id], stage: doneExtra }, lane, stageId: 'done', optional: true });
  if (showDropped && !declared.includes('dropped')) cols.push({ key: `${lane.id}/dropped`, label: 'dropped', query: { ...base, lane: [lane.id], stage: ['dropped'] }, lane, stageId: 'dropped', optional: true });
  return cols;
}

/** The filters a link can preset (`/?feature=x` from a tree page's "Show on board"). */
const URL_FACETS = ['initiative', 'epic', 'feature', 'band', 'lane', 'stage'] as const;

/**
 * Filters preset by the URL: `/?feature=x&band=P1`, each key may repeat. The page's server component
 * reads them and passes them in, so the server and the client render the same first board; a
 * `useSearchParams` boundary here would hydrate late, after the live stream had already moved the cache.
 */
export function filtersFromUrl(params: Record<string, string | string[] | undefined>): SearchAndFilterValue {
  const all = (k: string) => { const v = params[k]; return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean); };
  const facets: Record<string, string[]> = {};
  for (const k of URL_FACETS) { const vals = all(k); if (vals.length) facets[k] = vals; }
  if (all('needsMe')[0] === '1') facets.needsMe = ['yes'];
  if (all('dropped')[0] === '1') facets.dropped = ['yes'];
  return { q: all('q')[0] ?? '', facets };
}

export const backlogQuery = (base: CardsQuery): CardsQuery => ({ ...base, stage: ['proposed'] });
