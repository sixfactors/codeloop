import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { projectRoot } from '../lib/project-root.js';

// The real board of the main tree. If the suite changes it, a test wrote fixtures onto live cards.
const REAL = join(homedir(), 'Projects/codeloop/.codeloop/cards.json');
const hash = () => createHash('sha256').update(readFileSync(REAL)).digest('hex');
let before = '';

describe.skipIf(!existsSync(REAL))('the real board is untouched by the suite', () => {
  beforeAll(() => {
    before = hash();
  });
  afterAll(() => {
    expect(hash()).toBe(before);
  });
  it('is hashed at start and compared at end of this file', () => {
    expect(before).not.toBe('');
  });
});

describe('project root sandbox', () => {
  it('refuses a root outside the temp folder', () => {
    const saved = process.env.CODELOOP_PROJECT_DIR;
    process.env.CODELOOP_PROJECT_DIR = join(homedir(), 'Projects/codeloop');
    try {
      expect(() => projectRoot()).toThrow(/test sandbox: refusing project root/);
    } finally {
      if (saved === undefined) delete process.env.CODELOOP_PROJECT_DIR;
      else process.env.CODELOOP_PROJECT_DIR = saved;
    }
  });
});
