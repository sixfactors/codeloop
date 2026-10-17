import { folderIn, layout, layoutOfSpec } from './paths.js';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { inLane, readCards, RefusalError, safeName } from './cards.js';
import { cronError } from './cron.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LANE_TEMPLATES_DIR = join(PACKAGE_ROOT, 'templates/lanes');

export type Approver = 'owner' | 'reviewer';

export interface Gate {
  name: string;
  approver: Approver;
  outward?: boolean;
}

export interface Stage {
  id: string;
  skill?: string;
  role?: string | string[];
  output?: string;
  done?: { cmd?: string; event?: string };
  gate?: Gate;
  notes?: string[];
  /** A size comparison like `size >= S`; the stage is skipped for a card it does not hold for. */
  when?: string;
  /** A second agent judges the stage's output against its rubric before the check; `codeloop check rubric` then needs `{spec}/review-<stage>.md` with `verdict: accept`. */
  review?: { agent: string; skill?: string };
  /** Consecutive stages with the same `carry` group run in one agent turn; each keeps its own check and events. A gate may sit only on the group's last stage. */
  carry?: string;
  /** A later stage whose brief and gate this stage takes on for a card that skips it (verify takes review's for an S story). */
  fold?: string;
}

export interface Lane {
  id: string;
  version: number;
  metric: { name: string; source: string; target?: string };
  trigger?: { on?: string; lane?: string; cron?: string; manual?: boolean };
  wip?: number;
  retries: number;
  /** The agent preset (a key under `agents:` in config.yaml) this lane's stages run on, when `run --agent`/`card run` names none itself. Falls back to `agents.default` with no error when this preset is not configured. */
  agent?: string;
  stages: Stage[];
  /** `start`: a simple follow-on card in another lane. `queue`: a shape breakdown's epic of stories (see src/lib/shape.ts). Both opt-in via `lanes.auto_start`, except `queue`, which always runs: the owner already approved the exact list of stories it makes. */
  on_done?: { start?: string; queue?: string };
}

export interface SkillEntry {
  name: string;
  source: string;
  kind: 'skill' | 'command';
  description: string;
}

export const LANES_DIR = '.codeloop/lanes';
export const SKILLS_INDEX = '.codeloop/skills.index.yaml';
const DEFAULT_RETRIES = 3;
const TRIGGER_EVENTS = ['lane.done', 'git.commit', 'git.tag'];

export function lanePath(projectDir: string, id: string): string {
  return join(projectDir, LANES_DIR, `${safeName(id, 'lane id')}.yaml`);
}

export function parseLane(text: string): Lane {
  const raw = parseYaml(text) ?? {};
  return { ...raw, retries: raw.retries ?? DEFAULT_RETRIES, stages: raw.stages ?? [] } as Lane;
}

export function loadLane(projectDir: string, id: string): Lane {
  const file = lanePath(projectDir, id);
  if (!existsSync(file)) throw new RefusalError(`lane "${id}" not found at ${LANES_DIR}/${id}.yaml`);
  return parseLane(readFileSync(file, 'utf-8'));
}

export function loadLanes(projectDir: string): Lane[] {
  const dir = join(projectDir, LANES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.yaml'))
    .sort()
    .map(f => parseLane(readFileSync(join(dir, f), 'utf-8')));
}

/** null when no index has been written yet, so lint can skip the skill check. */
export function loadSkillsIndex(projectDir: string): SkillEntry[] | null {
  const file = join(projectDir, SKILLS_INDEX);
  if (!existsSync(file)) return null;
  return (parseYaml(readFileSync(file, 'utf-8')) ?? []) as SkillEntry[];
}

const SIZE_ORDER = ['trivial', 'S', 'M', 'L'];
const WHEN = /^\s*size\s*(>=|<=|==|>|<)\s*(trivial|S|M|L)\s*$/;

/** Why a `when:` expression cannot be read, or undefined. */
export function whenError(when: string): string | undefined {
  return WHEN.test(when) ? undefined : `when "${when}" is not a size comparison like \`size >= S\` (sizes: ${SIZE_ORDER.join(', ')})`;
}

/** Whether a stage runs for the card. A card with no size counts as M, as the diff budget does. */
export function stageApplies(stage: Stage, card: { size?: string }): boolean {
  if (!stage.when) return true;
  const m = WHEN.exec(stage.when);
  if (!m) return true;
  const have = SIZE_ORDER.indexOf(card.size ?? 'M');
  const want = SIZE_ORDER.indexOf(m[2]);
  return { '>=': have >= want, '<=': have <= want, '==': have === want, '>': have > want, '<': have < want }[m[1]]!;
}

/** The first stage of the lane that runs for the card. */
export function firstStage(lane: Lane, card: { size?: string }): Stage {
  return lane.stages.find(s => stageApplies(s, card)) ?? lane.stages[0];
}

/** The stages between `from` (exclusive; undefined for the lane's start) and `to` (exclusive; undefined for the end) that the card skips. */
export function skippedStages(lane: Lane, from: Stage | undefined, to: Stage | undefined, card: { size?: string }): Stage[] {
  const start = from ? lane.stages.indexOf(from) + 1 : 0;
  const end = to ? lane.stages.indexOf(to) : lane.stages.length;
  return lane.stages.slice(start, end).filter(s => !stageApplies(s, card));
}

/** Why the card skips a stage, as the event note says it. */
export function skipReason(stage: Stage, card: { size?: string }): string {
  return `size ${card.size ?? 'M'}: the stage runs only when ${stage.when}`;
}

/**
 * The stages one agent turn carries from `stage`: that stage, then the following stages of its
 * `carry` group that run for the card, ending at the first one with a gate. A stage with no carry
 * group is carried alone.
 */
export function carriedStages(lane: Lane, stage: Stage, card: { size?: string }): Stage[] {
  const out = [stage];
  if (!stage.carry || stage.gate) return out;
  for (const next of lane.stages.slice(lane.stages.indexOf(stage) + 1)) {
    if (next.carry !== stage.carry) break;
    if (!stageApplies(next, card)) continue;
    out.push(next);
    if (next.gate) break;
  }
  return out;
}

/** The stage `stage` folds in for this card: its `fold` target when the card skips that stage, else undefined. */
export function foldedStage(lane: Lane, stage: Stage, card: { size?: string }): Stage | undefined {
  const target = stage.fold ? lane.stages.find(s => s.id === stage.fold) : undefined;
  return target && !stageApplies(target, card) ? target : undefined;
}

/** The stage after `stage` that runs for the card, or undefined at the end of the lane. */
export function nextStage(lane: Lane, stage: Stage, card: { size?: string }): Stage | undefined {
  return lane.stages.slice(lane.stages.indexOf(stage) + 1).find(s => stageApplies(s, card));
}

export function lintLane(lane: Lane, skills: SkillEntry[] | null = null): string[] {
  const errors: string[] = [];
  const where = `lane ${lane.id ?? '(no id)'}`;
  if (!lane.id) errors.push(`${where}: missing id`);
  if (!Number.isInteger(lane.version)) errors.push(`${where}: version must be an integer`);
  if (!lane.metric?.name || !lane.metric?.source) errors.push(`${where}: missing metric (name and source)`);
  if (lane.trigger?.cron) {
    const err = cronError(lane.trigger.cron);
    if (err) errors.push(`${where}: ${err}`);
  }
  const on = lane.trigger?.on;
  if (on && !TRIGGER_EVENTS.includes(on)) errors.push(`${where}: trigger.on "${on}" never fires (use ${TRIGGER_EVENTS.join(', ')})`);
  if (on === 'lane.done' && !lane.trigger?.lane) errors.push(`${where}: trigger on lane.done needs \`lane:\` naming the lane it follows`);
  if (lane.stages.length === 0) errors.push(`${where}: no stages`);

  const known = skills ? new Set(skills.map(s => s.name)) : null;
  const seen = new Set<string>();
  for (const stage of lane.stages) {
    const at = `${where} stage ${stage.id ?? '(no id)'}`;
    if (!stage.id) errors.push(`${at}: missing id`);
    else if (seen.has(stage.id)) errors.push(`${at}: duplicate stage id`);
    seen.add(stage.id);
    if (!stage.done?.cmd && !stage.done?.event) errors.push(`${at}: no done check (cmd or event)`);
    if (stage.gate) {
      if (!stage.gate.name) errors.push(`${at}: gate has no name`);
      if (stage.gate.approver !== 'owner' && stage.gate.approver !== 'reviewer') {
        errors.push(`${at}: gate has no approver (owner or reviewer)`);
      }
    }
    if (stage.when) {
      const err = whenError(stage.when);
      if (err) errors.push(`${at}: ${err}`);
    }
    if (stage.carry) {
      const at = lane.stages.indexOf(stage);
      const group = lane.stages.map((s, i) => (s.carry === stage.carry ? i : -1)).filter(i => i >= 0);
      if (group[0] === at && group.some((i, n) => n > 0 && i !== group[n - 1] + 1)) errors.push(`${where} carry ${stage.carry}: its stages are not consecutive (${group.map(i => lane.stages[i].id).join(', ')})`);
      if (stage.gate && group.some(i => i > at)) errors.push(`${where} carry ${stage.carry}: stage ${stage.id} has gate ${stage.gate.name}, so the carry would run past it; end the group at ${stage.id}`);
    }
    if (stage.fold && !lane.stages.slice(lane.stages.indexOf(stage) + 1).some(s => s.id === stage.fold)) errors.push(`${at}: fold names "${stage.fold}", which is not a later stage of the lane`);
    if (stage.review && !stage.review.agent) errors.push(`${at}: review has no agent (a preset under agents: in .codeloop/config.yaml)`);
    if (known && stage.skill && !known.has(stage.skill)) {
      errors.push(`${at}: skill "${stage.skill}" is not in ${SKILLS_INDEX}`);
    }
  }
  return errors;
}

export function cardNumber(cardId: string): string {
  return cardId.replace(/\D/g, '').padStart(3, '0');
}

/**
 * `{id}` is the card id; `{nnn}` is its digits zero-padded to 3 (c-7 → 007); `{spec}` is the
 * card's spec folder, `<specs>/{nnn}` when the card has none recorded; `{evidence}`, `{usecases}` and
 * `{shape}` are the card's evidence, use-case and shape folders, `{artifacts}` the artifacts folder. The folders follow the project's `store.layout`
 * (paths.ts): pass `projectDir`, or the layout is read from the card's own spec path.
 */
export function substitute(template: string, card: string | { id: string; key?: string; spec?: string }, opts: { shell?: boolean; projectDir?: string } = {}): string {
  const { id, spec, key } = typeof card === 'string' ? { id: card, spec: undefined, key: undefined } : card;
  // A card that shares its number with another one is keyed by its full id instead.
  const nnn = key ?? cardNumber(id);
  const value = opts.shell ? shellQuote : (v: string) => v;
  const which = opts.projectDir ? layout(opts.projectDir) : layoutOfSpec(spec);
  return template
    .replaceAll('{id}', value(id))
    .replaceAll('{nnn}', value(nnn))
    .replaceAll('{spec}', value(spec ?? `${folderIn(which, 'specs')}/${nnn}`))
    .replaceAll('{evidence}', value(`${folderIn(which, 'evidence')}/${nnn}`))
    .replaceAll('{usecases}', value(`${folderIn(which, 'usecases')}/${nnn}`))
    .replaceAll('{shape}', value(`${folderIn(which, 'shape')}/${id}`))
    .replaceAll('{artifacts}', value(folderIn(which, 'artifacts')));
}

/**
 * A value made only of path-safe characters is passed through, so `{spec}/research.md` still reads
 * as one path. Anything else is single-quoted: it reaches the command as text and is never parsed.
 */
export function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Template lane filenames under `templates/lanes/`. */
export function templateLaneFiles(): string[] {
  if (!existsSync(LANE_TEMPLATES_DIR)) return [];
  return readdirSync(LANE_TEMPLATES_DIR).filter(f => f.endsWith('.yaml')).sort();
}

export function templateLanePath(id: string): string {
  return join(LANE_TEMPLATES_DIR, `${safeName(id, 'lane id')}.yaml`);
}

export interface LaneRefreshResult {
  id: string;
  from: number;
  to: number;
  keptWip?: number;
  addedStages: string[];
}

/**
 * Replace an installed lane with the shipped template. Refuses when any card in the lane sits on a
 * stage the template does not have (so refresh never strands work). Bumps `version`. When workable
 * cards already exceed the template's `wip`, keeps the installed `wip` so new starts are not
 * refused until room opens.
 */
export function refreshLane(projectDir: string, id: string): LaneRefreshResult {
  const templateFile = templateLanePath(id);
  if (!existsSync(templateFile)) throw new RefusalError(`no template lane "${id}" at templates/lanes/${id}.yaml`);
  const installedFile = lanePath(projectDir, id);
  if (!existsSync(installedFile)) throw new RefusalError(`lane "${id}" is not installed; run \`codeloop update\` to copy missing lanes`);

  const templateText = readFileSync(templateFile, 'utf-8');
  const template = parseLane(templateText);
  const installed = loadLane(projectDir, id);
  const stageIds = new Set(template.stages.map(s => s.id));
  const stranded = readCards(projectDir).cards.filter(c => c.lane === id && inLane(c) && !stageIds.has(c.stage));
  if (stranded.length) {
    const list = stranded.map(c => `${c.id} (${c.stage})`).join(', ');
    throw new RefusalError(
      `lane ${id}: cannot refresh; ${stranded.length} card${stranded.length === 1 ? '' : 's'} on stage${stranded.length === 1 ? '' : 's'} the template does not have: ${list}`,
    );
  }

  const to = installed.version + 1;
  let text = templateText.replace(/^version:\s*\d+\s*$/m, `version: ${to}`);
  if (!/^version:\s*\d+\s*$/m.test(templateText)) {
    throw new RefusalError(`templates/lanes/${id}.yaml has no version: line to bump`);
  }

  // Same rule as engine.workable: in the lane and not waiting on a person.
  const workableCount = readCards(projectDir).cards.filter(c => c.lane === id && inLane(c) && !c.gate).length;
  let keptWip: number | undefined;
  if (template.wip !== undefined && workableCount > template.wip && installed.wip !== undefined) {
    keptWip = installed.wip;
    if (/^wip:\s*\d+\s*$/m.test(text)) {
      text = text.replace(/^wip:\s*\d+\s*$/m, `wip: ${keptWip}`);
    } else {
      text = text.replace(/^(version:\s*\d+\s*)$/m, `$1\nwip: ${keptWip}`);
    }
  }

  writeFileSync(installedFile, text.endsWith('\n') ? text : `${text}\n`);
  const addedStages = template.stages.map(s => s.id).filter(s => !installed.stages.some(i => i.id === s));
  return { id, from: installed.version, to, ...(keptWip === undefined ? {} : { keptWip }), addedStages };
}

/**
 * Copy a template lane that is not yet installed. Does not overwrite an existing file.
 * Returns the destination path when copied, or undefined when it was already there.
 */
export function installMissingLane(projectDir: string, filename: string): string | undefined {
  const dest = join(projectDir, LANES_DIR, filename);
  if (existsSync(dest)) return undefined;
  const src = join(LANE_TEMPLATES_DIR, filename);
  if (!existsSync(src)) throw new RefusalError(`no template at templates/lanes/${filename}`);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return dest;
}

/** Installed lanes whose stage ids or done checks differ from the template. */
export function laneDrift(projectDir: string): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const file of templateLaneFiles()) {
    const id = file.replace(/\.yaml$/, '');
    const dest = join(projectDir, LANES_DIR, file);
    if (!existsSync(dest)) {
      out.push({ id, reason: 'not installed' });
      continue;
    }
    const installed = loadLane(projectDir, id);
    const template = parseLane(readFileSync(join(LANE_TEMPLATES_DIR, file), 'utf-8'));
    const instStages = installed.stages.map(s => s.id).join(',');
    const tmplStages = template.stages.map(s => s.id).join(',');
    if (instStages !== tmplStages) {
      out.push({ id, reason: `stages ${instStages} vs template ${tmplStages}` });
      continue;
    }
    for (const stage of template.stages) {
      const mine = installed.stages.find(s => s.id === stage.id);
      if (!mine) continue;
      const a = mine.done?.cmd ?? mine.done?.event ?? '';
      const b = stage.done?.cmd ?? stage.done?.event ?? '';
      if (a !== b) {
        out.push({ id, reason: `stage ${stage.id} done check differs` });
        break;
      }
    }
  }
  return out;
}
