/**
 * `codeloop skill eval`: proves a skill under `templates/skills/<name>/` (or a custom skills
 * dir) actually gets an agent through its stage. Each fixture under `fixtures/skills/<name>/`
 * is replayed in a throwaway temp project — a one-stage lane synthesized from the skill's own
 * frontmatter, so the fixture never touches this project's cards or specs. The agent runs the
 * stage, the stage's `check` decides whether the work passed, and a second agent call grades the
 * output against the skill's checklist. Records land under `.codeloop/state/skill-evals/`.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { isAbsolute, join, resolve } from 'path';
import { stringify } from 'yaml';
import { type AgentConfig, resolveAgent, runAgent } from './agent.js';
import { RefusalError, safeName } from './cards.js';
import { clock } from './clock.js';
import { annotateCard, createCard } from './engine.js';
import { cardNumber, substitute } from './lane.js';
import { workCard } from './run.js';
import { parseFrontmatter } from './skills.js';

export const DEFAULT_SKILLS_DIR = 'templates/skills';
export const DEFAULT_FIXTURES_DIR = 'fixtures/skills';
export const SKILL_EVALS_DIR = '.codeloop/state/skill-evals';
const DEFAULT_MIN_SCORE = 0.8;

export interface SkillDef {
  name: string;
  stage: string;
  lane: string;
  inputs: string[];
  outputs: string[];
  check: string;
  questions: string[];
  body: string;
  /** Absolute path to the skill's own folder. */
  dir: string;
}

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

// `resolve`, not `join`: a test or a multi-root setup may pass an absolute skillsDir/fixturesDir,
// and resolve (unlike join) treats that as the root instead of nesting it under projectDir.
function skillsRoot(projectDir: string, skillsDir?: string): string {
  return resolve(projectDir, skillsDir ?? DEFAULT_SKILLS_DIR);
}

/** Every skill name under the skills dir (one folder per skill, each with a SKILL.md). */
export function listSkillNames(projectDir: string, skillsDir?: string): string[] {
  const root = skillsRoot(projectDir, skillsDir);
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(name => existsSync(join(root, name, 'SKILL.md'))).sort();
}

export function loadSkillDef(projectDir: string, name: string, skillsDir?: string): SkillDef {
  const dir = join(skillsRoot(projectDir, skillsDir), name);
  const file = join(dir, 'SKILL.md');
  if (!existsSync(file)) throw new RefusalError(`skill "${name}" not found: no ${file}`);
  const { data, body } = parseFrontmatter(readFileSync(file, 'utf-8'));
  if (typeof data.stage !== 'string' || !data.stage) throw new RefusalError(`${file} frontmatter is missing "stage"`);
  if (typeof data.lane !== 'string' || !data.lane) throw new RefusalError(`${file} frontmatter is missing "lane"`);
  if (typeof data.check !== 'string' || !data.check) throw new RefusalError(`${file} frontmatter is missing "check"`);
  return {
    name: typeof data.name === 'string' && data.name ? data.name : name,
    stage: data.stage,
    lane: data.lane,
    inputs: asList(data.inputs),
    outputs: asList(data.outputs),
    check: data.check,
    questions: asList(data.questions),
    body: body.trim(),
    dir,
  };
}

/** The skill's `template.md` and `checklist.md`, read beside its `SKILL.md`. */
export function readSkillFiles(skill: SkillDef): { template: string; checklist: string } {
  const read = (name: string) => {
    const file = join(skill.dir, name);
    if (!existsSync(file)) throw new RefusalError(`skill "${skill.name}" has no ${name} at ${file}`);
    return readFileSync(file, 'utf-8');
  };
  return { template: read('template.md'), checklist: read('checklist.md') };
}

/** One `- [ ]`/`- yes/no`-style line of checklist.md, with the leading marker stripped. */
export function parseChecklist(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('-'))
    .map(l => l.replace(/^-\s*(\[[ xX]\]\s*)?/, '').trim())
    .filter(Boolean);
}

export function fixtureDir(projectDir: string, skill: string, fixtureId: string, fixturesDir?: string): string {
  return resolve(projectDir, fixturesDir ?? DEFAULT_FIXTURES_DIR, skill, fixtureId);
}

/** Every fixture id under `fixtures/skills/<skill>/`, sorted. */
export function listFixtures(projectDir: string, skill: string, fixturesDir?: string): string[] {
  const dir = resolve(projectDir, fixturesDir ?? DEFAULT_FIXTURES_DIR, skill);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => isDir(join(dir, name))).sort();
}

export interface GradedLine {
  line: string;
  pass: boolean;
  evidence: string;
}

export interface FixtureEvalResult {
  skill: string;
  fixture: string;
  agent: string;
  doneCheckPassed: boolean;
  /** Set instead of `lines`/`score` when the grader's response was not valid JSON. */
  gradeError?: string;
  lines: GradedLine[];
  score: number;
  min: number;
  pass: boolean;
  at: string;
  recordPath: string;
}

interface GraderReply {
  lines: { line: string; pass: boolean; evidence: string }[];
  score: number;
}

function isGraderReply(v: unknown): v is GraderReply {
  return !!v && typeof v === 'object' && Array.isArray((v as GraderReply).lines) && (v as GraderReply).lines.every(l => typeof l?.line === 'string' && typeof l?.pass === 'boolean');
}

/** The first `{...}` block in the text, parsed; undefined when there is none or it does not parse. */
function extractJson(text: string): GraderReply | undefined {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return undefined;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return isGraderReply(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function gradingPrompt(skill: SkillDef, checklist: string, output: string): string {
  return [
    `You are grading whether an AI agent's output for the skill "${skill.name}" satisfies a checklist.`,
    '',
    '## Checklist',
    '',
    checklist.trim(),
    '',
    '## Output produced',
    '',
    output.trim() || '(empty — the file was not written)',
    '',
    '## Your answer',
    '',
    'Reply with ONLY this JSON, no other text: {"lines":[{"line":"<checklist line text>","pass":true|false,"evidence":"<short quote or reason>"}],"score":<0..1>}',
    'One entry per checklist line, in order.',
  ].join('\n');
}

function writeBrief(dir: string, name: string, text: string): string {
  const path = join(dir, 'briefs', `${name}.md`);
  mkdirSync(join(dir, 'briefs'), { recursive: true });
  writeFileSync(path, text);
  return path;
}

/** Runs one fixture end to end and returns its graded result; does not write the record. */
export async function evalFixture(projectDir: string, skill: SkillDef, fixtureId: string, agent: AgentConfig, opts: { fixturesDir?: string; min?: number; now?: Date } = {}): Promise<FixtureEvalResult> {
  const srcDir = fixtureDir(projectDir, skill.name, fixtureId, opts.fixturesDir);
  if (!existsSync(srcDir)) throw new RefusalError(`fixture "${fixtureId}" not found for skill "${skill.name}": no ${srcDir}`);
  const { checklist } = readSkillFiles(skill);
  const checklistLines = parseChecklist(checklist);
  if (checklistLines.length === 0) throw new RefusalError(`${skill.name}'s checklist.md has no "- " lines to grade`);

  const now = opts.now ?? clock();
  const min = opts.min ?? DEFAULT_MIN_SCORE;
  const tempDir = mkdtempSync(join(tmpdir(), 'codeloop-skilleval-'));
  try {
    const skillFile = isAbsolute(skill.dir) ? join(skill.dir, 'SKILL.md') : join(projectDir, skill.dir, 'SKILL.md');
    mkdirSync(join(tempDir, '.codeloop/lanes'), { recursive: true });
    writeFileSync(
      join(tempDir, '.codeloop/lanes', `${safeName(skill.lane, 'lane id')}.yaml`),
      stringify({
        id: skill.lane,
        version: 1,
        metric: { name: 'eval', source: 'cards' },
        retries: 3,
        stages: [{ id: skill.stage, skill: skill.name, ...(skill.outputs[0] ? { output: skill.outputs[0] } : {}), done: { cmd: skill.check } }],
      }),
    );
    writeFileSync(join(tempDir, '.codeloop/skills.index.yaml'), stringify([{ name: skill.name, source: skillFile, kind: 'skill', description: '' }]));

    const card = createCard(tempDir, { lane: skill.lane, title: `eval ${skill.name} ${fixtureId}`, id: 'c-001', now });
    const specDir = `specs/${cardNumber(card.id)}`;
    annotateCard(tempDir, card.id, { spec: specDir }, 'spec-set', { now });
    mkdirSync(join(tempDir, specDir), { recursive: true });
    for (const file of readdirSync(srcDir).filter(f => f !== 'expected.md')) {
      writeFileSync(join(tempDir, specDir, file), readFileSync(join(srcDir, file)));
    }

    const stageLog = join(tempDir, '.codeloop/state/agent-runs', `${fixtureId}-stage.log`);
    const turn = await workCard(tempDir, card.id, skill.stage, agent, now, stageLog);
    const doneCheckPassed = turn.outcome === 'moved' || turn.outcome === 'done';

    const outputPath = skill.outputs[0] ? substitute(skill.outputs[0], card) : undefined;
    const output = outputPath && existsSync(join(tempDir, outputPath)) ? readFileSync(join(tempDir, outputPath), 'utf-8') : '';

    const graderBrief = writeBrief(join(tempDir, '.codeloop/state'), 'grader', gradingPrompt(skill, checklist, output));
    const graderLog = join(tempDir, '.codeloop/state/agent-runs', `${fixtureId}-grade.log`);
    await runAgent(tempDir, agent, graderBrief, graderLog);
    const raw = existsSync(graderLog) ? readFileSync(graderLog, 'utf-8') : '';
    const reply = extractJson(raw);

    const at = now.toISOString();
    if (!reply) {
      return { skill: skill.name, fixture: fixtureId, agent: agent.name, doneCheckPassed, gradeError: raw, lines: [], score: 0, min, pass: false, at, recordPath: '' };
    }
    const lines: GradedLine[] = checklistLines.map(line => {
      const found = reply.lines.find(l => l.line === line) ?? reply.lines[checklistLines.indexOf(line)];
      return { line, pass: !!found?.pass, evidence: found?.evidence ?? '' };
    });
    let score = lines.filter(l => l.pass).length / lines.length;
    if (!doneCheckPassed) score = Math.min(score, 0.5);
    return { skill: skill.name, fixture: fixtureId, agent: agent.name, doneCheckPassed, lines, score, min, pass: score >= min, at, recordPath: '' };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function nextRecordPath(projectDir: string, skill: string, fixtureId: string): string {
  const dir = join(projectDir, SKILL_EVALS_DIR, safeName(skill, 'skill name'));
  mkdirSync(dir, { recursive: true });
  const prefix = `${safeName(fixtureId, 'fixture id')}-`;
  const n = readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.json')).length + 1;
  return join(dir, `${prefix}${n}.json`);
}

/** Writes the fixture's result under `.codeloop/state/skill-evals/<skill>/<fixture>-<n>.json` and fills `recordPath`. */
function recordFixture(projectDir: string, result: FixtureEvalResult): FixtureEvalResult {
  const path = nextRecordPath(projectDir, result.skill, result.fixture);
  const withPath = { ...result, recordPath: path.slice(projectDir.length + 1) };
  writeFileSync(path, JSON.stringify(withPath, null, 2) + '\n');
  return withPath;
}

export interface SkillEvalOptions {
  fixture?: string;
  agent?: string;
  min?: number;
  skillsDir?: string;
  fixturesDir?: string;
  now?: Date;
}

export interface SkillEvalReport {
  skill: string;
  agent: string;
  min: number;
  fixtures: FixtureEvalResult[];
  pass: boolean;
}

/** Runs every fixture for a skill (or just `opts.fixture`), grades each, and records them. */
export async function runSkillEval(projectDir: string, skillName: string, opts: SkillEvalOptions = {}): Promise<SkillEvalReport> {
  const skill = loadSkillDef(projectDir, skillName, opts.skillsDir);
  const agent = resolveAgent(projectDir, opts.agent);
  const fixtures = opts.fixture ? [opts.fixture] : listFixtures(projectDir, skillName, opts.fixturesDir);
  if (fixtures.length === 0) throw new RefusalError(`skill "${skillName}" has no fixtures under ${opts.fixturesDir ?? DEFAULT_FIXTURES_DIR}/${skillName}/`);

  const min = opts.min ?? DEFAULT_MIN_SCORE;
  const results: FixtureEvalResult[] = [];
  for (const fixtureId of fixtures) {
    const result = await evalFixture(projectDir, skill, fixtureId, agent, { fixturesDir: opts.fixturesDir, min, now: opts.now });
    results.push(recordFixture(projectDir, result));
  }
  return { skill: skillName, agent: agent.name, min, fixtures: results, pass: results.every(r => r.pass) };
}
