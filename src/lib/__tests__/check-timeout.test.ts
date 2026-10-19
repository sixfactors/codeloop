import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { appendActivity } from '../activity.js';
import { readCards } from '../cards.js';
import { checkTimeoutMs } from '../check-timeout.js';
import { createCard, recordEvent, runCheck, currentStage } from '../engine.js';
import { loadLane } from '../lane.js';
import { projectHealth } from '../health.js';
import { doctorTick } from '../run.js';
import { recordHandback, runGate, splitCard } from '../services.js';

let dir: string;
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const limit = (minutes: unknown) => write('.codeloop/config.yaml', `project:\n  name: demo\nchecks:\n  timeout_minutes: ${minutes}\n`);
const lane = (id: string, cmd: string, extra = '') => write(`.codeloop/lanes/${id}.yaml`, `id: ${id}\nversion: 1\nmetric: { name: m, source: cards }\n${extra}stages:\n  - id: code\n    done: { cmd: "${cmd}" }\n`);

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-check-timeout-')));
  write('.codeloop/config.yaml', 'project:\n  name: demo\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('checks.timeout_minutes', () => {
  it('defaults to 10 minutes and ignores a value that is not a positive number', () => {
    expect(checkTimeoutMs(dir)).toBe(600_000);
    for (const bad of ['0', '-5', 'soon', '[1]']) {
      limit(bad);
      expect(checkTimeoutMs(dir)).toBe(600_000);
    }
    limit(40);
    expect(checkTimeoutMs(dir)).toBe(2_400_000);
    expect(checkTimeoutMs(dir, 15)).toBe(2_400_000);
    limit(5);
    expect(checkTimeoutMs(dir, 15)).toBe(900_000);
  });

  it('a stage check is killed at the project limit and the crash names the limit and the setting', () => {
    limit(0.01);
    lane('build', 'sleep 5');
    const card = createCard(dir, { lane: 'build', title: 'Founders can read the launch post' });
    const t0 = Date.now();
    const r = runCheck(dir, card, currentStage(loadLane(dir, 'build'), card))!;
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(r.passed).toBe(false);
    expect(r.crashed).toMatch(/^timed out after 0\.01 min/);
    expect(r.crashed).toContain('checks.timeout_minutes');
  });

  it('the doctor\'s own check rerun uses the project limit, not a fixed one', async () => {
    write('.codeloop/config.yaml', 'monitor: on\nchecks:\n  timeout_minutes: 0.01\n');
    lane('slow', 'sleep 5', 'retries: 2\n');
    createCard(dir, { lane: 'slow', title: 'Founders can read the launch post' });
    const failedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const file = readCards(dir);
    write('.codeloop/cards.json', JSON.stringify({ ...file, cards: [{ ...file.cards[0], gate: 'stuck', awaiting: 'owner', retries: { code: 2 }, updatedAt: failedAt, events: [{ at: failedAt, actor: 'engine', human: false, action: 'fail', stage: 'code', note: 'nope' }] }] }));
    appendActivity(dir, 'c-001', { kind: 'edit', text: 'src/x.ts' });
    const t0 = Date.now();
    const actions = await doctorTick(dir, new Date());
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(actions.map(a => a.note)).toEqual([expect.stringMatching(/^check-error: timed out after 0\.01 min/)]);
  });
});

describe('a hand-back proof and its gate rerun', () => {
  let head: string;
  beforeEach(() => {
    lane('build', 'true');
    write('src/real.ts', 'export {};\n');
    execSync('git init -q && git add -A && git -c user.email=a@b -c user.name=t commit -qm init', { cwd: dir });
    head = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    createCard(dir, { lane: 'build', title: 'Founders can read the launch post' });
  });

  it('records a killed proof as timed out, naming the limit, not as a plain exit 1', () => {
    limit(0.01);
    const rec = recordHandback(dir, 'c-001', { branch: 'main', head, proof: 'sleep 5', left: 'nothing' });
    expect(rec.proof.exit).toBe(1);
    expect(rec.proof.output).toMatch(/proof timed out after 0\.01 min/);
    expect(rec.proof.output).toContain('checks.timeout_minutes');
  });

  it('the gate says the proof timed out instead of reporting an exit code', () => {
    write('.codeloop/config.yaml', 'project:\n  name: demo\n');
    recordHandback(dir, 'c-001', { branch: 'main', head, proof: 'sleep 3', left: 'nothing' });
    limit(0.01);
    const rec = runGate(dir, 'c-001');
    expect(rec.verdict).toBe('fail');
    expect(rec.findings.join('\n')).toMatch(/proof "sleep 3" timed out after 0\.01 min/);
    expect(rec.findings.join('\n')).not.toContain('exited 1');
  });
});

describe('the health lint and type commands', () => {
  it('a lint killed at the limit counts as unmeasured, not as zero errors', () => {
    write('.codeloop/config.yaml', 'checks:\n  timeout_minutes: 0.01\nhealth:\n  lint_cmd: "sleep 5"\n');
    write('src/a.ts', 'export {};\n');
    const t0 = Date.now();
    expect(projectHealth(dir).lint).toBeNull();
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});

describe('a split counts the lane limit like every other path', () => {
  it('a story nobody is working on does not stop the first child taking the parent\'s slot', () => {
    lane('build', 'false', 'wip: 1\n');
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' });
    // c-001 sits in the lane with no agent on it; only c-002 holds the one slot, and a split frees it.
    recordEvent(dir, 'c-002', () => ({ action: 'agent-start', agent: 'fake', log: 'x.log' }));
    const { cards } = splitCard(dir, 'c-002', ['Export my todos as a CSV file', 'Export my todos as a JSON file'], 'owner');
    expect(cards.map(c => c.stage)).toEqual(['code', 'queued']);
  });
});
