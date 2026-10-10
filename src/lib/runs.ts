/**
 * One card's stage run started from the API or the SDK: the stage's check, the configured agent
 * when the check fails, then one advance. The record and its log live under
 * .codeloop/state/agent-runs/ beside the logs `codeloop run --agent` writes, so a board can read
 * either. The run goes on after the start returns; `getRun` and `streamRun` follow it.
 */
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AGENT_RUNS_DIR, loadAgents, resolveAgent, type AgentConfig } from './agent.js';
import { findCard, readCards, RefusalError, safeName } from './cards.js';
import { clock } from './clock.js';
import { loadLane, substitute } from './lane.js';
import { workCard } from './run.js';

const LOG_TAIL_BYTES = 64_000;
const POLL_MS = 200;

export interface RunRecord {
  runId: string;
  cardId: string;
  stage: string;
  /** The agent that was, or would be, started when the check failed; absent when none is configured. */
  agent?: string;
  status: 'running' | 'done' | 'failed';
  /** The agent's exit code when one ran (null when killed); otherwise 0 when the check passed, 1 when it did not. */
  exit?: number | null;
  startedAt: string;
  endedAt?: string;
  /** The advance's outcome, or `refused` with `note` saying why. */
  outcome?: string;
  note?: string;
  /** Where the log is, from the project root. */
  logPath: string;
}

/** A record as the API serves it: the log's last 64 kB in place of its path. */
export type RunView = Omit<RunRecord, 'logPath'> & { log: string };

const recordPath = (projectDir: string, runId: string) => join(projectDir, AGENT_RUNS_DIR, `${safeName(runId, 'run id')}.json`);
const pending = new Map<string, Promise<RunRecord>>();

function save(projectDir: string, record: RunRecord): RunRecord {
  mkdirSync(join(projectDir, AGENT_RUNS_DIR), { recursive: true });
  writeFileSync(recordPath(projectDir, record.runId), JSON.stringify(record, null, 2) + '\n');
  return record;
}

const append = (projectDir: string, record: RunRecord, text: string) => writeFileSync(join(projectDir, record.logPath), text.endsWith('\n') ? text : `${text}\n`, { flag: 'a' });

/**
 * Starts the card's current stage: refused when the card is waiting at a gate or is not in a lane.
 * With `agent` that agent is used; without it the configured one, or none, in which case the
 * check alone decides. Returns at once with the record; `finished` settles when the run has.
 */
export function startCardRun(projectDir: string, ref: string, opts: { agent?: string; now?: Date } = {}): { record: RunRecord; finished: Promise<RunRecord> } {
  const card = findCard(readCards(projectDir).cards, ref);
  const lane = loadLane(projectDir, card.lane);
  const stage = lane.stages.find(s => s.id === card.stage);
  if (!stage) throw new RefusalError(`card ${card.id} is ${card.stage}; nothing to run`);
  if (card.gate) throw new RefusalError(`card ${card.id} is waiting for you at gate "${card.gate}" (${card.awaiting} approves); approve or reject it first`);
  const agent: AgentConfig | null = opts.agent || Object.keys(loadAgents(projectDir).agents).length ? resolveAgent(projectDir, opts.agent) : null;
  const now = opts.now ?? clock();

  const dir = join(projectDir, AGENT_RUNS_DIR);
  const prefix = `${card.id}-${safeName(stage.id, 'stage id')}-`;
  const n = (existsSync(dir) ? readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.json')).length : 0) + 1;
  const runId = `${prefix}${n}`;
  const record = save(projectDir, {
    runId,
    cardId: card.id,
    stage: stage.id,
    ...(agent ? { agent: agent.name } : {}),
    status: 'running',
    startedAt: now.toISOString(),
    logPath: `${AGENT_RUNS_DIR}/${runId}.log`,
  });
  append(projectDir, record, `run ${runId}: ${card.id} ${stage.id}\ncheck: ${stage.done?.cmd ? substitute(stage.done.cmd, card, { shell: true }) : `event ${stage.done?.event}`}\n${agent ? `agent ${agent.name} starts if the check fails: ${agent.cmd}` : 'no agent configured; the check alone decides'}\n`);

  const finished = (async () => {
    let final: RunRecord;
    try {
      const turn = await workCard(projectDir, card.id, stage.id, agent, now, record.logPath);
      if (turn.agent) append(projectDir, record, turn.agent.started ? `agent ${turn.agent.agent} exited ${turn.agent.exit} after ${Math.round((turn.agent.durationMs ?? 0) / 1000)}s` : `agent ${turn.agent.agent} not started: ${turn.agent.reason}`);
      if (turn.output) append(projectDir, record, turn.output);
      const ok = turn.outcome === 'moved' || turn.outcome === 'done' || turn.outcome === 'parked';
      append(projectDir, record, `${card.id}: ${turn.advanced.outcome}${turn.advanced.note ? ` (${turn.advanced.note})` : ''}`);
      final = {
        ...record,
        status: ok ? 'done' : 'failed',
        exit: turn.agent?.started ? turn.agent.exit : ok ? 0 : 1,
        outcome: turn.advanced.outcome,
        ...(turn.advanced.note ? { note: turn.advanced.note } : {}),
      };
    } catch (e) {
      append(projectDir, record, `error: ${(e as Error).message}`);
      final = { ...record, status: 'failed', outcome: 'error', note: (e as Error).message };
    }
    final.endedAt = clock().toISOString();
    save(projectDir, final);
    pending.delete(runId);
    return final;
  })();
  pending.set(runId, finished);
  return { record, finished };
}

export function readRun(projectDir: string, runId: string): RunRecord | undefined {
  const file = recordPath(projectDir, runId);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as RunRecord) : undefined;
}

function logTail(projectDir: string, record: RunRecord): string {
  const file = join(projectDir, record.logPath);
  if (!existsSync(file)) return '';
  const size = statSync(file).size;
  const fd = openSync(file, 'r');
  try {
    const length = Math.min(size, LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    return buffer.toString('utf-8');
  } finally {
    closeSync(fd);
  }
}

/** The record with the log's tail; undefined when there is no such run. */
export function getRun(projectDir: string, runId: string): RunView | undefined {
  const record = readRun(projectDir, runId);
  if (!record) return undefined;
  const { logPath: _logPath, ...rest } = record;
  return { ...rest, log: logTail(projectDir, record) };
}

/** Settles when the run has: the in-process promise when this process started it, else the record polled. */
export async function waitRun(projectDir: string, runId: string): Promise<RunRecord> {
  const own = pending.get(runId);
  if (own) return own;
  for (;;) {
    const record = readRun(projectDir, runId);
    if (!record) throw new RefusalError(`run "${runId}" not found`);
    if (record.status !== 'running') return record;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

/** The log's lines as they are written, ending once the run has; the final record follows as `{ end }`. */
export async function* streamRun(projectDir: string, runId: string, signal?: AbortSignal): AsyncIterable<{ line: string } | { end: RunRecord }> {
  let record = readRun(projectDir, runId);
  if (!record) throw new RefusalError(`run "${runId}" not found`);
  const file = join(projectDir, record.logPath);
  let offset = 0;
  let partial = '';
  for (;;) {
    const size = existsSync(file) ? statSync(file).size : 0;
    if (size > offset) {
      const fd = openSync(file, 'r');
      const buffer = Buffer.alloc(size - offset);
      readSync(fd, buffer, 0, buffer.length, offset);
      closeSync(fd);
      offset = size;
      const lines = (partial + buffer.toString('utf-8')).split('\n');
      partial = lines.pop() ?? '';
      for (const line of lines) yield { line };
    } else {
      // Nothing new: the record decides whether that is the end or a pause.
      record = readRun(projectDir, runId) ?? record;
      if (record.status !== 'running') {
        if (partial) yield { line: partial };
        yield { end: record };
        return;
      }
      if (signal?.aborted) return;
      await new Promise(r => setTimeout(r, POLL_MS));
    }
  }
}
