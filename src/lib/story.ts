import { loadConfig } from './config.js';
import { readCards, RefusalError, writeCards, type Card, type Size, type StoryFields } from './cards.js';

/** The personas every board knows; `personas:` in config.yaml adds the repo's own. */
export const KNOWN_PERSONAS = ['founder', 'builder', 'reviewer', 'dev', 'visitor', 'team'];
export const SIZES: Size[] = ['S', 'M', 'L'];
export const POINTS = [1, 2, 3, 5, 8];
const MAX_TITLE_WORDS = 12;
// Each one marks a mechanism (a flag, a file, a path, a key, a call) rather than what the user can now do.
const TECHNICAL = ['`', '--', ':', '.yaml', '.md', '/', '()'];
const CAMEL = /\b[a-z]+[A-Z][A-Za-z]*\b/;

/**
 * Why a title fails the standard, one line each. Empty when it reads as what the user can now do.
 * The standard: at most twelve words, none of the technical marks, no camelCase token.
 */
export function titleProblems(title: string): string[] {
  const problems: string[] = [];
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length > MAX_TITLE_WORDS) problems.push(`title has ${words.length} words, the limit is ${MAX_TITLE_WORDS}`);
  const marks = TECHNICAL.filter(m => title.includes(m));
  if (marks.length) problems.push(`title carries ${marks.map(m => `"${m}"`).join(', ')}: name what the user can now do, not the mechanism`);
  const camel = CAMEL.exec(title)?.[0];
  if (camel) problems.push(`title has a camelCase token "${camel}": name what the user can now do, not the code`);
  return problems;
}

/**
 * `personas:` in config.yaml, as a list of names, a list of `{ name, pains }` maps, or a map keyed
 * by name. The built-in six are always known.
 */
export function knownPersonas(projectDir: string): string[] {
  const raw = loadConfig(projectDir).personas;
  const own: string[] = Array.isArray(raw)
    ? raw.map(p => (typeof p === 'string' ? p : String(p?.name ?? p?.id ?? ''))).filter(Boolean)
    : raw && typeof raw === 'object'
    ? Object.keys(raw)
    : [];
  return [...new Set([...KNOWN_PERSONAS, ...own])];
}

/** Why a card fails the story standard, one line each. Empty when it passes. */
export function checkStory(projectDir: string, card: Card): string[] {
  const problems = titleProblems(card.title);
  const story = card.story;
  if (!story) problems.push('no story: `As a <persona>, I can <what>, so that <pain relieved>` (--persona, --can, --so)');
  else {
    if (!story.as?.trim()) problems.push('story has no persona');
    if (!story.can?.trim()) problems.push('story has no "I can" part');
    if (!story.so?.trim()) problems.push('story has no "so that": no outcome, no card');
  }
  const persona = card.persona ?? story?.as;
  if (persona && !knownPersonas(projectDir).includes(persona)) {
    problems.push(`persona "${persona}" is not known (${knownPersonas(projectDir).join(', ')}); add it under personas: in .codeloop/config.yaml`);
  }
  if (card.size === undefined) problems.push('no size: S, M or L');
  else if (!SIZES.includes(card.size)) problems.push(`size "${card.size}" is not S, M or L`);
  if (card.points !== undefined && !POINTS.includes(card.points)) problems.push(`points ${card.points} is not one of ${POINTS.join(', ')}`);
  return problems;
}

export interface StoryFlags {
  persona?: string;
  can?: string;
  so?: string;
  size?: string;
  points?: string | number;
  initiative?: string;
  epic?: string;
  feature?: string;
  /** Weeks; replaces the feature's effort in this card's RICE score. */
  effort?: string | number;
  metric?: string;
  force?: boolean;
}

/**
 * The story fields from `card new`/`propose`/`start` flags, validated. A title that fails the
 * standard or a story missing a part is refused unless `--force`; a card with no story flags at
 * all is left as it was, so older callers still work.
 */
export function storyFields(title: string, flags: StoryFlags): StoryFields {
  const fields: StoryFields = {};
  const problems = flags.force ? [] : titleProblems(title);
  const partial = flags.persona || flags.can || flags.so;
  if (partial) {
    if (!flags.persona || !flags.can || !flags.so) problems.push('a story needs all three parts: --persona, --can and --so');
    else fields.story = { as: flags.persona, can: flags.can, so: flags.so };
  }
  if (flags.persona) fields.persona = flags.persona;
  if (flags.size !== undefined) {
    const size = flags.size.toUpperCase();
    if (!SIZES.includes(size as Size)) throw new RefusalError(`size "${flags.size}" is not S, M or L`);
    fields.size = size as Size;
  }
  if (flags.points !== undefined) {
    const points = Number(flags.points);
    if (!POINTS.includes(points)) throw new RefusalError(`points "${flags.points}" is not one of ${POINTS.join(', ')}`);
    fields.points = points;
  }
  for (const key of ['initiative', 'epic', 'feature', 'metric'] as const) if (flags[key]) fields[key] = flags[key];
  if (flags.effort !== undefined) {
    const effort = Number(flags.effort);
    if (!Number.isFinite(effort) || effort <= 0) throw new RefusalError(`effort "${flags.effort}" is not a number of weeks`);
    fields.effort = effort;
  }
  if (problems.length) throw new RefusalError(`${problems.join('; ')} (--force overrides)`);
  return fields;
}

// The one-line form earlier proposals were written in: story, then initiative, size and metric separated by
// middle dots. "I get" and "we can" were written too; the verb stays in `can` when it is not "can".
const DESCRIPTION = /^As an? ([^,]+), (?:I|we) (?:can )?(.+?), so that (.+?)\.?\s*Initiative: (.+?) · ([SML]) · metric: (.+?)\s*$/s;

/** The story fields written into a proposal's description, or undefined when it is not in that form. */
export function parseStoryDescription(description: string): StoryFields | undefined {
  const m = DESCRIPTION.exec(description.trim());
  if (!m) return undefined;
  const [, as, can, so, initiative, size, metric] = m;
  return { story: { as: as.trim(), can: can.trim(), so: so.trim() }, persona: as.trim(), size: size as Size, initiative: initiative.trim(), metric: metric.trim() };
}

/** Fills the story fields of every card whose description carries them and has no story yet. Returns the cards changed. */
export function migrateStories(projectDir: string): string[] {
  const file = readCards(projectDir);
  const changed: string[] = [];
  const cards = file.cards.map(card => {
    if (card.story || !card.description) return card;
    const fields = parseStoryDescription(card.description);
    if (!fields) return card;
    changed.push(card.id);
    return { ...card, ...fields };
  });
  if (changed.length) writeCards(projectDir, file, cards);
  return changed;
}

export function listFilter<T extends Card>(cards: T[], filter: { lane?: string; stage?: string; initiative?: string; epic?: string; persona?: string; size?: string; points?: string | number; all?: boolean }): T[] {
  return cards.filter(c =>
    (filter.all || c.stage !== 'dropped') &&
    (!filter.lane || c.lane === filter.lane) &&
    (!filter.stage || c.stage === filter.stage) &&
    (!filter.initiative || c.initiative === filter.initiative) &&
    (!filter.epic || c.epic === filter.epic) &&
    (!filter.persona || (c.persona ?? c.story?.as) === filter.persona) &&
    (!filter.size || c.size === filter.size.toUpperCase()) &&
    (filter.points === undefined || c.points === Number(filter.points)),
  );
}
