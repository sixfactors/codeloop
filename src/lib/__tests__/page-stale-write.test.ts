import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ApiError, createHttpClient } from '../../sdk/index.js';
import { closeIndex } from '../index/index.js';
import { createApp } from '../server.js';

let dir: string;
const TOKEN = 'test-token';

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-stale-page-')));
  mkdirSync(join(dir, '.codeloop'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
});
afterEach(async () => {
  await closeIndex(dir);
  rmSync(dir, { recursive: true, force: true });
});

describe('two editors on one page over http', () => {
  it('the second write from the same read is a 409 and the page keeps the first', async () => {
    const { app } = createApp(dir, undefined, { token: TOKEN });
    const client = () => createHttpClient({ token: TOKEN, fetch: (url, init) => app.request(url, init) });
    const alice = client();
    const bob = client();
    const id = '.codeloop/wiki/decisions/shared.md';
    await alice.pages.put(id, { body: '# Shared\n' });

    const read = (await bob.pages.get(id))!.version;
    expect((await alice.pages.get(id))!.version).toBe(read);
    await alice.pages.put(id, { body: '# Shared\n\nalice\n', expectVersion: read });
    const stale = await bob.pages.put(id, { body: '# Shared\n\nbob\n', expectVersion: read }).catch((e: unknown) => e);

    expect(stale).toBeInstanceOf(ApiError);
    expect((stale as ApiError).status).toBe(409);
    expect((await bob.pages.get(id))!.body).toContain('alice');
  });
});
