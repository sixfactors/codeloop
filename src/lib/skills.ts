import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join, relative, resolve } from 'path';
import { parse as parseYaml, stringify } from 'yaml';
import { SKILLS_INDEX, type Lane, type SkillEntry } from './lane.js';
import { withLock } from './lock.js';

export function defaultSkillDirs(projectDir: string): string[] {
  return [
    join(projectDir, '.claude/skills'),
    join(projectDir, '.claude/commands'),
    join(projectDir, '.cursor/commands'),
    join(projectDir, '.agents/skills'),
    join(homedir(), '.claude/skills'),
    join(homedir(), '.claude/commands'),
  ];
}

export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  try {
    return { data: (parseYaml(m[1]) ?? {}) as Record<string, unknown>, body: m[2] };
  } catch {
    // Command frontmatter in the wild is not always valid YAML (unquoted colons in descriptions).
    const data: Record<string, unknown> = {};
    for (const line of m[1].split('\n')) {
      const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line);
      if (kv) data[kv[1]] = kv[2];
    }
    return { data, body: m[2] };
  }
}

function entry(projectDir: string, file: string, kind: SkillEntry['kind'], fallbackName: string): SkillEntry {
  const { data } = parseFrontmatter(readFileSync(file, 'utf-8'));
  const inProject = !relative(projectDir, file).startsWith('..');
  return {
    name: typeof data.name === 'string' && data.name ? data.name : fallbackName,
    source: inProject ? relative(projectDir, file) : file,
    kind,
    description: typeof data.description === 'string' ? data.description.trim() : '',
  };
}

const isDir = (p: string) => statSync(p).isDirectory();

/** `<name>/SKILL.md` is a skill; `*.md` is a command; `<group>/*.md` is the command `group:name`. */
export function scanSkills(projectDir: string, dirs: string[]): SkillEntry[] {
  const found: SkillEntry[] = [];
  for (const dir of dirs.map(d => resolve(projectDir, d))) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (name.endsWith('.md') && !isDir(path)) {
        found.push(entry(projectDir, path, 'command', basename(name, '.md')));
      } else if (isDir(path) && existsSync(join(path, 'SKILL.md'))) {
        found.push(entry(projectDir, join(path, 'SKILL.md'), 'skill', name));
      } else if (isDir(path)) {
        for (const sub of readdirSync(path).filter(f => f.endsWith('.md')).sort()) {
          found.push(entry(projectDir, join(path, sub), 'command', `${name}:${basename(sub, '.md')}`));
        }
      }
    }
  }
  return found;
}

export function writeSkillsIndex(projectDir: string, entries: SkillEntry[]): void {
  const file = join(projectDir, SKILLS_INDEX);
  withLock(file, () => writeFileSync(file, stringify(entries)));
}

/** Writes the index only when there is none: an existing one may hold entries from `adopt --from`. */
export function ensureSkillsIndex(projectDir: string, scan: () => SkillEntry[]): void {
  const file = join(projectDir, SKILLS_INDEX);
  withLock(file, () => {
    if (!existsSync(file)) writeFileSync(file, stringify(scan()));
  });
}

export function duplicateSkills(entries: SkillEntry[]): { name: string; sources: string[] }[] {
  const byName = new Map<string, string[]>();
  for (const e of entries) byName.set(e.name, [...(byName.get(e.name) ?? []), e.source]);
  return [...byName].filter(([, sources]) => sources.length > 1).map(([name, sources]) => ({ name, sources }));
}

export function doneGaps(lanes: Lane[]): { lane: string; stage: string; reason: string }[] {
  return lanes.flatMap(lane =>
    lane.stages
      .filter(s => !s.done?.cmd)
      .map(s => ({ lane: lane.id, stage: s.id, reason: s.done?.event ? `done is only the event "${s.done.event}"` : 'no done check' })),
  );
}
