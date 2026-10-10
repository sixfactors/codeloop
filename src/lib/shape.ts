/**
 * The shape workflow: a problem in, an epic of small, ordered, independently shippable stories
 * out (docs/plans/codeloop/2026-10-09-shape-workflow.md). This module parses and checks
 * `shape/{id}/brief.md` and `breakdown.md`, and turns an approved breakdown into an epic page, any
 * feature pages it names, and one build-lane story per line.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { stringify as stringifyYaml } from 'yaml';
import { annotateCard, createCard, queueCard, recordEvent, RefusalError, type Role } from './engine.js';
import { EPICS_DIR, FEATURES_DIR } from './features.js';
import { findCard, readCards, type Card, type Size } from './cards.js';
import { loadLane } from './lane.js';
import { sourceOf } from './research.js';
import { newSpec, resolveSpecDir, slugify } from './spec.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAX_STORIES = 7;
const EXISTS_VERDICTS = ['have', 'unlock', 'port', 'build'];
// Each one is a placeholder the standard explicitly bans: it names no check a person or a command
// can run, so a story carrying it has not actually been thought through.
const PLACEHOLDER_DONE_WHEN = /^(all (tasks|stories) complete|done|tbd)\.?$/i;

// ---- shape/{id}/ folder --------------------------------------------------------------------

/** Creates `shape/{id}/brief.md`, `breakdown.md` and `interview.md` from the shared templates, with the problem filled into the brief. Existing files are left alone, same as `newSpec`. */
export function newShape(projectDir: string, cardId: string, problem: string, role: Role = 'agent'): { dir: string; created: string[] } {
  const card = findCard(readCards(projectDir).cards, cardId);
  const dir = card.spec ?? `shape/${card.id}`;
  const created: string[] = [];
  mkdirSync(join(projectDir, dir), { recursive: true });
  for (const name of ['brief.md', 'breakdown.md', 'interview.md']) {
    const dest = join(projectDir, dir, name);
    if (existsSync(dest)) continue;
    const template = readFileSync(join(PACKAGE_ROOT, 'templates/shape', name), 'utf-8');
    const filled = template.replaceAll('{{id}}', card.id).replaceAll('{{title}}', card.title).replaceAll('{{problem}}', problem);
    writeFileSync(dest, filled);
    created.push(`${dir}/${name}`);
  }
  // The shape folder is recorded on the `spec` field, the same one `newSpec` uses: `resolveSpecDir`
  // then finds brief.md and breakdown.md for a shape card exactly as it finds spec.md for a build one.
  if (card.spec !== dir) annotateCard(projectDir, card.id, { spec: dir }, 'shape', { note: dir, role });
  return { dir, created };
}

// ---- brief.md -------------------------------------------------------------------------------

export function checkBrief(projectDir: string, ref: string): { file: string; errors: string[] } {
  const file = `${resolveSpecDir(projectDir, ref)}/brief.md`;
  if (!existsSync(join(projectDir, file))) return { file, errors: [`missing file: ${file}`] };
  const text = readFileSync(join(projectDir, file), 'utf-8');
  // [ \t]*, not \s*: \s matches a newline too, which would let an empty "problem:" line count as
  // filled in by reading past it into whatever non-blank text follows on the next line.
  const errors: string[] = [];
  if (!/^problem:[ \t]*\S/m.test(text)) errors.push(`${file} has no "problem:" line filled in`);
  if (!/^users:[ \t]*\S/m.test(text)) errors.push(`${file} has no "users:" line filled in`);
  if (!/^exists:[ \t]*\S/m.test(text)) errors.push(`${file} has no "exists:" line (have, unlock, port or build)`);
  // A brief's sources are mostly files in this repo or a sibling, so a path counts as well as a URL.
  const sources = text.split('\n').map(l => sourceOf(projectDir, l.trim())).filter((u): u is string => !!u);
  if (sources.length < 3) errors.push(`${file} cites ${sources.length} ${sources.length === 1 ? 'source' : 'sources'}, needs at least 3 (\`- source: <url or path> — <note>\`)`);
  return { file, errors };
}

// ---- breakdown.md ---------------------------------------------------------------------------

export interface ShapeStory {
  id: string;
  size?: string;
  title: string;
  exists?: string;
  existsPath?: string;
  doneWhen?: string;
  dependsOn: string[];
  feature?: string;
  rice?: { r: number; i: number; c: number; e: number };
}

export interface ShapeBreakdown {
  title: string;
  hypothesis?: string;
  metric?: string;
  feature?: string;
  stories: ShapeStory[];
  later: string[];
}

// A story line is parsed field by field rather than with one strict regex, so a story missing a
// field (no size, no exists:) still parses into a ShapeStory the checker can name problems on,
// instead of the whole line silently vanishing from the list.
function parseStoryLine(raw: string): ShapeStory | null {
  if (!raw.startsWith('- ')) return null;
  const parts = raw.slice(2).split(' · ').map(p => p.trim());
  const head = /^(S\d+)\s*(?:\[([^\]]*)\])?\s*(.*)$/.exec(parts[0] ?? '');
  if (!head) return null;
  const [, id, size, title] = head;
  const story: ShapeStory = { id, size: size || undefined, title: title.trim(), dependsOn: [] };
  for (const part of parts.slice(1)) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(part);
    if (!kv) continue;
    const [, key, value] = kv;
    const v = value.trim();
    if (key === 'exists') {
      const m = /^(\S+)(?:\s+(\S+))?$/.exec(v);
      story.exists = m?.[1] ?? v;
      if (m?.[2]) story.existsPath = m[2];
    } else if (key === 'done_when') {
      story.doneWhen = v;
    } else if (key === 'depends_on') {
      story.dependsOn = v === '' || v === 'none' ? [] : v.split(',').map(s => s.trim()).filter(Boolean);
    } else if (key === 'feature') {
      story.feature = v;
    } else if (key === 'rice') {
      const m = /^R=(\d+)\s+I=(\d+)\s+C=(\d+)\s+E=(\d+)$/.exec(v);
      if (m) story.rice = { r: +m[1], i: +m[2], c: +m[3], e: +m[4] };
    }
  }
  return story;
}

/** The epic header, its stories in file order, and the deferred `## Later` list. */
export function parseBreakdown(text: string): ShapeBreakdown {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const title = lines.find(l => /^# Epic:/.test(l))?.replace(/^# Epic:\s*/, '').trim() ?? '';
  const field = (name: string) => {
    const line = lines.find(l => new RegExp(`^${name}:`).test(l));
    return line ? line.slice(name.length + 1).trim() || undefined : undefined;
  };
  const storiesAt = lines.findIndex(l => /^##\s*Stories/i.test(l));
  const laterAt = lines.findIndex(l => /^##\s*Later/i.test(l));
  const storyLines = storiesAt < 0 ? [] : lines.slice(storiesAt + 1, laterAt < 0 ? undefined : laterAt).filter(l => l.trim().startsWith('- '));
  const stories = storyLines.map(l => parseStoryLine(l.trim())).filter((s): s is ShapeStory => s !== null);
  const later = laterAt < 0 ? [] : lines.slice(laterAt + 1).filter(l => l.trim().startsWith('- ')).map(l => l.trim().slice(2).trim());
  return { title, hypothesis: field('hypothesis'), metric: field('metric'), feature: field('feature'), stories, later };
}

/**
 * Refuses a breakdown when any story has no size or is L, no done_when or a placeholder one, no
 * exists verdict, a depends_on naming a story that is not earlier in the file; when there are no
 * stories or more than seven; when the epic has no hypothesis or metric; and, with `ranked`, when
 * any story has no rice part.
 */
export function checkBreakdown(projectDir: string, ref: string, opts: { ranked?: boolean } = {}): { file: string; errors: string[] } {
  const file = `${resolveSpecDir(projectDir, ref)}/breakdown.md`;
  if (!existsSync(join(projectDir, file))) return { file, errors: [`missing file: ${file}`] };
  const breakdown = parseBreakdown(readFileSync(join(projectDir, file), 'utf-8'));
  const errors: string[] = [];
  if (!breakdown.hypothesis) errors.push(`${file} has no "hypothesis:" line on the epic`);
  if (!breakdown.metric) errors.push(`${file} has no "metric:" line on the epic`);
  if (breakdown.stories.length === 0) errors.push(`${file} has no stories under "## Stories"`);
  if (breakdown.stories.length > MAX_STORIES) errors.push(`${file} has ${breakdown.stories.length} stories, the limit is ${MAX_STORIES}: split the epic`);

  const seen = new Set<string>();
  for (const story of breakdown.stories) {
    if (!story.size) errors.push(`${story.id}: no size (S, M or L)`);
    else if (story.size === 'L') errors.push(`${story.id}: size L; split it in the breakdown before it passes this check`);
    else if (story.size !== 'S' && story.size !== 'M') errors.push(`${story.id}: size "${story.size}" is not S, M or L`);
    if (!story.exists) errors.push(`${story.id}: no "exists:" verdict (have, unlock, port or build)`);
    else if (!EXISTS_VERDICTS.includes(story.exists)) errors.push(`${story.id}: "exists: ${story.exists}" is not have, unlock, port or build`);
    if (!story.doneWhen) errors.push(`${story.id}: no "done_when:" text`);
    else if (PLACEHOLDER_DONE_WHEN.test(story.doneWhen)) errors.push(`${story.id}: "done_when: ${story.doneWhen}" names no check a person or a command can run`);
    for (const dep of story.dependsOn) if (!seen.has(dep)) errors.push(`${story.id}: depends_on "${dep}" is not an earlier story in this breakdown`);
    if (opts.ranked && !story.rice) errors.push(`${story.id}: no "rice:" (R=.. I=.. C=.. E=..); rank every story before the plan gate`);
    seen.add(story.id);
  }
  return { file, errors };
}

// ---- on_done: { queue } -----------------------------------------------------------------------

function writePage(projectDir: string, path: string, data: Record<string, unknown>, body: string): void {
  const file = join(projectDir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `---\n${stringifyYaml(data)}---\n\n${body}\n`);
}

function epicBody(breakdown: ShapeBreakdown, stories: { story: ShapeStory; card: Card }[]): string {
  const rows = stories.map(({ story, card }) => `| ${story.id} | ${story.size ?? ''} | ${story.exists ?? ''}${story.existsPath ? ` ${story.existsPath}` : ''} | ${story.doneWhen ?? ''} | ${card.stage} |`);
  const later = breakdown.later.length ? ['', '## Later', '', ...breakdown.later.map(l => `- ${l}`)] : [];
  return [`hypothesis: ${breakdown.hypothesis ?? ''}`, `metric: ${breakdown.metric ?? ''}`, '', '| Story | Size | exists | done_when | state |', '|---|---|---|---|---|', ...rows, ...later].join('\n');
}

// Placeholder: the shape workflow has no initiative of its own (docs/plans/codeloop/2026-10-09-shape-workflow.md
// does not name one), and EpicSchema.initiative is required. "shape" satisfies the schema without
// implying a real initiative page exists; nothing reads it as one.
const SHAPE_INITIATIVE = 'shape';

export interface QueuedStory {
  story: ShapeStory;
  card: Card;
  /** False for the one story that started in the lane's first stage; true for every story waiting on `after`. */
  queued: boolean;
}

export interface QueueResult {
  epicSlug: string;
  epicPath: string;
  featurePaths: string[];
  stories: QueuedStory[];
}

/**
 * Called from `advanceCard`'s on_done handling once the shape card's rank stage is approved and
 * written: reads `shape/{id}/breakdown.md`, writes the epic page (and any new feature pages), and
 * creates one `targetLane` story per breakdown line. Runs as its own read-modify-write (separate
 * from the write that just marked the shape card done), so a crash between the two leaves the shape
 * card done with no stories queued yet rather than risking a lost write on cards.json's version.
 */
export function queueBreakdown(projectDir: string, shapeCardId: string, targetLane: string, now: Date): QueueResult {
  const shapeCard = findCard(readCards(projectDir).cards, shapeCardId);
  const dir = resolveSpecDir(projectDir, shapeCard.id);
  const file = join(projectDir, dir, 'breakdown.md');
  if (!existsSync(file)) throw new RefusalError(`${dir}/breakdown.md is missing; the rank stage should have written it`);
  const breakdown = parseBreakdown(readFileSync(file, 'utf-8'));
  if (breakdown.stories.length === 0) throw new RefusalError(`${dir}/breakdown.md has no stories to queue`);

  const lane = loadLane(projectDir, targetLane);
  const usesSpecFolder = lane.stages.some(s => `${s.output ?? ''} ${s.done?.cmd ?? ''}`.includes('{spec}') || s.done?.cmd?.includes('codeloop spec check'));
  const epicSlug = slugify(breakdown.title || shapeCard.title);

  const queued: QueuedStory[] = [];
  let previous: Card | undefined;
  for (const [index, story] of breakdown.stories.entries()) {
    const feature = story.feature ?? breakdown.feature;
    const fields = {
      size: (story.size as Size | undefined) ?? 'M',
      metric: breakdown.metric,
      done_when: story.doneWhen,
      split_from: shapeCard.id,
      epic: epicSlug,
      ...(feature ? { feature } : {}),
      ...(previous ? { after: previous.id } : {}),
    };
    let card: Card;
    let isQueued: boolean;
    if (index === 0) {
      // The first story starts like any `codeloop start`: subject to the lane's wip. If wip
      // refuses it, it waits queued with no `after`, so it is ready the moment wip opens up.
      try {
        card = createCard(projectDir, { lane: targetLane, title: story.title, now, fields });
        isQueued = false;
      } catch (e) {
        if (!(e instanceof RefusalError)) throw e;
        card = queueCard(projectDir, { lane: targetLane, title: story.title, now, fields });
        isQueued = true;
      }
    } else {
      // Every later story waits on the one before it, whatever wip allows: the owner approved this
      // order, and running two stories of the same epic out of order is not what they approved.
      card = queueCard(projectDir, { lane: targetLane, title: story.title, now, fields });
      isQueued = true;
    }
    if (usesSpecFolder) newSpec(projectDir, card.id);
    card = findCard(readCards(projectDir).cards, card.id);
    queued.push({ story, card, queued: isQueued });
    previous = card;
  }

  const epicPath = `${EPICS_DIR}/${epicSlug}.md`;
  writePage(projectDir, epicPath, { id: epicSlug, title: breakdown.title || shapeCard.title, initiative: SHAPE_INITIATIVE, status: 'active' }, epicBody(breakdown, queued));

  const featureSlugs = new Set([...(breakdown.feature ? [breakdown.feature] : []), ...breakdown.stories.flatMap(s => (s.feature ? [s.feature] : []))]);
  const featurePaths: string[] = [];
  for (const slug of featureSlugs) {
    const path = `${FEATURES_DIR}/${slug}.md`;
    if (existsSync(join(projectDir, path))) continue;
    writePage(projectDir, path, { id: slug, title: slug, initiative: SHAPE_INITIATIVE, epic: epicSlug }, `Named by the ${shapeCard.id} breakdown; no description yet.`);
    featurePaths.push(path);
  }

  for (const { story, card } of queued) {
    recordEvent(projectDir, shapeCard.id, () => ({ action: 'queued', note: `${story.id} as ${card.id} (${card.stage})` }), now);
  }

  return { epicSlug, epicPath, featurePaths, stories: queued };
}
