import { describe, it, expect, afterEach } from 'vitest';
import { execFile } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { promisify } from 'util';
import { readCards } from '../cards.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CARDS = pathToFileURL(join(HERE, '../../../dist/lib/cards.js')).href;
const run = promisify(execFile);
let dir: string;

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('concurrent writers', () => {
  it('never reports a write as successful that is not on disk', async () => {
    dir = mkdtempSync(join(tmpdir(), 'codeloop-concurrent-'));
    const writers = ['a', 'b', 'c', 'd', 'e', 'f'].map(name => run(process.execPath, [join(HERE, 'fixtures/writer.mjs'), CARDS, dir, name, '40']));
    const reported = (await Promise.all(writers)).flatMap(r => JSON.parse(r.stdout) as string[]);

    const file = readCards(dir);
    const onDisk = new Set(file.cards.map(c => c.id));
    expect(reported.length).toBeGreaterThan(0);
    expect(reported.filter(id => !onDisk.has(id))).toEqual([]);
    expect(file.cards).toHaveLength(reported.length);
    expect(file.version).toBe(reported.length);
    expect(readdirSync(join(dir, '.codeloop')).filter(f => f.endsWith('.lock') || f.endsWith('.tmp'))).toEqual([]);
    expect(existsSync(join(dir, '.codeloop/cards.json'))).toBe(true);
  }, 60_000);
});
