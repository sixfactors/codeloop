import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RefusalError } from '../cards.js';
import { runSkillEval } from '../skill-eval.js';

// codeloop's own fixture skill, checked in for this test: fixtures/skills/spec-brief/{SKILL.md,
// template.md,checklist.md} plus three fixtures (basic, vague-goal, with-research). The skills
// dir and the fixtures dir both point at it, so the test never touches templates/skills/, which
// two other agents are writing to concurrently.
const FIXTURES_ROOT = resolve('fixtures/skills');
const SKILL = 'spec-brief';
const CHECKLIST_LINES = 4; // fixtures/skills/spec-brief/checklist.md

let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/** `.codeloop/config.yaml` naming one fake agent, so no real model runs in this suite. */
function agent(cmd: string): void {
  write('.codeloop/config.yaml', `agents:\n  default: fake\n  fake: { cmd: ${JSON.stringify(cmd)} }\n`);
}

const evalOpts = (extra: Record<string, unknown> = {}) => ({ skillsDir: FIXTURES_ROOT, fixturesDir: FIXTURES_ROOT, now: new Date('2026-10-09T12:00:00Z'), ...extra });

// Reads the brief on stdin. A grading brief (its prompt says "You are grading") gets a canned
// JSON reply on stdout; any other brief is the stage work, which writes `reply` to the Output
// path the brief names (or nothing, when `reply` is empty, so the done-check keeps failing).
function fakeAgent(reply: string, graderJson: string): string {
  const script = join(dir, 'fake-agent.sh');
  writeFileSync(
    script,
    `#!/bin/sh\nb=$(cat)\nif printf '%s' "$b" | grep -qi "you are grading"; then\n  printf '%s' '${graderJson.replace(/'/g, `'\\''`)}'\nelse\n  out=$(printf '%s\\n' "$b" | sed -n 's/^Output: //p' | head -1)\n  if [ -n "$out" ] && [ -n "${reply}" ]; then\n    mkdir -p "$(dirname "$out")"\n    printf '%s\\n' '${reply.replace(/'/g, `'\\''`)}' > "$out"\n  fi\nfi\n`,
    { mode: 0o755 },
  );
  return `sh '${script}' < {brief}`;
}

const ALL_PASS_JSON = JSON.stringify({
  lines: [
    { line: 'brief.md has a Summary section', pass: true, evidence: 'has one' },
    { line: "the Summary restates the spec's goal, not just its title", pass: true, evidence: 'restates it' },
    { line: 'brief.md has a Risks section naming one concrete risk', pass: true, evidence: 'has one' },
    { line: 'when research.md names a competitor or decision, the brief cites it by name', pass: true, evidence: 'n/a' },
  ],
  score: 1,
});

const HALF_PASS_JSON = JSON.stringify({
  lines: [
    { line: 'brief.md has a Summary section', pass: true, evidence: 'has one' },
    { line: "the Summary restates the spec's goal, not just its title", pass: true, evidence: 'restates it' },
    { line: 'brief.md has a Risks section naming one concrete risk', pass: false, evidence: 'no Risks heading' },
    { line: 'when research.md names a competitor or decision, the brief cites it by name', pass: false, evidence: 'no citation' },
  ],
  score: 0.5,
});

const GOOD_OUTPUT = '## Summary\\nrestates the goal\\n\\n## Risks\\nthe one risk';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-skilleval-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('fixture missing', () => {
  it('refuses with a clear error and starts no agent', async () => {
    agent('touch should-not-run');
    await expect(runSkillEval(dir, SKILL, evalOpts({ fixture: 'no-such-fixture' }))).rejects.toThrow(RefusalError);
    await expect(runSkillEval(dir, SKILL, evalOpts({ fixture: 'no-such-fixture' }))).rejects.toThrow(/fixture "no-such-fixture" not found/);
    expect(existsSync(join(dir, 'should-not-run'))).toBe(false);
  });
});

describe('done-check failure', () => {
  it('caps the score at 0.5 even when the grader passes every line', async () => {
    agent(fakeAgent('', ALL_PASS_JSON)); // empty reply: the stage never writes brief.md, so the check keeps failing
    const report = await runSkillEval(dir, SKILL, evalOpts({ fixture: 'basic', min: 0.9 }));
    const [result] = report.fixtures;
    expect(result.doneCheckPassed).toBe(false);
    expect(result.lines.filter(l => l.pass)).toHaveLength(CHECKLIST_LINES);
    expect(result.score).toBe(0.5);
    expect(result.pass).toBe(false);
  });
});

describe('invalid grader JSON', () => {
  it('fails the fixture and keeps the raw reply, instead of throwing', async () => {
    agent(fakeAgent(GOOD_OUTPUT, 'not json, sorry'));
    const report = await runSkillEval(dir, SKILL, evalOpts({ fixture: 'basic' }));
    const [result] = report.fixtures;
    expect(result.doneCheckPassed).toBe(true);
    expect(result.gradeError).toContain('not json, sorry');
    expect(result.lines).toEqual([]);
    expect(result.score).toBe(0);
    expect(result.pass).toBe(false);
    expect(report.pass).toBe(false);
  });
});

describe('threshold', () => {
  it('applies --min, and flipping it flips the same grading from fail to pass (proves the check is not vacuous)', async () => {
    agent(fakeAgent(GOOD_OUTPUT, HALF_PASS_JSON));
    const strict = await runSkillEval(dir, SKILL, evalOpts({ fixture: 'basic', min: 0.8 }));
    expect(strict.fixtures[0].score).toBe(0.5);
    expect(strict.fixtures[0].pass).toBe(false);
    expect(strict.pass).toBe(false);

    const lenient = await runSkillEval(dir, SKILL, evalOpts({ fixture: 'basic', min: 0.4 }));
    expect(lenient.fixtures[0].score).toBe(0.5); // same grading
    expect(lenient.fixtures[0].pass).toBe(true); // different threshold, different verdict
    expect(lenient.pass).toBe(true);
  });
});

describe('run record', () => {
  it('writes one record per run under .codeloop/state/skill-evals/<skill>/, numbered', async () => {
    agent(fakeAgent(GOOD_OUTPUT, ALL_PASS_JSON));
    const first = await runSkillEval(dir, SKILL, evalOpts({ fixture: 'basic' }));
    const second = await runSkillEval(dir, SKILL, evalOpts({ fixture: 'basic' }));

    expect(first.fixtures[0].recordPath).toBe('.codeloop/state/skill-evals/spec-brief/basic-1.json');
    expect(second.fixtures[0].recordPath).toBe('.codeloop/state/skill-evals/spec-brief/basic-2.json');
    const saved = JSON.parse(readFileSync(join(dir, first.fixtures[0].recordPath), 'utf-8'));
    expect(saved).toMatchObject({ skill: SKILL, fixture: 'basic', doneCheckPassed: true, score: 1, pass: true });
    expect(readdirSync(join(dir, '.codeloop/state/skill-evals/spec-brief'))).toHaveLength(2);
  });
});

describe('every fixture without --fixture', () => {
  it('runs all three of spec-brief\'s fixtures', async () => {
    agent(fakeAgent(GOOD_OUTPUT, ALL_PASS_JSON));
    const report = await runSkillEval(dir, SKILL, evalOpts());
    expect(report.fixtures.map(f => f.fixture).sort()).toEqual(['basic', 'vague-goal', 'with-research']);
    expect(report.pass).toBe(true);
  });
});
