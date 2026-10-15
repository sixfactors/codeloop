/**
 * `codeloop store move --layout dotfolder|root`: moves the story folders (specs, evidence, shape,
 * use cases, the mock archive, artifacts) between the repo root and `.codeloop/`, with `git mv` when
 * they are tracked so their history follows, rewrites the board's spec and evidence paths and the
 * project's lane files, sets `store.layout`, makes sure `.codeloop/state/` is ignored, and (moving to
 * the dotfolder) leaves a `specs/README.md` pointer for one release. `dryRun` reports the same plan
 * and changes nothing.
 */
import { spawnSync } from 'child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { readCards, RefusalError, writeCards } from './cards.js';
import { CONFIG_FILE } from './config.js';
import { FOLDERS, folderIn, layout, type Layout } from './paths.js';
import { storeHome } from './store-home.js';

export interface LayoutMove {
  to: Layout;
  dryRun: boolean;
  moved: { from: string; to: string; tracked: boolean }[];
  cards: number;
  lanes: string[];
  pointer?: string;
}

const tracked = (projectDir: string, path: string) => spawnSync('git', ['ls-files', '--', path], { cwd: projectDir, encoding: 'utf-8' }).stdout.trim() !== '';
const isRealDir = (p: string) => {
  try {
    return lstatSync(p).isDirectory();
  } catch {
    return false;
  }
};

// Root-layout literals a project's own lane files carry, and the placeholders that follow the layout.
const LANE_LITERALS: [RegExp, string][] = [
  [/(?<![\w./])evidence\/\{nnn\}/g, '{evidence}'],
  [/(?<![\w./])usecases\/\{nnn\}/g, '{usecases}'],
  [/(?<![\w./])specs\/\{id\}/g, '{spec}'],
  [/(?<![\w./])shape\/\{id\}/g, '{shape}'],
];

function rewriteLane(text: string): string {
  let out = text;
  for (const [re, to] of LANE_LITERALS) out = out.replace(re, to);
  // A YAML value may not start with `{`: quote one that now does.
  return out.replace(/^(\s*(?:output|path):\s*)(\{(?:evidence|spec|usecases|shape|artifacts)\}[^\s"#]*)\s*$/gm, '$1"$2"');
}

function setLayout(projectDir: string, to: Layout): void {
  const file = join(projectDir, CONFIG_FILE);
  const lines = (existsSync(file) ? readFileSync(file, 'utf-8') : '').replace(/\n*$/, '\n').split('\n');
  const at = lines.findIndex(l => /^store:\s*$/.test(l));
  if (at < 0) return writeFileSync(file, `${lines.join('\n').replace(/\n*$/, '\n')}store:\n  layout: ${to}\n`);
  let end = at + 1;
  while (end < lines.length && /^[ \t]+\S/.test(lines[end])) end++;
  const body = lines.slice(at + 1, end).filter(l => !/^[ \t]+layout:/.test(l));
  writeFileSync(file, [...lines.slice(0, at), 'store:', `  layout: ${to}`, ...body, ...lines.slice(end)].join('\n'));
}

export function moveLayout(projectDir: string, to: Layout, opts: { dryRun?: boolean } = {}): LayoutMove {
  const from: Layout = to === 'dotfolder' ? 'root' : 'dotfolder';
  if (storeHome(projectDir) === 'user') throw new RefusalError('store.home is user: the story folders are links into ~/.codeloop; run `codeloop store move --to repo` first, then move the layout');
  if (layout(projectDir) === to && FOLDERS.every(k => !isRealDir(join(projectDir, folderIn(from, k))))) throw new RefusalError(`the project already uses the ${to} layout`);
  const plan: LayoutMove['moved'] = [];
  for (const kind of FOLDERS) {
    const src = folderIn(from, kind);
    const dst = folderIn(to, kind);
    if (!isRealDir(join(projectDir, src))) continue;
    // The pointer README a previous move left is not story content.
    const entries = readdirSync(join(projectDir, src)).filter(f => f !== 'README.md' || kind !== 'specs');
    if (!entries.length) continue;
    if (existsSync(join(projectDir, dst)) && readdirSync(join(projectDir, dst)).length) throw new RefusalError(`${dst} already has content; merge it by hand before moving ${src}`);
    plan.push({ from: src, to: dst, tracked: tracked(projectDir, src) });
  }

  const pathMap = (p: string) => {
    const hit = plan.find(m => p === m.from || p.startsWith(`${m.from}/`));
    return hit ? `${hit.to}${p.slice(hit.from.length)}` : p;
  };
  const board = readCards(projectDir);
  const changed = board.cards.filter(c => (c.spec && pathMap(c.spec) !== c.spec) || c.evidence.some(e => pathMap(e) !== e));
  const laneDir = join(projectDir, '.codeloop/lanes');
  const lanes = existsSync(laneDir) ? readdirSync(laneDir).filter(f => f.endsWith('.yaml')).filter(f => to === 'dotfolder' && rewriteLane(readFileSync(join(laneDir, f), 'utf-8')) !== readFileSync(join(laneDir, f), 'utf-8')) : [];
  const pointer = to === 'dotfolder' && plan.some(m => m.from === folderIn('root', 'specs')) ? 'specs/README.md' : undefined;
  const result: LayoutMove = { to, dryRun: Boolean(opts.dryRun), moved: plan, cards: changed.length, lanes: lanes.map(f => `.codeloop/lanes/${f}`), ...(pointer ? { pointer } : {}) };
  if (opts.dryRun) return result;

  for (const m of plan) {
    mkdirSync(dirname(join(projectDir, m.to)), { recursive: true });
    if (m.tracked) {
      const mv = spawnSync('git', ['mv', '-k', m.from, m.to], { cwd: projectDir, encoding: 'utf-8' });
      if (mv.status !== 0) throw new RefusalError(`git mv ${m.from} ${m.to} failed: ${mv.stderr.trim()}`);
      // Untracked files git mv -k left behind move by hand.
      if (isRealDir(join(projectDir, m.from))) for (const f of readdirSync(join(projectDir, m.from))) {
        mkdirSync(join(projectDir, m.to), { recursive: true });
        renameSync(join(projectDir, m.from, f), join(projectDir, m.to, f));
      }
    } else renameSync(join(projectDir, m.from), join(projectDir, m.to));
  }
  if (changed.length) {
    writeCards(projectDir, board, board.cards.map(c => ({ ...c, ...(c.spec ? { spec: pathMap(c.spec) } : {}), evidence: c.evidence.map(pathMap) })));
  }
  for (const f of lanes) writeFileSync(join(laneDir, f), rewriteLane(readFileSync(join(laneDir, f), 'utf-8')));
  setLayout(projectDir, to);
  const ignore = join(projectDir, '.gitignore');
  const ignored = existsSync(ignore) ? readFileSync(ignore, 'utf-8') : '';
  if (!/^\/?\.codeloop\/state\/?$/m.test(ignored)) writeFileSync(ignore, `${ignored.replace(/\n*$/, ignored ? '\n' : '')}.codeloop/state/\n`);
  if (pointer) {
    mkdirSync(join(projectDir, 'specs'), { recursive: true });
    writeFileSync(join(projectDir, pointer), '# Moved\n\ncodeloop keeps story specs under `.codeloop/specs/` now (`store.layout: dotfolder`). This file goes in the next release.\n');
  }
  return result;
}
