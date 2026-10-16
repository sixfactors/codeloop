import { execSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newArtifact } from '../artifact.js';
import { readCards } from '../cards.js';
import { startCard } from '../flow.js';
import { recordHandback } from '../handback.js';
import { acceptAllAnswers, addQuestions } from '../interview.js';
import { newMock, writeMocksIndex } from '../mock.js';
import { evidenceOf, usecasesOf } from '../paths.js';
import { specPath } from '../project-root.js';
import { runGate } from '../gate.js';
import { verify } from '../verify.js';
import { capture } from '../wiki.js';

const GIT = 'git -c user.email=a@b -c user.name=t';
let dir: string;
const sh = (cmd: string) => execSync(cmd, { cwd: dir, encoding: 'utf8' }).trim();
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/** What codeloop may write outside .codeloop: the host files a project opted into. */
const HOST = /^(CLAUDE\.md|AGENTS\.md|\.claude\/|\.cursor\/|\.agents\/|\.github\/copilot-instructions\.md)/;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-write-guard-')));
  write('.codeloop/config.yaml', 'project:\n  name: demo\nverify:\n  live_walk: false\nbudget: off\nhealth: off\n');
  write('.codeloop/lanes/build.yaml', readFileSync(resolve('templates/lanes/build.yaml'), 'utf-8'));
  write('src/export.ts', 'export const rows = 10;\n');
  write('README.md', '# Demo\n');
  write('.gitignore', 'node_modules/\n');
  sh(`git init -q -b main && ${GIT} add -A && ${GIT} commit -qm product`);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('everything codeloop writes lives under .codeloop', () => {
  it("a story's spec, questions, mock, artifact, wiki page, use cases, evidence, hand-back and gate write nothing outside .codeloop", async () => {
    const card = startCard(dir, { lane: 'build', title: 'Founders can export invoices' });
    addQuestions(dir, card.id, [{ question: 'Which format?', recommended: 'CSV' }]);
    acceptAllAnswers(dir, card.id);
    newMock(dir, card.id, 'exports');
    writeMocksIndex(dir);
    newArtifact(dir, card.id, 'exports', 'system-design');
    capture(dir, { title: 'CSV export drops the BOM', scope: ['src/export.ts'], body: 'Failure: Excel shows mojibake.\nFix: write the BOM first.', card: card.id });
    const spec = readCards(dir).cards.find(c => c.id === card.id)!.spec!;
    writeFileSync(join(dir, spec, 'spec.md'), readFileSync(join(dir, spec, 'spec.md'), 'utf-8').replace(/^- US1 Given <state>.*$/m, '- US1 Given ten invoices, when I export, then the file has ten rows.'));
    write(`${usecasesOf(dir, '001')}/uc-001-01.yaml`, 'id: uc-001-01\naccept: US1\nfailure_mode: the export drops a row\nlayers:\n  cli:\n    run: "true"\n    expect: { exit: 0 }\n');
    await verify(dir, card.id);
    recordHandback(dir, card.id, { branch: 'main', head: sh('git rev-parse HEAD'), proof: 'true' });
    runGate(dir, card.id);

    const changed = sh('git status --porcelain --untracked-files=all').split('\n').filter(Boolean).map(l => l.slice(3));
    expect(changed.length).toBeGreaterThan(5);
    expect(changed.filter(p => !p.startsWith('.codeloop/') && !HOST.test(p))).toEqual([]);
    expect(changed).toContain(`${evidenceOf(dir, '001')}/verify.md`);
    expect(changed.some(p => p.startsWith('.codeloop/specs/'))).toBe(true);
    expect(changed.some(p => p.startsWith('.codeloop/artifacts/'))).toBe(true);
    expect(readFileSync(join(dir, 'src/export.ts'), 'utf-8')).toBe('export const rows = 10;\n');
  }, 60_000);
});

describe('a work dir outside the temp folder', () => {
  it('is refused under the test sandbox, so a suite run by a lane check cannot write a fixture into the real tree', () => {
    const saved = process.env.CODELOOP_WORK_DIR;
    process.env.CODELOOP_WORK_DIR = resolve('.');
    try {
      expect(() => specPath(dir, evidenceOf(dir, '001'))).toThrow(/test sandbox: refusing work dir/);
    } finally {
      if (saved === undefined) delete process.env.CODELOOP_WORK_DIR;
      else process.env.CODELOOP_WORK_DIR = saved;
    }
  });
});
