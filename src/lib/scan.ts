import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { listCompetitors } from './competitors.js';
import { proposeCard } from './engine.js';
import { clock } from './clock.js';
import { withLock } from './lock.js';

export const SCAN_DIR = '.codeloop/state/scan';
const PLAN_LANE = 'plan';
const FETCH_TIMEOUT_MS = 10_000;
const EXCERPT_LINES = 12;
const TITLE_CHARS = 80;

export interface ScanResult {
  name: string;
  /** baseline: first text seen, stored and nothing proposed. already-proposed: a card for this change exists. */
  outcome: 'proposed' | 'already-proposed' | 'unchanged' | 'baseline' | 'skipped';
  card?: string;
  reason?: string;
}

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** A changelog page as lines of text. HTML headings become `#` lines so a heading can be told from a sentence. */
export function pageText(raw: string): string {
  const text = /<\/?(html|body|h[1-6]|p|div|li)\b/i.test(raw)
    ? raw
        .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
        .replace(/<h[1-6]\b[^>]*>/gi, '\n# ')
        .replace(/<li\b[^>]*>/gi, '\n- ')
        .replace(/<\/(h[1-6]|p|div|li|ul|ol|tr|section|article)>|<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, e => ENTITIES[e])
    : raw;
  return text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n') + '\n';
}

/** Lines of `after` that `before` does not have, in page order. */
export function newLines(before: string, after: string): string[] {
  const seen = new Set(before.split('\n'));
  return after.split('\n').filter(l => l && !seen.has(l));
}

async function fetchText(url: string): Promise<{ text: string } | { reason: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { 'user-agent': 'codeloop-scan' } });
    return res.ok ? { text: await res.text() } : { reason: `${url} answered ${res.status}` };
  } catch (e) {
    const cause = (e as Error).cause as NodeJS.ErrnoException | undefined;
    return { reason: `${url} did not answer (${cause?.code ?? (e as Error).message})` };
  }
}

/**
 * Reads each competitor page's changelog, compares it with the text stored from the last scan and,
 * when new text appeared, proposes one card in the plan lane for that competitor. The card waits
 * for the owner; nothing starts it. `fromFile` supplies the page text instead of fetching.
 */
export async function scanCompetitors(projectDir: string, opts: { fromFile?: string; only?: string; now?: Date } = {}): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  const now = opts.now ?? clock();
  for (const competitor of listCompetitors(projectDir).filter(c => c.changelog && (!opts.only || c.name === opts.only))) {
    const fetched = opts.fromFile ? { text: readFileSync(resolve(projectDir, opts.fromFile), 'utf-8') } : await fetchText(competitor.changelog!);
    if ('reason' in fetched) {
      results.push({ name: competitor.name, outcome: 'skipped', reason: fetched.reason });
      continue;
    }
    const text = pageText(fetched.text);
    const stored = join(projectDir, SCAN_DIR, `${competitor.name}.txt`);
    results.push(withLock(stored, (): ScanResult => {
      const before = existsSync(stored) ? readFileSync(stored, 'utf-8') : null;
      const fresh = before === null ? [] : newLines(before, text);
      let result: ScanResult = { name: competitor.name, outcome: before === null ? 'baseline' : 'unchanged' };
      if (fresh.length) {
        const headline = (fresh.find(l => l.startsWith('#')) ?? fresh[0]).replace(/^[#\-*\s]+/, '').slice(0, TITLE_CHARS);
        const excerpt = fresh.slice(0, EXCERPT_LINES).join('\n');
        const { card, created } = proposeCard(projectDir, {
          lane: PLAN_LANE,
          title: `${competitor.title} shipped: ${headline}`,
          description: `New on ${competitor.title}'s changelog, seen ${now.toISOString().slice(0, 10)}:\n\n${excerpt}${fresh.length > EXCERPT_LINES ? `\n(${fresh.length - EXCERPT_LINES} more new lines)` : ''}\n\nSource: ${competitor.changelog}`,
          source: competitor.changelog,
          // The change itself names the card, so the same new text cannot produce a second one.
          dedupe: `scan:${competitor.name}:${createHash('sha1').update(fresh.join('\n')).digest('hex').slice(0, 16)}`,
          role: 'engine',
          now,
        });
        result = { name: competitor.name, outcome: created ? 'proposed' : 'already-proposed', card: card.id };
      }
      // Stored after the card exists: a crash in between repeats the proposal, which `dedupe` absorbs.
      mkdirSync(dirname(stored), { recursive: true });
      writeFileSync(stored, text);
      return result;
    }));
  }
  return results;
}
