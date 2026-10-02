import { spawnSync } from 'child_process';
import { checkEnv } from './shell.js';
import { createHash } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { parse as parseYaml, stringify } from 'yaml';
import { DONE, readCards, safeName, type CardEvent } from './cards.js';
import { writeCloudLane } from './cloud.js';
import { RefusalError, type Role } from './engine.js';
import { clock } from './clock.js';
import { withLock } from './lock.js';
import { LANES_DIR, lanePath, lintLane, loadLane, loadLanes, loadSkillsIndex, parseLane, substitute } from './lane.js';

export const PROPOSALS_DIR = '.codeloop/proposals';
export const LANE_CHANGES = '.codeloop/state/lane-changes.json';
const HISTORY_DIR = `${LANES_DIR}/.history`;
const REPLAY_CARDS = 10;
const REJECTIONS_TO_PROPOSE = 3;
const STUCKS_TO_PROPOSE = 2;

interface Fixture {
  name: string;
  setup?: string;
  expect: 'fail' | 'pass';
}

export interface EvalResult {
  proposal: string;
  lane: string;
  version: number;
  at: string;
  laneSha: string;
  lint: string[];
  fixtures: { stage: string; fixture: string; expect: string; got: string; ok: boolean }[];
  vacuous: string[];
  replay: string[];
  replayed: { card: string; stage: string; passed: boolean; accepted: boolean }[];
  /** Ways the proposal makes the lane less strict. Each needs a reason under accept_weakening in eval.yaml. */
  weakening: { change: string; detail: string; accepted: boolean; reason?: string }[];
  green: boolean;
  exitCode: number;
}

const proposalDir = (projectDir: string, id: string) => join(projectDir, PROPOSALS_DIR, safeName(id, 'proposal id'));
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const lastLine = (text: string) => text.trim().split('\n').at(-1) ?? '';

type Cited = CardEvent & { card: string };

export function propose(projectDir: string, now: Date = clock()): string[] {
  const { cards } = readCards(projectDir);
  const root = join(projectDir, PROPOSALS_DIR);
  const existing = existsSync(root) ? readdirSync(root) : [];
  const created: string[] = [];

  for (const lane of loadLanes(projectDir)) {
    // Only cards run under the current version count: events from before a promotion were
    // already answered by it and must not raise the same proposal again.
    const events: Cited[] = cards
      .filter(c => c.lane === lane.id && c.laneVersion === lane.version)
      .flatMap(c => c.events.map(e => ({ ...e, card: c.id })));

    for (const stage of lane.stages) {
      const rejects = events.filter(e => e.action === 'reject' && e.stage === stage.id);
      const stucks = events.filter(e => e.action === 'stuck' && e.stage === stage.id);
      const byRejects = rejects.length >= REJECTIONS_TO_PROPOSE;
      const byStucks = stucks.length >= STUCKS_TO_PROPOSE;
      if (!byRejects && !byStucks) continue;

      const prefix = `${lane.id}-${stage.id}-`;
      const mine = existing.filter(d => d.startsWith(prefix));
      const open = mine.some(d => {
        const file = join(root, d, 'lane.yaml');
        return existsSync(file) && parseLane(readFileSync(file, 'utf-8')).version === lane.version + 1;
      });
      if (open) continue;

      const notes = [
        ...(byRejects ? rejects.map(e => e.note ?? '') : []),
        ...(byStucks ? stucks.map(e => `done check failed with: ${lastLine(e.note ?? '')}`) : []),
      ].filter(Boolean);
      const distinct = [...new Set(notes)];

      const raw = parseYaml(readFileSync(lanePath(projectDir, lane.id), 'utf-8'));
      raw.version = lane.version + 1;
      const target = raw.stages.find((s: { id: string }) => s.id === stage.id);
      target.notes = [...new Set([...(target.notes ?? []), ...distinct])];

      const id = `${prefix}${mine.length + 1}`;
      const dir = join(root, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'lane.yaml'), stringify(raw));
      writeFileSync(join(dir, 'why.md'), why(lane.id, lane.version, stage.id, stage.gate?.name, byRejects ? rejects : [], byStucks ? stucks : [], distinct, id, now));
      writeFileSync(join(dir, 'eval.yaml'), EVAL_TEMPLATE);
      created.push(id);
    }
  }
  return created;
}

const EVAL_TEMPLATE = `# Fixtures for \`codeloop lane eval\`. Each one runs in an empty temp dir: \`setup\`, then the
# check (done.cmd) of every stage this proposal changes. The exit code must match \`expect\`.
# A changed check needs at least one \`expect: fail\` fixture that it really fails on.
fixtures:
  - name: broken-output
    setup: ""   # fill in: a shell command that writes the output the check must reject
    expect: fail
`;

function why(lane: string, version: number, stage: string, gate: string | undefined, rejects: Cited[], stucks: Cited[], notes: string[], id: string, now: Date): string {
  const row = (e: Cited, text: string) => `| ${e.card} | ${e.at} | ${text.replace(/\|/g, '\\|')} |`;
  const lines = [`# Proposal ${id}: lane ${lane}, stage ${stage} (v${version} to v${version + 1})`, '', `Status: proposed ${now.toISOString().slice(0, 10)}`, '', '## Why', ''];
  if (rejects.length) {
    lines.push(`Gate \`${gate ?? stage}\` on stage \`${stage}\` was rejected ${rejects.length} times.`, '', '| Card | When | Rejection note |', '|---|---|---|', ...rejects.map(e => row(e, e.note ?? '')), '');
  }
  if (stucks.length) {
    lines.push(`Stage \`${stage}\` hit \`stuck\` ${stucks.length} times.`, '', '| Card | When | Last line of the failing check |', '|---|---|---|', ...stucks.map(e => row(e, lastLine(e.note ?? ''))), '');
  }
  lines.push('## Change', '', `\`lane.yaml\` bumps the version and adds these \`notes:\` to stage \`${stage}\`, which \`codeloop card show\` prints for whoever runs the stage:`, '', ...notes.map(n => `- ${n}`), '');
  lines.push('## Next', '', `Fill in \`eval.yaml\`, then \`codeloop lane eval ${id}\` and \`codeloop lane promote ${id} --as owner\`.`, '');
  return lines.join('\n');
}

function shell(cmd: string, cwd: string): boolean {
  return spawnSync(cmd, { cwd, shell: true, encoding: 'utf-8', timeout: 600_000, env: checkEnv() }).status === 0;
}

export function evalProposal(projectDir: string, id: string, now: Date = clock()): EvalResult {
  const dir = proposalDir(projectDir, id);
  const laneFile = join(dir, 'lane.yaml');
  if (!existsSync(laneFile)) throw new RefusalError(`proposal "${id}" has no lane.yaml under ${PROPOSALS_DIR}`);
  const proposed = parseLane(readFileSync(laneFile, 'utf-8'));
  const current = existsSync(lanePath(projectDir, proposed.id)) ? loadLane(projectDir, proposed.id) : null;

  const lint = lintLane(proposed, loadSkillsIndex(projectDir));

  const evalFile = join(dir, 'eval.yaml');
  const evalSpec = existsSync(evalFile) ? parseYaml(readFileSync(evalFile, 'utf-8')) ?? {} : {};
  const fixtures: Fixture[] = evalSpec.fixtures ?? [];
  const accepted = new Set<string>(evalSpec.accept_regressions ?? []);
  const changed = proposed.stages.filter(s => s.done?.cmd && s.done.cmd !== current?.stages.find(c => c.id === s.id)?.done?.cmd);
  const runs: EvalResult['fixtures'] = [];
  const vacuous: string[] = [];

  for (const stage of changed) {
    if (!fixtures.some(f => f.expect === 'fail')) {
      vacuous.push(`stage ${stage.id}: the check changed but eval.yaml has no \`expect: fail\` fixture, so nothing shows the check can fail`);
    }
    for (const fixture of fixtures) {
      if (!fixture.setup?.trim()) {
        vacuous.push(`stage ${stage.id}: fixture ${fixture.name} has no setup`);
        continue;
      }
      const tmp = mkdtempSync(join(tmpdir(), 'codeloop-eval-'));
      try {
        const got = !shell(fixture.setup, tmp) ? 'setup-failed' : shell(substitute(stage.done!.cmd!, 'eval-001', { shell: true }), tmp) ? 'pass' : 'fail';
        const ok = got === fixture.expect;
        runs.push({ stage: stage.id, fixture: fixture.name, expect: fixture.expect, got, ok });
        if (!ok) vacuous.push(`stage ${stage.id}: fixture ${fixture.name} expected ${fixture.expect}, got ${got}`);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  }

  const replay: string[] = [];
  const replayed: EvalResult['replayed'] = [];
  const finished = readCards(projectDir).cards.filter(c => c.lane === proposed.id && c.stage === DONE);

  // A proposal can pass every check and still make the lane weaker. Each such change has to be
  // named, with a reason, by the person proposing it.
  const reasons = new Map<string, string>(((evalSpec.accept_weakening ?? []) as { change?: string; reason?: string }[]).map(a => [String(a?.change), String(a?.reason ?? '').trim()]));
  const found: [string, string][] = [];
  for (const before of current?.stages ?? []) {
    const after = proposed.stages.find(s => s.id === before.id);
    if (!after) {
      const passed = finished.filter(c => c.events.some(e => e.stage === before.id && (e.action === 'advance' || e.action === 'approve')));
      if (passed.length) found.push([`remove-stage:${before.id}`, `removes stage ${before.id}, which ${passed.map(c => c.id).join(', ')} passed`]);
      continue;
    }
    if (before.gate && !after.gate) found.push([`remove-gate:${before.id}`, `removes gate ${before.gate.name} from stage ${before.id}`]);
    if (before.gate && after.gate && before.gate.approver !== after.gate.approver) found.push([`approver:${before.id}`, `changes the approver of gate ${before.gate.name} from ${before.gate.approver} to ${after.gate.approver}`]);
    if (before.gate?.outward && after.gate && !after.gate.outward) found.push([`remove-outward:${before.id}`, `stage ${before.id} would no longer wait for approval before its public step`]);
  }
  if (current && current.retries > 0 && proposed.retries <= 0) found.push(['retries-0', `lowers retries from ${current.retries} to ${proposed.retries}, so a card is stuck on its first failed check`]);
  const weakening = found.map(([change, detail]) => ({ change, detail, accepted: !!reasons.get(change), ...(reasons.get(change) ? { reason: reasons.get(change) } : {}) }));
  for (const w of weakening.filter(w => !w.accepted)) {
    replay.push(`${w.detail}; if that is intended, add \`- { change: "${w.change}", reason: "..." }\` under accept_weakening in eval.yaml`);
  }
  // Each changed check is re-run against work that was already accepted. A stage the card never
  // passed (one the proposal adds) has no artifact to judge, so it is left out.
  const recent = [...finished].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(-REPLAY_CARDS);
  for (const card of recent) {
    for (const stage of changed.filter(s => card.events.some(e => e.action === 'advance' && e.stage === s.id))) {
      const passed = shell(substitute(stage.done!.cmd!, card, { shell: true }), projectDir);
      const ok = accepted.has(card.id);
      replayed.push({ card: card.id, stage: stage.id, passed, accepted: ok });
      if (!passed && !ok) {
        replay.push(`card ${card.id} finished, but its ${stage.id} output fails the new check; fix the check or list ${card.id} under accept_regressions in eval.yaml`);
      }
    }
  }

  const exitCode = lint.length ? 2 : vacuous.length ? 4 : replay.length ? 1 : 0;
  const result: EvalResult = {
    proposal: id, lane: proposed.id, version: proposed.version, at: now.toISOString(), laneSha: sha(laneFile),
    lint, fixtures: runs, vacuous, replay, replayed, weakening, green: exitCode === 0, exitCode,
  };
  writeFileSync(join(dir, 'eval-result.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

function logChange(projectDir: string, entry: Record<string, unknown>): void {
  const file = join(projectDir, LANE_CHANGES);
  withLock(file, () => {
    const log = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : [];
    writeFileSync(file, JSON.stringify([...log, entry], null, 2) + '\n');
  });
}

export function promote(projectDir: string, id: string, role: Role, now: Date = clock()): { lane: string; from: number | null; to: number; weakening: EvalResult['weakening'] } {
  if (role !== 'owner') throw new RefusalError(`a lane change needs the owner; ${role} cannot promote`);
  const dir = proposalDir(projectDir, id);
  const laneFile = join(dir, 'lane.yaml');
  const resultFile = join(dir, 'eval-result.json');
  if (!existsSync(laneFile)) throw new RefusalError(`proposal "${id}" not found`);
  if (!existsSync(resultFile)) throw new RefusalError(`proposal ${id} has not been evaluated; run \`codeloop lane eval ${id}\``);
  const result: EvalResult = JSON.parse(readFileSync(resultFile, 'utf-8'));
  if (!result.green) throw new RefusalError(`proposal ${id} failed its eval; fix it and re-run \`codeloop lane eval ${id}\``);
  if (result.laneSha !== sha(laneFile)) throw new RefusalError(`proposal ${id} changed after its eval; re-run \`codeloop lane eval ${id}\``);

  const proposed = parseLane(readFileSync(laneFile, 'utf-8'));
  const target = lanePath(projectDir, proposed.id);
  let from: number | null = null;
  if (existsSync(target)) {
    from = loadLane(projectDir, proposed.id).version;
    if (proposed.version !== from + 1) throw new RefusalError(`proposal ${id} is v${proposed.version} but lane ${proposed.id} is at v${from}; it was written against an older version`);
    mkdirSync(join(projectDir, HISTORY_DIR), { recursive: true });
    copyFileSync(target, join(projectDir, HISTORY_DIR, `${proposed.id}.v${from}.yaml`));
  }
  // The cloud page goes first, so a lane that someone else changed there refuses this promote
  // before the local file is replaced.
  writeCloudLane(projectDir, proposed.id, readFileSync(laneFile, 'utf-8'));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(laneFile, target);
  const weakening = result.weakening ?? [];
  logChange(projectDir, { at: now.toISOString(), action: 'promote', lane: proposed.id, from, to: proposed.version, proposal: id, actor: role, ...(weakening.length ? { weakening } : {}) });
  return { lane: proposed.id, from, to: proposed.version, weakening };
}

export function rollback(projectDir: string, laneId: string, role: Role, now: Date = clock()): { lane: string; from: number; to: number } {
  if (role !== 'owner') throw new RefusalError(`a lane change needs the owner; ${role} cannot roll back`);
  const dir = join(projectDir, HISTORY_DIR);
  const versions = (existsSync(dir) ? readdirSync(dir) : [])
    .map(f => new RegExp(`^${laneId}\\.v(\\d+)\\.yaml$`).exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => parseInt(m[1], 10));
  if (versions.length === 0) throw new RefusalError(`lane ${laneId} has no earlier version in ${HISTORY_DIR}`);

  const to = Math.max(...versions);
  const from = loadLane(projectDir, laneId).version;
  const history = join(dir, `${laneId}.v${to}.yaml`);
  writeCloudLane(projectDir, laneId, readFileSync(history, 'utf-8'));
  copyFileSync(history, lanePath(projectDir, laneId));
  // Removed so a second rollback steps back one more version instead of restoring this one again.
  rmSync(history);
  logChange(projectDir, { at: now.toISOString(), action: 'rollback', lane: laneId, from, to, actor: role });
  return { lane: laneId, from, to };
}
