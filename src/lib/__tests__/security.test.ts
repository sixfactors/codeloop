import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { readCards, RefusalError } from '../cards.js';
import { advanceCard, createCard } from '../engine.js';
import { loadLane, substitute } from '../lane.js';
import { evalProposal } from '../proposals.js';
import { verify } from '../verify.js';
import { capture } from '../wiki.js';

let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-sec-'));
  write('.codeloop/lanes/t.yaml', 'id: t\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: s\n    output: "{spec}/out.md"\n    done: { cmd: "echo checking {id} in {spec}" }\n');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('placeholders reach a shell', () => {
  it('refuses a card id that is not <letters>-<digits>', () => {
    for (const id of ['c-9;touch PWNED;echo', '../c-1', 'c-1 x', '$(id)-1', 'c_1']) {
      expect(() => createCard(dir, { lane: 't', title: 'x', id }), id).toThrow(RefusalError);
    }
    expect(readCards(dir).cards).toEqual([]);
  });

  it('quotes a hostile value already in the store instead of running it', () => {
    createCard(dir, { lane: 't', title: 'x', id: 'c-1' });
    const file = JSON.parse(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8'));
    file.cards[0].spec = 'specs/x; touch PWNED; echo';
    file.cards[0].id = "c-1'; touch PWNED2; echo '";
    writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify(file));

    const result = advanceCard(dir, file.cards[0].id);
    expect(result.output).toContain('specs/x; touch PWNED; echo');
    expect(existsSync(join(dir, 'PWNED'))).toBe(false);
    expect(existsSync(join(dir, 'PWNED2'))).toBe(false);
  });

  it('leaves plain values unquoted, so paths built around a placeholder still work', () => {
    expect(substitute('test -f {spec}/a.md && echo {id} {nnn}', { id: 'c-7', spec: 'specs/007-x' }, { shell: true })).toBe('test -f specs/007-x/a.md && echo c-7 007');
  });
});

describe('names used as path components', () => {
  it('refuses a lane, proposal or use-case id that could leave its folder', async () => {
    expect(() => loadLane(dir, '../../etc/passwd')).toThrow(RefusalError);
    expect(() => evalProposal(dir, '../../x')).toThrow(RefusalError);

    write('specs/001/spec.md', 'acceptance:\n- US1 Given a, when b, then c.\n');
    write('usecases/001/uc.yaml', 'id: ../../escaped\naccept: US1\nlayers:\n  cli: { run: "true" }\n');
    await expect(verify(dir, '001')).rejects.toThrow(RefusalError);
    expect(existsSync(join(dir, 'escaped.json'))).toBe(false);
  });

  it('refuses a wiki title that yields no file name', () => {
    expect(() => capture(dir, { title: '../..', scope: [], body: 'x' })).toThrow(RefusalError);
  });
});
