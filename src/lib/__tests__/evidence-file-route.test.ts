import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createApp } from '../server.js';

// The first bytes of a PNG, enough to tell the served body is the file and not the UI's HTML.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('evidence file route', () => {
  let tmpDir: string;
  let app: ReturnType<typeof createApp>['app'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-evidence-'));
    mkdirSync(join(tmpDir, '.codeloop/lanes'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
    writeFileSync(join(tmpDir, '.codeloop/cards.json'), JSON.stringify({ version: 1, cards: [] }));
    mkdirSync(join(tmpDir, '.codeloop/evidence/048'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/evidence/048/grant dialog.png'), PNG);
    writeFileSync(join(tmpDir, 'secret.txt'), 'outside the evidence folder');
    symlinkSync(join(tmpDir, 'secret.txt'), join(tmpDir, '.codeloop/evidence/048/link.txt'));
    app = createApp(tmpDir, undefined, { token: 'test-token' }).app;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists each file with the url that serves it, and serves a png as image/png', async () => {
    const detail = await (await app.request('/api/evidence/048')).json() as { files: { name: string; url?: string }[] };
    const png = detail.files.find(f => f.name === 'grant dialog.png');
    expect(png?.url).toBe('/api/evidence/048/file/grant%20dialog.png');
    const res = await app.request(png!.url!);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('answers 404 for a path that climbs out, a link that points out, a missing file and a bad folder', async () => {
    // Encoded so the URL parser cannot fold the `..` away before the handler sees it.
    expect((await app.request('/api/evidence/048/file/..%2F..%2Fconfig.yaml')).status).toBe(404);
    expect((await app.request('/api/evidence/048/file/link.txt')).status).toBe(404);
    expect((await app.request('/api/evidence/048/file/missing.png')).status).toBe(404);
    expect((await app.request('/api/evidence/..%2F..%2F/file/config.yaml')).status).toBe(404);
  });
});
