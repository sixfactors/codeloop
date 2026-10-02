import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { loadLanes, loadSkillsIndex, type Lane, type SkillEntry, type Stage } from './lane.js';

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

function files(lanes: Lane[], skills: SkillEntry[], host: Host): Record<string, string> {
  const out: Record<string, string> = {};
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

function agentsBlock(lanes: Lane[]): string {
  const lines = [START, '## codeloop', '', '- Run `codeloop card show <id>` first. It names the stage, the skill, the output path and the done check.', '- Move a card only with `codeloop card advance <id>`. Never edit `.codeloop/cards.json` or a lane file.', '- Gates are approved only by a person. Stop when a card parks.', '- Run `codeloop wiki inject --files <paths>` before changing files.', ''];
  for (const lane of lanes) lines.push(`### ${lane.id}`, '', ...laneTable(lane), '');
  lines.push(END);
  return lines.join('\n');
}

/** Writes only when content differs, so a second run changes nothing. Text outside the AGENTS.md markers is kept. */
export function render(projectDir: string, hosts: Host[]): { written: string[]; unchanged: string[] } {
  const lanes = loadLanes(projectDir);
  const skills = loadSkillsIndex(projectDir) ?? [];
  const out: Record<string, string> = Object.assign({}, ...hosts.map(h => files(lanes, skills, h)));

  const agentsFile = join(projectDir, 'AGENTS.md');
  const current = existsSync(agentsFile) ? readFileSync(agentsFile, 'utf-8') : '';
  const block = agentsBlock(lanes);
  const [start, end] = [current.indexOf(START), current.indexOf(END)];
  out['AGENTS.md'] = start >= 0 && end > start ? current.slice(0, start) + block + current.slice(end + END.length) : `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}\n`;

  const result = { written: [] as string[], unchanged: [] as string[] };
  for (const [path, text] of Object.entries(out)) {
    const file = join(projectDir, path);
    if (existsSync(file) && readFileSync(file, 'utf-8') === text) {
      result.unchanged.push(path);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    result.written.push(path);
  }
  return result;
}
