import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { checkDataModel, NO_DATA_CHANGE } from '../data-model.js';

let dir: string;
const spec = (name: string, text: string) => writeFileSync(join(dir, 'specs/001-x', name), text);

const PAGE = `# Data model\n\n| Entity | Where it lives |\n|---|---|\n| Card | \`.codeloop/cards.json\` |\n| Lane | \`.codeloop/lanes/*.yaml\` |\n`;
const MODEL = (store: string, migration = 'none, the file is created on first write') => `# Data model\n\n## Entities\n- Card: id, stage\n\n## Stores\n- Card: \`${store}\`\n\n## Indexes\nnone\n\n## Migration\n${migration}\n`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-data-model-'));
  mkdirSync(join(dir, '.codeloop/wiki/architecture'), { recursive: true });
  mkdirSync(join(dir, 'specs/001-x'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify({ version: 1, cards: [] }));
  writeFileSync(join(dir, '.codeloop/wiki/architecture/data-model.md'), PAGE);
  spec('spec.md', '# Story\n\nentities: Card\n');
  spec('tasks.md', '- [ ] T001 [US1] [api] wire it in `src/lib/x.ts`\n');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('check data-model', () => {
  it('passes with the trivial message when there are no entities and no [data] tasks', () => {
    spec('spec.md', '# Story\n');
    expect(checkDataModel(dir, 'c-001')).toEqual({ problems: [], message: NO_DATA_CHANGE });
  });

  it('fails naming the file when entities exist and data-model.md does not', () => {
    expect(checkDataModel(dir, 'c-001').problems).toContain('specs/001-x/data-model.md is missing');
  });

  it('passes when the store is one the architecture page names', () => {
    spec('data-model.md', MODEL('.codeloop/cards.json'));
    expect(checkDataModel(dir, 'c-001').problems).toEqual([]);
  });

  it('fails naming a store the architecture page does not name', () => {
    spec('data-model.md', MODEL('.codeloop/widgets.sqlite'));
    expect(checkDataModel(dir, 'c-001').problems).toEqual([
      'store .codeloop/widgets.sqlite is not in the architecture data-model page; add it there in this story or use one it names',
    ]);
  });

  it('fails when the Migration section is missing', () => {
    spec('data-model.md', MODEL('.codeloop/cards.json').replace(/## Migration[\s\S]*/, ''));
    expect(checkDataModel(dir, 'c-001').problems).toEqual(['specs/001-x/data-model.md has no ## Migration section']);
  });

  it('fails a [data] task whose file the page does not list, with no entities named', () => {
    spec('spec.md', '# Story\n');
    spec('tasks.md', '- [ ] T001 [US1] [data] add a column in `db/schema.sql`\n');
    spec('data-model.md', MODEL('.codeloop/cards.json'));
    const problems = checkDataModel(dir, 'c-001').problems;
    expect(problems.some(p => p.includes('db/schema.sql'))).toBe(true);
  });
});
