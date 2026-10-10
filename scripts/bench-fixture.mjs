#!/usr/bin/env node
// Writes a project at team scale for the bench: 5k cards with event logs (30% carrying open
// questions in a spec folder), 20k wiki pages. Prints the folder. `--cards N --pages N --dir D`.
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const CARDS = parseInt(arg('cards', '5000'), 10);
const PAGES = parseInt(arg('pages', '20000'), 10);
const dir = arg('dir', mkdtempSync(join(tmpdir(), 'codeloop-bench-')));

// Deterministic, so two runs compare the same repo.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = list => list[Math.floor(rand() * list.length)];
const WORDS = 'founder agent card lane stage gate approve reject evidence wiki page spec interview mock lock watcher index search cursor etag stream diff release deploy latency memory budget route render hydrate query cache token owner inbox roadmap initiative persona metric'.split(' ');
// A real wiki has thousands of distinct terms, and the search index's size follows the count of
// (term, page) pairs, so the long tail is generated: 3000 extra words, used less often than the core ones.
const SYLLABLES = 'ka te mo ri su lo ve na di po ch sh fa gu hy'.split(' ');
const TAIL = Array.from({ length: 3000 }, (_, i) => Array.from({ length: 2 + (i % 3) }, (_, j) => SYLLABLES[(i * 7 + j * 11) % SYLLABLES.length]).join('') + i);
const word = () => (rand() < 0.5 ? pick(WORDS) : pick(TAIL));
const sentence = n => Array.from({ length: n }, word).join(' ');
const LANES = ['build', 'market', 'support'];
const STAGES = { build: ['research', 'spec', 'implement', 'verify', 'ship'], market: ['draft', 'review', 'publish'], support: ['triage', 'fix', 'close'] };
const PERSONAS = ['founder', 'engineer', 'reviewer', 'customer'];
const INITIATIVES = ['fast-loop', 'self-serve', 'team-scale', 'hosted'];
const FEATURES = ['board', 'wiki', 'inbox', 'cli', 'serve', 'cloud'];

mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: bench\n');
for (const lane of LANES) {
  writeFileSync(
    join(dir, `.codeloop/lanes/${lane}.yaml`),
    `id: ${lane}\nversion: 1\nmetric: { name: shipped, source: cards }\nstages:\n${STAGES[lane].map((s, i) => `  - id: ${s}\n    done: { cmd: "true" }\n${i % 2 ? `    gate: { name: ${s}-ok, approver: owner }\n` : ''}`).join('')}`,
  );
}

const at = i => new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString();
const cards = [];
for (let i = 1; i <= CARDS; i++) {
  const lane = pick(LANES);
  const stages = STAGES[lane];
  const stageAt = Math.floor(rand() * stages.length);
  const stage = i % 10 === 0 ? 'done' : stages[stageAt];
  const id = `c-${String(i).padStart(4, '0')}`;
  const events = [{ at: at(i), actor: 'owner', human: true, action: 'create', stage: stages[0] }];
  for (let s = 1; s <= stageAt; s++) {
    events.push({ at: at(i + s), actor: 'agent', human: false, action: 'advance', stage: stages[s], note: sentence(6) });
    if (s % 2) events.push({ at: at(i + s), actor: 'owner', human: true, action: rand() < 0.8 ? 'approve' : 'reject', stage: stages[s], note: sentence(4) });
  }
  const gate = stage !== 'done' && stageAt % 2 === 1 ? `${stage}-ok` : undefined;
  const withQuestions = rand() < 0.3;
  const spec = withQuestions ? `specs/${String(i).padStart(4, '0')}-card-${i}` : undefined;
  if (spec) {
    mkdirSync(join(dir, spec), { recursive: true });
    writeFileSync(join(dir, spec, 'spec.md'), `# ${id}\n\nscreens:\n  - board\n\n${sentence(40)}\n`);
    writeFileSync(join(dir, spec, 'interview.md'), `## Q1 ${sentence(5)}?\nrecommended: ${sentence(3)}\nanswer: \n\n## Q2 ${sentence(5)}?\nrecommended: ${sentence(3)}\nanswer: ${rand() < 0.5 ? sentence(3) : ''}\n`);
  }
  cards.push({
    id,
    title: `${pick(['Owner', 'Founder', 'Reviewer'])} can ${sentence(5)}`,
    lane,
    laneVersion: 1,
    stage,
    ...(gate ? { gate, awaiting: 'owner' } : {}),
    ...(spec ? { spec } : {}),
    story: { as: pick(PERSONAS), can: sentence(5), so: sentence(4) },
    persona: pick(PERSONAS),
    size: pick(['S', 'M', 'L']),
    initiative: pick(INITIATIVES),
    feature: pick(FEATURES),
    retries: {},
    evidence: [],
    events,
    createdAt: at(i),
    updatedAt: events.at(-1).at,
  });
}
writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify({ version: CARDS, cards }, null, 2));

const FOLDERS = ['gotchas', 'decisions', 'runbooks', 'concepts', 'cards', 'people', 'archive'];
for (const f of FOLDERS) mkdirSync(join(dir, `.codeloop/wiki/${f}`), { recursive: true });
for (let i = 1; i <= PAGES; i++) {
  const folder = pick(FOLDERS);
  const paragraphs = Array.from({ length: 3 + Math.floor(rand() * 4) }, () => sentence(60 + Math.floor(rand() * 60)));
  const title = `${pick(WORDS)} ${pick(WORDS)} ${i}`;
  writeFileSync(join(dir, `.codeloop/wiki/${folder}/page-${i}.md`), `---\ntitle: ${title}\ntags: [${pick(WORDS)}, ${pick(WORDS)}]\n---\n# ${title}\n\n${paragraphs.join('\n\n')}\n`);
}

console.log(dir);
