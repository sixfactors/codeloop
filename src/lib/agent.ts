import { spawn } from 'child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join } from 'path';
import { RefusalError, safeName, type Card } from './cards.js';
import { listCompetitors } from './competitors.js';
import { loadConfig } from './config.js';
import { stageBrief } from './flow.js';
import { loadLane, loadSkillsIndex, shellQuote, SKILLS_INDEX } from './lane.js';
import { checkEnv } from './shell.js';
import { parseFrontmatter } from './skills.js';
import { readTasks } from './spec.js';
import { inject } from './wiki.js';

export const BRIEFS_DIR = '.codeloop/state/briefs';
export const AGENT_RUNS_DIR = '.codeloop/state/agent-runs';
const DEFAULT_TIMEOUT_MINUTES = 20;
const DEFAULT_MAX_RUNS_PER_DAY = 20;
const LOG_TAIL_BYTES = 64_000;

export interface AgentConfig {
  name: string;
  cmd: string;
  timeoutMinutes: number;
  maxRunsPerDay: number;
}

export interface AgentsConfig {
  agents: Record<string, AgentConfig>;
  default?: string;
  /** `run.agent: true`: a plain `codeloop run` starts agents too. */
  runByDefault: boolean;
}

export function loadAgents(projectDir: string): AgentsConfig {
  const raw = loadConfig(projectDir);
  const agents: Record<string, AgentConfig> = {};
  for (const [name, value] of Object.entries((raw.agents ?? {}) as Record<string, any>)) {
    if (name === 'default') continue;
    if (typeof value?.cmd !== 'string' || !value.cmd.trim()) throw new RefusalError(`agents.${name} in .codeloop/config.yaml has no cmd`);
    agents[name] = {
      name,
      cmd: value.cmd,
      timeoutMinutes: Number(value.timeout_minutes ?? DEFAULT_TIMEOUT_MINUTES),
      maxRunsPerDay: Number(value.max_runs_per_day ?? DEFAULT_MAX_RUNS_PER_DAY),
    };
  }
  return { agents, default: raw.agents?.default, runByDefault: raw.run?.agent === true };
}

export function resolveAgent(projectDir: string, name?: string): AgentConfig {
  const config = loadAgents(projectDir);
  const names = Object.keys(config.agents);
  if (names.length === 0) throw new RefusalError('no agent is configured; add `agents:` to .codeloop/config.yaml (the starter config has presets for claude and codex)');
  const wanted = name ?? config.default ?? (names.length === 1 ? names[0] : undefined);
  if (!wanted) throw new RefusalError(`several agents are configured (${names.join(', ')}); name one or set agents.default`);
  const agent = config.agents[wanted];
  if (!agent) throw new RefusalError(`agent "${wanted}" is not in .codeloop/config.yaml (configured: ${names.join(', ')})`);
  return agent;
}

export function briefPath(card: Card): string {
  return `${BRIEFS_DIR}/${card.id}-${safeName(card.stage, 'stage id')}.md`;
}

function skillBody(projectDir: string, name: string): string | null {
  const source = loadSkillsIndex(projectDir)?.find(s => s.name === name)?.source;
  if (!source) return null;
  const file = isAbsolute(source) ? source : join(projectDir, source);
  return existsSync(file) ? parseFrontmatter(readFileSync(file, 'utf-8')).body.trim() : null;
}

// The stage output, what is already in the card's spec folder, and the paths its open tasks name.
function filesInScope(projectDir: string, card: Card, output?: string): string[] {
  const files = output ? [output] : [];
  if (card.spec && existsSync(join(projectDir, card.spec))) {
    files.push(...readdirSync(join(projectDir, card.spec)).map(f => `${card.spec}/${f}`));
    if (existsSync(join(projectDir, card.spec, 'tasks.md'))) {
      for (const task of readTasks(projectDir, card.spec).tasks.filter(t => !t.done)) {
        files.push(...(task.text.match(/(?:[\w.-]+\/)+[\w.-]+/g) ?? []));
      }
    }
  }
  return [...new Set(files)];
}

/** Everything a headless agent is given to do the card's current stage. */
export function buildBrief(projectDir: string, card: Card): string {
  const stage = stageBrief(projectDir, card);
  if (!stage) throw new RefusalError(`card ${card.id} has no stage to brief (it is ${card.stage})`);
  const lane = loadLane(projectDir, card.lane);
  const events = card.events.filter(e => e.stage === card.stage);
  const lines = [
    `# Stage brief: ${card.id} ${card.stage}`,
    '',
    `Card: ${card.id}`,
    `Title: ${card.title}`,
    `Lane: ${lane.id} (version ${lane.version})`,
    `Stage: ${card.stage}`,
    ...(stage.skill ? [`Skill: ${stage.skill}`] : []),
    ...(stage.output ? [`Output: ${stage.output}`] : []),
    '',
    '## The check that must pass',
    '',
    `The stage is finished when this command, run from the project root, exits 0${stage.output ? `. It judges ${stage.output}, which this stage writes` : ''}:`,
    '',
    `    ${stage.done}`,
    '',
  ];

  const failed = events.filter(e => e.action === 'fail' || e.action === 'stuck').at(-1);
  if (stage.notes.length || stage.rejections.length || failed?.note) {
    lines.push('## Feedback on this stage', '');
    for (const note of stage.notes) lines.push(`- Stage note: ${note}`);
    stage.rejections.forEach((note, i) => lines.push(`- ${i === stage.rejections.length - 1 ? 'Latest rejection' : 'Earlier rejection'}: ${note}`));
    if (failed?.note) lines.push('', `The check last failed${failed.action === 'stuck' ? ' and the card was marked stuck' : ''} with:`, '', ...failed.note.split('\n').map(l => `    ${l}`));
    lines.push('');
  }

  if (stage.skill) {
    const body = skillBody(projectDir, stage.skill);
    lines.push(`## Skill: ${stage.skill}`, '', body ?? `The skill's text is not in ${SKILLS_INDEX}; use the /${stage.skill} skill if your tool has it.`, '');
  }

  const pages = inject(projectDir, filesInScope(projectDir, card, stage.output));
  if (pages.length) {
    lines.push('## Wiki pages that apply', '');
    for (const p of pages) lines.push(`### ${p.title} (${p.kind}, freq ${p.freq}, ${p.severity})`, '', p.body, '');
  }

  const competitors = card.stage === 'research' ? listCompetitors(projectDir) : [];
  if (competitors.length) {
    lines.push('## Competitors', '', `Read each one's docs and changelog for this feature. Give each a row in ${stage.output ?? 'the research file'} that starts with its name: the row is copied to its page when the stage passes.`, '');
    for (const c of competitors) lines.push(`### ${c.title} (${c.path})`, '', ...(c.docs ? [`Docs: ${c.docs}`] : []), ...(c.changelog ? [`Changelog: ${c.changelog}`] : []), '', c.body, '');
  }

  lines.push(
    '## Rules',
    '',
    `- Do only the ${card.stage} stage of ${card.id}.`,
    stage.output ? `- Write the output to ${stage.output}.` : '- Leave the project in the state the check asks for.',
    '- Do not run `codeloop approve`, `codeloop next` or `codeloop card advance`. The run that started you checks the work and moves the card.',
    '- Do not edit .codeloop/cards.json or anything in .codeloop/lanes/.',
    '- Stop when the output is written.',
    '',
  );
  return lines.join('\n');
}

export interface AgentRun {
  exit: number | null;
  timedOut: boolean;
  durationMs: number;
}

// Keeps the end of the log, where an agent says what it did or why it stopped.
function keepTail(file: string): void {
  const size = statSync(file).size;
  if (size <= LOG_TAIL_BYTES) return;
  const fd = openSync(file, 'r');
  const buffer = Buffer.alloc(LOG_TAIL_BYTES);
  readSync(fd, buffer, 0, LOG_TAIL_BYTES, size - LOG_TAIL_BYTES);
  closeSync(fd);
  writeFileSync(file, `[first ${size - LOG_TAIL_BYTES} bytes dropped]\n${buffer.toString('utf-8')}`);
}

/** Runs the agent command in the project with `{brief}` filled in. Output goes to `logFile`. */
export function runAgent(projectDir: string, agent: AgentConfig, briefFile: string, logFile: string): Promise<AgentRun> {
  mkdirSync(dirname(logFile), { recursive: true });
  const out = openSync(logFile, 'w');
  const started = Date.now();
  return new Promise(done => {
    let timedOut = false;
    let finished = false;
    const finish = (exit: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      closeSync(out);
      keepTail(logFile);
      done({ exit, timedOut, durationMs: Date.now() - started });
    };
    // The command's output goes straight to the file: a pipe held open by a child the agent left
    // behind would keep this process waiting after the agent itself has gone.
    const child = spawn(agent.cmd.replaceAll('{brief}', shellQuote(briefFile)), {
      cwd: projectDir,
      shell: true,
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...checkEnv(), CODELOOP_ROLE: 'agent', CODELOOP_AGENT_RUN: agent.name },
    });
    const timer = setTimeout(() => {
      timedOut = true;
      // `detached` made the shell a process group leader, so this reaches the agent and its children.
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, agent.timeoutMinutes * 60_000);
    child.on('error', e => {
      writeFileSync(logFile, `could not start: ${e.message}\n`, { flag: 'a' });
      finish(null);
    });
    child.on('exit', code => finish(code));
  });
}
