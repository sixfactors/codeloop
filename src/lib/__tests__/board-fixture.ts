import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

/**
 * A project the size of a busy board: `cards` stories across four stages, each with a spec folder,
 * an activity stream and some failed checks, and `commits` commits carrying Card trailers on main
 * and on side branches. Built with fast-import, so 400 commits take well under a second.
 */
export function buildBoard(opts: { cards?: number; commits?: number; activityLines?: number } = {}): string {
  const n = opts.cards ?? 200;
  const commits = opts.commits ?? 400;
  const lines = opts.activityLines ?? 600;
  const dir = mkdtempSync(join(tmpdir(), 'codeloop-board-'));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const stages = ['draft', 'build', 'review', 'ship'];
  const now = Date.now();
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  write('.codeloop/config.yaml', 'project:\n  name: fixture\n');
  write('.codeloop/lanes/build.yaml', `id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n${stages.map(s => `  - id: ${s}\n    done: { cmd: "true" }\n`).join('')}`);
  const cards = [];
  for (let i = 1; i <= n; i++) {
    const id = `c-${String(i).padStart(3, '0')}`;
    const stage = i % 7 === 0 ? 'done' : stages[i % 4];
    const entered = stages.slice(0, Math.max(0, stages.indexOf(stage))).map((from, k) => ({ at: ago(4000 - k * 500), action: 'advance', stage: from, note: `to ${stages[k + 1]}` }));
    const events = [{ at: ago(9000), action: 'create', stage: 'draft' }, ...entered, ...(i % 5 === 0 ? [{ at: ago(600), action: 'agent-run', stage }, { at: ago(590), action: 'fail', stage, note: 'check failed\nline two' }] : [])];
    cards.push({ id, title: `Founders can do thing ${i}`, lane: 'build', laneVersion: 1, stage, retries: i % 5 === 0 ? { [stage]: 1 } : {}, evidence: [], events, createdAt: ago(9000), updatedAt: ago(i), spec: `specs/${id}`, size: 'S', score: i % 13 });
    write(`specs/${id}/spec.md`, `# ${id}\n`);
    write(`specs/${id}/tasks.md`, '- [ ] T1 one\n- [x] T2 two\n');
    const out: string[] = [];
    for (let l = 0; l < lines; l++) out.push(JSON.stringify({ at: ago(5000 - l * 20 - (i % 9)), session: `s${i % 6}`, kind: ['edit', 'cmd', 'prompt', 'check', 'commit'][l % 5], file: `src/f${l}.ts`, ...(l % 5 === 3 ? { pass: l % 10 !== 3 } : {}) }));
    write(`.codeloop/state/activity/${id}.jsonl`, out.join('\n') + '\n');
    // Half the streams went quiet two hours ago, so failing and stale derivations have work to do.
    if (i % 2 === 0) utimesSync(join(dir, `.codeloop/state/activity/${id}.jsonl`), new Date(now - 120 * 60_000), new Date(now - 120 * 60_000));
  }
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards }, null, 2));
  write('.gitignore', '.codeloop/state/\n');
  write('README.md', 'x\n');
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, input: undefined, encoding: 'utf-8' });
  git('init', '-q', '-b', 'main');
  // One fast-import stream: commits alternate between main and eight side branches.
  const stream: string[] = [];
  let mark = 0;
  for (let c = 0; c < commits; c++) {
    mark++;
    const branch = c % 5 === 0 ? `refs/heads/side${c % 8}` : 'refs/heads/main';
    const id = `c-${String((c % n) + 1).padStart(3, '0')}`;
    const msg = `work ${c}\n\nCard: ${id}\n`;
    stream.push(`commit ${branch}`, `mark :${mark}`, `committer t <t@t> ${Math.floor(now / 1000) - (commits - c) * 60} +0000`, `data ${Buffer.byteLength(msg)}`, msg, `M 644 inline f${c}.txt`, 'data 2', 'x', '');
  }
  execFileSync('git', ['fast-import', '--quiet'], { cwd: dir, input: stream.join('\n') + '\n' });
  git('checkout', '-q', '-f', 'main');
  return dir;
}
