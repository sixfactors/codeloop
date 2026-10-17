import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadLanes, loadSkillsIndex, type Lane, type SkillEntry, type Stage } from './lane.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export type Host = 'claude' | 'cursor' | 'codex';
export const HOSTS: Host[] = ['claude', 'cursor', 'codex'];
const START = '<!-- codeloop:start -->';
const END = '<!-- codeloop:end -->';

const who = (stage: Stage) => stage.skill ?? [stage.role ?? ''].flat().join(', ');
const gateText = (stage: Stage) =>
  !stage.gate ? '' : stage.gate.outward ? `${stage.gate.name} (${stage.gate.approver}, before the stage runs)` : `${stage.gate.name} (${stage.gate.approver}, after the check passes)`;

function stageSteps(lane: Lane, stage: Stage, skills: SkillEntry[]): string[] {
  const skill = skills.find(s => s.name === stage.skill);
  const steps = [
    '1. Run `codeloop card show <id>`. It prints the output path, the done check, the stage notes and any earlier rejection notes. Follow those over anything remembered.',
    '2. Run `codeloop wiki inject --files <files you expect to touch>` and read every page it prints.',
    stage.skill
      ? `3. Do the work with the \`${stage.skill}\` skill${skill ? ` (${skill.source})` : ''}.${skill?.description ? ` ${skill.description}` : ''}`
      : `3. Do the work for the \`${stage.id}\` stage${who(stage) ? ` as ${who(stage)}` : ''}.`,
    stage.output ? `4. Write the result to \`${stage.output}\`.` : '4. Keep the change inside what the card asks for.',
    `5. Run \`codeloop card advance <id>\`. It runs \`${stage.done?.cmd ?? `event ${stage.done?.event}`}\`. If it exits 2, read the output, fix the work and run it again. Stop after ${lane.retries} failures: the card parks as stuck for the owner.`,
  ];
  if (stage.gate?.outward) steps.unshift(`0. This stage changes something public. The card waits at gate \`${stage.gate.name}\` as it enters. Do nothing until a person has approved it.`);
  else if (stage.gate) steps.push(`6. The card then waits at gate \`${stage.gate.name}\` for the ${stage.gate.approver}. Stop there. Never run \`codeloop approve\` yourself.`);
  return steps;
}

function laneTable(lane: Lane): string[] {
  return ['| Stage | Skill | Output | Done check | Gate |', '|---|---|---|---|---|', ...lane.stages.map(s => `| ${s.id} | ${who(s)} | ${s.output ?? ''} | \`${(s.done?.cmd ?? `event ${s.done?.event}`).replace(/\|/g, '\\|')}\` | ${gateText(s)} |`)];
}

function laneBody(lane: Lane, skills: SkillEntry[]): string {
  const lines = [`# codeloop lane: ${lane.id} (v${lane.version})`, '', 'Run `codeloop card show <id>` first; the card says which stage it is in. Gates are approved only by a person.', '', ...laneTable(lane), ''];
  for (const stage of lane.stages) lines.push(`## ${stage.id}`, '', ...stageSteps(lane, stage, skills), '');
  return lines.join('\n');
}

const ORCH_DESCRIPTION = 'Run this board as the codeloop orchestrator, reviewing every story before each pick, then brief, gate and report.';
const orchText = () => readFileSync(join(PACKAGE_ROOT, 'templates/orch/orch.md'), 'utf-8');

/** The orchestrator protocol, as each host takes a command: /orch in Claude Code and Cursor, a skill in Codex. */
function orchFiles(host: Host): Record<string, string> {
  const body = orchText();
  // Cursor reads the same command file as Claude Code (see scaffold.ts).
  const command = `---\ndescription: ${ORCH_DESCRIPTION}\n---\n\n${body}`;
  if (host === 'claude') return { '.claude/commands/orch.md': command };
  if (host === 'cursor') return { '.cursor/commands/orch.md': command };
  return { '.agents/skills/codeloop-orch/SKILL.md': `---\nname: codeloop-orch\ndescription: ${ORCH_DESCRIPTION}\n---\n\n${body}` };
}

function files(lanes: Lane[], skills: SkillEntry[], host: Host): Record<string, string> {
  const out: Record<string, string> = orchFiles(host);
  for (const lane of lanes) {
    const description = `Work a codeloop card through the ${lane.id} lane: ${lane.stages.map(s => s.id).join(', ')}.`;
    if (host === 'claude') {
      for (const stage of lane.stages) {
        const name = `codeloop-${lane.id}-${stage.id}`;
        out[`.claude/agents/${name}.md`] = `---\nname: ${name}\ndescription: Run the ${stage.id} stage of the ${lane.id} lane for one codeloop card${stage.skill ? `, using the ${stage.skill} skill` : ''}.\n---\n\n# ${lane.id} / ${stage.id}\n\n${stageSteps(lane, stage, skills).join('\n')}\n`;
      }
    } else if (host === 'cursor') {
      out[`.cursor/rules/codeloop-${lane.id}.mdc`] = `---\ndescription: ${description}\nalwaysApply: false\n---\n\n${laneBody(lane, skills)}`;
    } else {
      out[`.agents/skills/codeloop-${lane.id}/SKILL.md`] = `---\nname: codeloop-${lane.id}\ndescription: ${description}\n---\n\n${laneBody(lane, skills)}`;
    }
  }
  return out;
}

/**
 * `templates/protocol.md` as is: the same text for every host's marked block and in every worktree.
 * Anything per tree or per session (the active card) is printed by the session-start hook instead,
 * since these files are tracked and a per-tree line kept every worktree dirty.
 */
function protocolText(_projectDir: string): string {
  return readFileSync(join(PACKAGE_ROOT, 'templates/protocol.md'), 'utf-8');
}

function markedBlock(body: string): string {
  return [START, body.trim(), END].join('\n');
}

/** Replaces the text between `<!-- codeloop:start -->` and `<!-- codeloop:end -->`, appending the block when the file has none. Text outside the markers is kept. */
function applyMarkedBlock(current: string, block: string): string {
  const [start, end] = [current.indexOf(START), current.indexOf(END)];
  if (start >= 0 && end > start) return current.slice(0, start) + block + current.slice(end + END.length);
  return `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}\n`;
}

function agentsBlock(lanes: Lane[], protocol: string): string {
  const lines = [protocol, '', '## codeloop lanes', '', '- Run `codeloop card show <id>` first. It names the stage, the skill, the output path and the done check.', '- Move a card only with `codeloop card advance <id>`. Never edit `.codeloop/cards.json` or a lane file.', '- Gates are approved only by a person. Stop when a card parks.', '- Run `codeloop wiki inject --files <paths>` before changing files.', ''];
  for (const lane of lanes) lines.push(`### ${lane.id}`, '', ...laneTable(lane), '');
  return markedBlock(lines.join('\n'));
}

// Files written whole (role files, rules, skills, orch commands) end with a stamp of what render
// wrote. A file whose text no longer matches its stamp, or that has none, was edited by hand.
const STAMP = /\n<!-- codeloop:rendered ([0-9a-f]{12}) -->\n$/;
const digest = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 12);
const stamped = (text: string) => {
  const body = text.endsWith('\n') ? text : `${text}\n`;
  return `${body}\n<!-- codeloop:rendered ${digest(body)} -->\n`;
};

/** True when the file on disk is render's own output, untouched since, so it is safe to replace. */
function asRendered(current: string, body: string): boolean {
  const m = STAMP.exec(current);
  if (m) return digest(current.slice(0, m.index)) === m[1];
  // A file from before the stamp is replaced only when it already says what render would write.
  return current.trimEnd() === body.trimEnd();
}

function readIfExists(file: string): string {
  return existsSync(file) ? readFileSync(file, 'utf-8') : '';
}

/**
 * Writes only when content differs, so a second run changes nothing. Text outside each file's
 * markers is kept. A file written whole that was edited since the last render is listed in `kept`
 * and left alone unless `force`.
 */
export function render(projectDir: string, hosts: Host[], opts: { force?: boolean } = {}): { written: string[]; unchanged: string[]; kept: string[] } {
  const lanes = loadLanes(projectDir);
  const skills = loadSkillsIndex(projectDir) ?? [];
  const out: Record<string, string> = Object.assign({}, ...hosts.map(h => files(lanes, skills, h)));

  const protocol = protocolText(projectDir);
  const protocolBlock = markedBlock(protocol);

  // AGENTS.md is read by Codex and most other agents, so it is always written. The rest follow the
  // hosts rendered; the Copilot file only where a .github folder already exists.
  out['AGENTS.md'] = applyMarkedBlock(readIfExists(join(projectDir, 'AGENTS.md')), agentsBlock(lanes, protocol));
  // An empty host list means the protocol files for every host, as the tests and `render --host all` use it.
  const forHost = (h: Host) => hosts.length === 0 || hosts.includes(h);
  if (forHost('claude')) out['CLAUDE.md'] = applyMarkedBlock(readIfExists(join(projectDir, 'CLAUDE.md')), protocolBlock);
  if (existsSync(join(projectDir, '.github'))) out['.github/copilot-instructions.md'] = applyMarkedBlock(readIfExists(join(projectDir, '.github/copilot-instructions.md')), protocolBlock);
  if (forHost('cursor')) out['.cursor/rules/codeloop.mdc'] = `---\ndescription: The standing codeloop protocol, read this before any work in the active card.\nalwaysApply: true\n---\n\n${protocol}\n`;

  const marked = new Set(['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md']);
  const result = { written: [] as string[], unchanged: [] as string[], kept: [] as string[] };
  for (const [path, body] of Object.entries(out)) {
    const file = join(projectDir, path);
    const text = marked.has(path) ? body : stamped(body);
    const current = existsSync(file) ? readFileSync(file, 'utf-8') : undefined;
    if (current === text) {
      result.unchanged.push(path);
      continue;
    }
    if (current !== undefined && !marked.has(path) && !opts.force && !asRendered(current, body)) {
      result.kept.push(path);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    result.written.push(path);
  }
  return result;
}
