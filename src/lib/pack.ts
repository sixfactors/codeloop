import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { RefusalError } from './engine.js';
import { loadLanes, loadSkillsIndex, SKILLS_INDEX, type Lane } from './lane.js';
import { parseFrontmatter } from './skills.js';

interface PackSkill {
  skillId: string;
  title: string;
  description: string;
  content: string;
  toolDeps: string[];
}

// The Protobox manifest validator requires lower_snake skill ids.
export function skillIdFor(name: string): string {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new RefusalError(`skill name "${name}" does not yield a lower_snake skillId`);
  return id;
}

function titleFor(name: string, title: unknown, body: string): string {
  if (typeof title === 'string' && title.trim()) return title.trim();
  const h1 = /^#\s+(.+?)\s*$/m.exec(body);
  if (h1) return h1[1].trim();
  return name.split(/[-_:]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function guide(lanes: Lane[]): string {
  const lines = ['# Codeloop guide', '', 'Each lane moves a card through its stages in order. A stage runs the named skill and is finished when its done check passes; a gate waits for a person. A gate on a public step is asked first: approve before the stage runs. Other gates are approved after the check passes.', ''];
  for (const lane of lanes) {
    lines.push(`## ${lane.id} (v${lane.version})`, '', '| Stage | Skill | Output | Done check | Gate |', '|---|---|---|---|---|');
    for (const s of lane.stages) {
      const who = s.skill ? skillIdFor(s.skill) : [s.role ?? ''].flat().join(', ');
      const gate = s.gate ? `${s.gate.name} (${s.gate.approver}, ${s.gate.outward ? 'public step: approve before the stage runs' : 'approve after the check passes'})` : '';
      lines.push(`| ${s.id} | ${who} | ${s.output ?? ''} | ${(s.done?.cmd ?? s.done?.event ?? '').replace(/\|/g, '\\|')} | ${gate} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function buildPack(projectDir: string, version = '1.0.0') {
  const lanes = loadLanes(projectDir);
  if (lanes.length === 0) throw new RefusalError('no lanes found; nothing to pack');
  const index = loadSkillsIndex(projectDir);
  if (!index) throw new RefusalError(`${SKILLS_INDEX} not found; run \`codeloop adopt\` first`);

  const names = [...new Set(lanes.flatMap(l => l.stages.map(s => s.skill).filter((s): s is string => !!s)))].sort();
  const missing = names.filter(n => !index.some(e => e.name === n));
  if (missing.length) throw new RefusalError(`lanes reference skills that are not in ${SKILLS_INDEX}: ${missing.join(', ')}`);

  const skills: PackSkill[] = names.map(name => {
    const found = index.find(e => e.name === name)!;
    const file = resolve(projectDir, found.source);
    if (!existsSync(file)) throw new RefusalError(`skill ${name}: source ${found.source} no longer exists; re-run \`codeloop adopt\``);
    const { data, body } = parseFrontmatter(readFileSync(file, 'utf-8'));
    const title = titleFor(name, data.title, body);
    return { skillId: skillIdFor(name), title, description: found.description || title || `${name} skill`, content: body.trim(), toolDeps: [] };
  });
  skills.push({
    skillId: 'codeloop_guide',
    title: 'Codeloop guide',
    description: 'Which lane runs which skill at which stage, what each stage must produce, and how it is checked.',
    content: guide(lanes),
    toolDeps: [],
  });

  const hash = createHash('sha256');
  for (const s of skills) hash.update(s.skillId).update('\0').update(s.content).update('\0');

  return {
    id: 'codeloop',
    version,
    'x-source-sha256': hash.digest('hex'),
    // 'platform' with no platform block is the manifest validator's skills-only case.
    kind: 'platform',
    display: { name: 'Codeloop', description: 'Lanes for building, shipping and marketing, with the skills each stage runs.' },
    auth: [{ type: 'none' }],
    availability: 'available',
    skills,
  };
}
