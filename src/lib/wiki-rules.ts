import { evidenceOf } from './paths.js';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { findCard, readCards, type Card } from './cards.js';
import { RefusalError } from './engine.js';
import { researchSummary } from './research.js';
import { capture, listPages, type Kind, type Page } from './wiki.js';

/**
 * What each wiki folder accepts. A page that misses its rule is refused with the rule named, so the
 * wiki holds decisions, gotchas and runbooks a later agent can act on, and not copies of stage output.
 */
export const WIKI_RULES: Record<string, string> = {
  decision: 'a choice between at least two options under `## Options`, a `## Why` and a `## Consequences`, titled by the choice (never the card title), with scope files',
  gotcha: 'scope files, the failure seen (`Failure:`) and the fix (`Fix:`)',
  runbook: 'the command, in backticks, and when to run it',
  competitor: 'written only by `codeloop wiki competitor add`',
};

const MIRROR = /:\s*(build|buy|drop)\s*$/i;
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'are', 'was', 'its', 'each', 'every', 'one', 'all', 'has', 'have', 'not', 'when', 'can', 'get', 'use', 'our', 'out']);

/** A title with a research verdict suffix and card ids stripped, lower case: the form two titles are compared in. */
export function normaliseTitle(title: string): string {
  return title.replace(MIRROR, '').replace(/\bc-\d+\b/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function titleTokens(title: string): Set<string> {
  return new Set(normaliseTitle(title).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)));
}

/** Shared tokens over all tokens of the two titles. */
export function titleSimilarity(a: string, b: string): number {
  const x = titleTokens(a);
  const y = titleTokens(b);
  const shared = [...x].filter(t => y.has(t)).length;
  const all = new Set([...x, ...y]).size;
  return all ? shared / all : 0;
}

/** Same page: titles overlap by 0.6 or more, or the same scope files and the same first heading. */
export const SAME_PAGE = 0.6;
/** Close enough that `wiki lint` names the pair for a person to fold by hand. */
export const NEAR_PAGE = 0.4;

const firstHeading = (body: string) => /^#+\s+(.+)$/m.exec(body)?.[1]?.trim().toLowerCase();

export function samePage(page: Pick<Page, 'title' | 'scope' | 'body'>, input: { title: string; scope: string[]; body: string }): boolean {
  if (titleSimilarity(page.title, input.title) >= SAME_PAGE) return true;
  const heading = firstHeading(input.body);
  return Boolean(heading && page.scope.length && heading === firstHeading(page.body) && [...page.scope].sort().join() === [...input.scope].sort().join());
}

function section(body: string, name: string): string | null {
  const m = new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(body);
  return m ? m[1] : null;
}

/** The options listed under `## Options`: list items, or table rows below the header. */
export function optionLines(body: string): string[] {
  const text = section(body, 'Options');
  if (!text) return [];
  const lines = text.split('\n');
  // An item runs on through its wrapped lines, up to the next item or a blank line.
  const items: string[] = [];
  let open = false;
  for (const l of lines) {
    if (/^\s*(?:[-*]|\d+\.)\s+\S/.test(l)) {
      items.push(l.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').trim());
      open = true;
    } else if (open && /^\s+\S/.test(l)) items[items.length - 1] += ` ${l.trim()}`;
    else open = false;
  }
  if (items.length) return items;
  const rows = lines.filter(l => /^\s*\|/.test(l) && !/^\s*\|\s*:?-/.test(l));
  return rows.slice(1).map(r => r.trim());
}

/** What is wrong with a page for its folder's rule; empty when it may be written. */
export function ruleProblems(kind: Kind | 'runbook', input: { title: string; scope: string[]; body: string }, cardTitle?: string): string[] {
  const problems: string[] = [];
  if (kind === 'decision') {
    if (optionLines(input.body).length < 2) problems.push('decision needs at least two options under ## Options');
    if (section(input.body, 'Why') === null) problems.push('decision needs a ## Why');
    if (section(input.body, 'Consequences') === null) problems.push('decision needs a ## Consequences');
    if (!input.scope.length) problems.push('decision needs scope files');
    if (MIRROR.test(input.title) || (cardTitle && normaliseTitle(input.title) === normaliseTitle(cardTitle))) problems.push('decision is titled by the choice, never the card title');
  } else if (kind === 'gotcha') {
    if (!input.scope.length) problems.push('gotcha needs scope files');
    if (!/^(?:#+\s*)?(failure|seen|symptom)\b/im.test(input.body) || !/^(?:#+\s*)?fix\b/im.test(input.body)) problems.push('gotcha needs the failure seen and the fix (`Failure:` and `Fix:` lines)');
  } else if (kind === 'runbook') {
    if (!/`[^`]+`/.test(input.body) || !/\bwhen\b/i.test(input.body)) problems.push('runbook needs the command and when to run it');
  }
  return problems;
}

export function enforceRule(kind: Kind, input: { title: string; scope: string[]; body: string }, cardTitle?: string): void {
  const problems = ruleProblems(kind, input, cardTitle);
  if (problems.length) throw new RefusalError(`wiki ${kind} refused: ${problems.join('; ')}. The rule: ${WIKI_RULES[kind]}`);
}

// The chosen option's first clause, as a page title: "Add a trivial size. Chosen." -> "Add a trivial size".
function choiceTitle(option: string): string {
  const clause = option.replace(/\*\*|`/g, '').replace(/\s*\([^)]*\)/g, '').replace(/^[A-Z]:\s+/, '').split(/(?<=\S)[.;:\u2014](?:\s|$)|\s\u2014\s/)[0].trim();
  if (clause.length <= 70) return clause;
  return clause.slice(0, 70).replace(/\s+\S*$/, '').replace(/[\s,;:/|-]+$/, '');
}

const scopeIn = (projectDir: string, text: string) => [...new Set([...text.matchAll(/`([\w./-]+\.\w+)`/g)].map(m => m[1]).filter(p => existsSync(join(projectDir, p))))];

/** The decision a research document with compared options makes, and what stops it being written. Null when no options were compared. */
export function decisionFromResearch(projectDir: string, card: Pick<Card, 'id' | 'title'>, text: string): { input: { title: string; scope: string[]; body: string; kind: 'decision'; card: string }; problems: string[] } | null {
  const summary = researchSummary(text);
  if (!summary) return null;
  const options = optionLines(text);
  if (options.length < 2) return null;
  const chosen = options.find(o => /\bchosen\b/i.test(o)) ?? options[0];
  const input = {
    kind: 'decision' as const,
    card: card.id,
    title: choiceTitle(chosen),
    scope: scopeIn(projectDir, text),
    body: ['## Options', '', (section(text, 'Options') ?? '').trim(), '', '## Why', '', summary.pain ?? `Verdict: ${summary.verdict}.`, '', '## Consequences', '', `${chosen.replace(/\s*\bChosen\b\.?/i, '').trim()} The other options are not built; reopening one is a new decision.`].join('\n'),
  };
  return { input, problems: ruleProblems('decision', input, card.title) };
}

function researchPath(card: Card): string | null {
  return card.spec ? `${card.spec}/research.md` : null;
}

function reviewPath(projectDir: string, card: Card): string | null {
  const nnn = /(\d{3,})/.exec(card.spec ?? '')?.[1];
  return nnn ? `${evidenceOf(projectDir, nnn)}/review.md` : null;
}

/**
 * Whether a stage's findings reached the wiki. Research: compared options need a decision page that
 * carries the card, or research that can make a valid one (the engine writes it as the stage passes).
 * Review: a fix-now finding that names a repeat mistake needs a gotcha page carrying the card.
 */
export function wikiLanded(projectDir: string, ref: string, stage?: string): string[] {
  const card = findCard(readCards(projectDir).cards, ref);
  const at = stage ?? card.stage;
  const pages = listPages(projectDir);
  const carries = (kind: Kind) => pages.some(p => p.kind === kind && p.cards.includes(card.id));
  if (at === 'research') {
    const path = researchPath(card);
    if (!path || !existsSync(join(projectDir, path))) return [];
    const made = decisionFromResearch(projectDir, card, readFileSync(join(projectDir, path), 'utf-8'));
    if (!made || carries('decision') || !made.problems.length) return [];
    return [`${card.id} compared options in ${path} but no decision page carries the card, and the research cannot make one: ${made.problems.join('; ')}`];
  }
  if (at === 'review') {
    const path = reviewPath(projectDir, card);
    if (!path || !existsSync(join(projectDir, path))) return [];
    const repeats = readFileSync(join(projectDir, path), 'utf-8').split('\n').filter(l => /fix[ -]now/i.test(l) && /\b(repeat|again|recurr|second time|same mistake)/i.test(l));
    if (!repeats.length || carries('gotcha')) return [];
    return [`${card.id} has ${repeats.length} fix-now finding(s) naming a repeat mistake and no gotcha page carries the card: \`codeloop wiki capture --title "<the mistake>" --scope <files> --card ${card.id}\` with Failure: and Fix: lines`];
  }
  return [];
}

export interface MigrationRow {
  from: string;
  to: string | null;
  why: string;
}

/**
 * Turns research mirrors (decision pages titled "<card title>: build|buy|drop") into decisions titled by
 * the choice when they compared options, and removes the rest: they repeat research.md and decide nothing.
 */
export function migrateResearchDecisions(projectDir: string, opts: { dryRun?: boolean } = {}): MigrationRow[] {
  const rows: MigrationRow[] = [];
  const mirrors = listPages(projectDir).filter(p => p.kind === 'decision' && MIRROR.test(p.title)).sort((a, b) => a.path.localeCompare(b.path));
  for (const page of mirrors) {
    const verdict = MIRROR.exec(page.title)![1];
    // Mirrors written before the options fix hold only the first option; the research file has them all.
    const source = /^From (\S+research\.md)\.\s*$/m.exec(page.body)?.[1];
    const text = source && existsSync(join(projectDir, source))
      ? readFileSync(join(projectDir, source), 'utf-8')
      : `verdict: ${verdict}\n${page.body.replace(/^Verdict:.*$/m, '').replace(/^Exists:/m, 'exists:').replace(/^Pain:/m, 'pain:')}`;
    const made = decisionFromResearch(projectDir, { id: page.cards[0] ?? '', title: page.title.replace(MIRROR, '') }, text);
    const why = !made ? 'one option compared' : made.problems.length ? made.problems.join('; ') : 'folded';
    if (opts.dryRun) {
      rows.push({ from: page.path, to: made && !made.problems.length ? `(${made.input.title})` : null, why });
      continue;
    }
    rmSync(join(projectDir, page.path));
    if (!made || made.problems.length) {
      rows.push({ from: page.path, to: null, why });
      continue;
    }
    let written = capture(projectDir, made.input);
    for (const extra of page.cards.slice(1)) written = capture(projectDir, { ...made.input, card: extra });
    rows.push({ from: page.path, to: written.path, why });
  }
  return rows;
}
