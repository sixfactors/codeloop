import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkLiveWalk, liveWalkRequired } from '../live-walk.js';

let dir: string;
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const walk = (body: string) => write('evidence/001/verify.md', `<!-- codeloop verify: start -->\nresult: pass\n<!-- codeloop verify: end -->\n\n## Live walk\n${body}\n`);

const GOOD = [
  'stack: make up',
  'url: http://localhost:3016/tools',
  'steps:',
  '- opened Tools and saw the three seeded tools',
  '- imported an OpenAPI file and saw the new tool listed',
  'network:',
  '- GET http://localhost:8410/tools 200',
  '- POST https://httpbin.org/post 200',
  'external: https://httpbin.org/post',
].join('\n');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-walk-'));
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [] }));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('live walk', () => {
  it('passes a walk on the real stack with a real external call', () => {
    walk(GOOD);
    expect(checkLiveWalk(dir, '1')).toEqual([]);
  });

  it('fails when verify.md has no live walk section', () => {
    write('evidence/001/verify.md', 'result: pass\n');
    expect(checkLiveWalk(dir, '1')).toEqual([expect.stringMatching(/no `## Live walk` section/)]);
  });

  it('fails a walk whose calls were answered by a mock or a stub', () => {
    walk(GOOD.replace('- GET http://localhost:8410/tools 200', '- GET http://localhost:3016/__mock/tools 200 (browser mock)'));
    expect(checkLiveWalk(dir, '1').join('\n')).toMatch(/name a mock or stub/);
  });

  it('fails a walk run on a test harness instead of the normal dev stack', () => {
    walk(GOOD.replace('stack: make up', 'stack: use-case harness'));
    expect(checkLiveWalk(dir, '1').join('\n')).toMatch(/harness or mock/);
  });

  it('fails when the external call is local, unobserved, or missing without a reason', () => {
    walk(GOOD.replace('external: https://httpbin.org/post', 'external: http://localhost:9000/x'));
    expect(checkLiveWalk(dir, '1').join('\n')).toMatch(/not a public host/);
    walk(GOOD.replace('- POST https://httpbin.org/post 200', '- POST https://httpbin.org/post 504'));
    expect(checkLiveWalk(dir, '1').join('\n')).toMatch(/not among the successful calls/);
    walk(GOOD.replace('external: https://httpbin.org/post', 'external: none'));
    expect(checkLiveWalk(dir, '1').join('\n')).toMatch(/needs the reason/);
    walk(GOOD.replace('external: https://httpbin.org/post', 'external: none: the page only reads our own database'));
    expect(checkLiveWalk(dir, '1')).toEqual([]);
  });

  it('fails without steps or network calls', () => {
    walk('stack: make up\nurl: http://localhost:3016/tools\nexternal: none: reads only our own database');
    const errors = checkLiveWalk(dir, '1').join('\n');
    expect(errors).toMatch(/steps:/);
    expect(errors).toMatch(/network:/);
  });

  it('is on unless config turns it off', () => {
    expect(liveWalkRequired(dir)).toBe(true);
    write('.codeloop/config.yaml', 'verify:\n  live_walk: false\n');
    expect(liveWalkRequired(dir)).toBe(false);
  });
});
