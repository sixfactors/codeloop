import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { RefusalError, safeName } from './cards.js';
import { cronError } from './cron.js';

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
}

export interface Lane {
  id: string;
  version: number;
  metric: { name: string; source: string; target?: string };
  trigger?: { on?: string; lane?: string; cron?: string; manual?: boolean };
  wip?: number;
  retries: number;
  stages: Stage[];
  on_done?: { start?: string };
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
 * card's spec folder, `specs/{nnn}` when the card has none recorded.
 */
export function substitute(template: string, card: string | { id: string; key?: string; spec?: string }, opts: { shell?: boolean } = {}): string {
  const { id, spec, key } = typeof card === 'string' ? { id: card, spec: undefined, key: undefined } : card;
  // A card that shares its number with another one is keyed by its full id instead.
  const nnn = key ?? cardNumber(id);
  const value = opts.shell ? shellQuote : (v: string) => v;
  return template.replaceAll('{id}', value(id)).replaceAll('{nnn}', value(nnn)).replaceAll('{spec}', value(spec ?? `specs/${nnn}`));
}

/**
 * A value made only of path-safe characters is passed through, so `{spec}/research.md` still reads
 * as one path. Anything else is single-quoted: it reaches the command as text and is never parsed.
 */
export function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}
