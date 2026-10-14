import { specPath } from './project-root.js';
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
import { folderPages, inject, listPages, type Page } from './wiki.js';
import { titleTokens } from './wiki-rules.js';
import { rubricBrief } from './rubric.js';

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

/**
 * `name` is what the caller (a CLI flag, an API call) asked for by name; naming one that is not
 * configured is always a refusal. `laneAgent` is the lane's own `agent:` preference, used only
 * when `name` is empty: a lane naming a preset nobody configured falls back to `agents.default`
 * with no error, since that lane's own board should not break a run because a model preset is
 * missing on this machine.
 */
export function resolveAgent(projectDir: string, name?: string, laneAgent?: string): AgentConfig {
  const config = loadAgents(projectDir);
  const names = Object.keys(config.agents);
  if (names.length === 0) throw new RefusalError('no agent is configured; add `agents:` to .codeloop/config.yaml (the starter config has presets for claude and codex)');
  const wanted = name ?? (laneAgent && config.agents[laneAgent] ? laneAgent : undefined) ?? config.default ?? (names.length === 1 ? names[0] : undefined);
  if (!wanted) throw new RefusalError(`several agents are configured (${names.join(', ')}); name one or set agents.default`);
  const agent = config.agents[wanted];
  if (!agent) throw new RefusalError(`agent "${wanted}" is not in .codeloop/config.yaml (configured: ${names.join(', ')})`);
  return agent;
}

export function briefPath(card: Card): string {
  return `${BRIEFS_DIR}/${card.id}-${safeName(card.stage, 'stage id')}.md`;
}

function skillFile(projectDir: string, name: string): string | null {
  const source = loadSkillsIndex(projectDir)?.find(s => s.name === name)?.source;
  if (!source) return null;
  const file = isAbsolute(source) ? source : join(projectDir, source);
  return existsSync(file) ? readFileSync(file, 'utf-8') : null;
}

function skillBody(projectDir: string, name: string): string | null {
  const text = skillFile(projectDir, name);
  return text ? parseFrontmatter(text).body.trim() : null;
}

// Wiki folders a skill lists under `inputs:` (as `.codeloop/wiki/<folder>/*.md`). Read line by line:
// skill frontmatter is not always valid YAML, and only this one key matters here.
function skillWikiFolders(projectDir: string, name: string): string[] {
  const text = skillFile(projectDir, name);
  if (!text) return [];
  const block = /^inputs:\s*\n((?:[ \t]+-.*\n?)+)/m.exec(text)?.[1] ?? '';
  const folders: string[] = [];
  for (const line of block.split('\n')) {
    const m = /^[ \t]+-\s*\.codeloop\/wiki\/([\w-]+)\//.exec(line);
    if (m && !folders.includes(m[1])) folders.push(m[1]);
  }
  return folders;
}

// A literal `.codeloop/state/*.json` input line (not a glob the agent can list itself, unlike the
// wiki folders above): inlined whole into the brief, same line-by-line read as skillWikiFolders.
function skillStateFiles(projectDir: string, name: string): string[] {
  const text = skillFile(projectDir, name);
  if (!text) return [];
  const block = /^inputs:\s*\n((?:[ \t]+-.*\n?)+)/m.exec(text)?.[1] ?? '';
  const files: string[] = [];
  for (const line of block.split('\n')) {
    const m = /^[ \t]+-\s*(\.codeloop\/state\/[\w.-]+\.json)\s*$/.exec(line);
    if (m && !files.includes(m[1])) files.push(m[1]);
  }
  return files;
}

// The stage output, what is already in the card's spec folder, and the paths its open tasks name.
const MAX_WIKI_PAGES = 10;

// Pages by scope first, then pages whose titles share at least two words, and half their own words,
// with the card's title and open task lines. Capped so the brief stays readable.
function wikiPagesFor(projectDir: string, card: Card, byScope: Page[]): Page[] {
  const tasks = card.spec && existsSync(specPath(projectDir, card.spec, 'tasks.md')) ? readTasks(projectDir, card.spec).tasks.filter(t => !t.done).map(t => t.text) : [];
  const words = titleTokens([card.title, ...tasks].join(' '));
  const byTitle = listPages(projectDir).filter(p => {
    if (byScope.some(q => q.path === p.path)) return false;
    const own = [...titleTokens(p.title)];
    const shared = own.filter(w => words.has(w)).length;
    return shared >= 2 && shared / own.length >= 0.5;
  });
  return [...byScope, ...byTitle].slice(0, MAX_WIKI_PAGES);
}

function filesInScope(projectDir: string, card: Card, output?: string): string[] {
  const files = output ? [output] : [];
  if (card.spec && existsSync(specPath(projectDir, card.spec))) {
    files.push(...readdirSync(specPath(projectDir, card.spec)).map(f => `${card.spec}/${f}`));
    if (existsSync(specPath(projectDir, card.spec, 'tasks.md'))) {
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
    const latest = stage.feedback.at(-1);
    if (latest) {
      lines.push(latest.kind === 'rejected'
        ? "This stage's gate was rejected after its check passed: redo the stage so the check passes again and the gate is asked again."
        : `The entry gate of ${latest.from ?? 'the next stage'} was rejected before that stage ran: the card came back here, so redo this stage.`);
    }
    stage.feedback.forEach((f, i) => {
      const when = i === stage.feedback.length - 1 ? 'Latest' : 'Earlier';
      lines.push(f.kind === 'rejected' ? `- ${when} rejection: ${f.note}` : `- ${when} return from ${f.from ?? 'the next stage'}: ${f.note}`);
    });
    if (failed?.note) lines.push('', `The check last failed${failed.action === 'stuck' ? ' and the card was marked stuck' : ''} with:`, '', ...failed.note.split('\n').map(l => `    ${l}`));
    lines.push('');
  }

  if (stage.skill) {
    const body = skillBody(projectDir, stage.skill);
    lines.push(`## Skill: ${stage.skill}`, '', body ?? `The skill's text is not in ${SKILLS_INDEX}; use the /${stage.skill} skill if your tool has it.`, '');
  }

  const laneStage = lane.stages.find(s => s.id === card.stage);
  if (laneStage) lines.push(...rubricBrief(projectDir, card, laneStage));

  if (stage.skill) {
    for (const file of skillStateFiles(projectDir, stage.skill)) {
      const full = specPath(projectDir, file);
      if (existsSync(full)) lines.push(`## ${file}`, '', '```json', readFileSync(full, 'utf-8').trim(), '```', '');
    }
  }

  const pages = wikiPagesFor(projectDir, card, inject(projectDir, filesInScope(projectDir, card, stage.output)));
  if (pages.length) {
    lines.push('## Wiki pages that apply', '', 'Matched by the files in scope and by the story\'s title and tasks. When you finish, end your output with one `read: <wiki page path>` line for each page you used.', '');
    for (const p of pages) lines.push(`### ${p.title} (${p.kind}, freq ${p.freq}, ${p.severity}, ${p.path})`, '', p.body, '');
  }

  // Competitor pages have their own section below, with the instruction that goes with them.
  const folders = stage.skill ? skillWikiFolders(projectDir, stage.skill).filter(f => f !== 'competitors') : [];
  const folderPagesByName = folders.map(f => [f, folderPages(projectDir, f).filter(p => !pages.some(q => q.path === p.path))] as const).filter(([, ps]) => ps.length);
  if (folderPagesByName.length) {
    lines.push('## Wiki folders this skill reads', '', 'Named in the skill\'s inputs. Read them before searching anywhere else; what they say is already decided.', '');
    for (const [folder, ps] of folderPagesByName) {
      lines.push(`### ${folder}/`, '');
      for (const p of ps) lines.push(`#### ${p.title} (${p.path})`, '', p.body, '');
    }
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
/** The `Card: <id>` line every stage brief starts with. */
function cardOfBrief(briefFile: string): string | undefined {
  try {
    return /^Card: (\S+)$/m.exec(readFileSync(briefFile, 'utf-8'))?.[1];
  } catch {
    return undefined;
  }
}

/** `cwd` and `env` let the orchestrator start the agent in a story's worktree while the board stays in `projectDir`. */
export function runAgent(projectDir: string, agent: AgentConfig, briefFile: string, logFile: string, opts: { cwd?: string; env?: Record<string, string> } = {}): Promise<AgentRun> {
  mkdirSync(dirname(logFile), { recursive: true });
  // Appended, not truncated: a run started from the API writes the check's output ahead of the agent's.
  const out = openSync(logFile, 'a');
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
      cwd: opts.cwd ?? projectDir,
      shell: true,
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...checkEnv(), CODELOOP_ROLE: 'agent', CODELOOP_AGENT_RUN: agent.name, ...(cardOfBrief(briefFile) ? { CODELOOP_CARD: cardOfBrief(briefFile) } : {}), ...opts.env },
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
