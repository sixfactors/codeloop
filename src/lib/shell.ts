import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';

const shims = new Map<string, string>();

// Lane checks call `codeloop check ...`. The CLI is often run via npx or a local build and is not
// on PATH, so checks run with a shim that points back at the entry script of this process.
// The shim goes first on PATH, so its directory must be one nobody else can write to: mkdtemp
// gives a fresh 0700 directory with an unguessable name, removed when this process exits.
export function checkEnv(entry: string | undefined = process.argv[1]): NodeJS.ProcessEnv {
  if (!entry) return { ...process.env, CODELOOP_NO_SYNC: '1' };
  let dir = shims.get(entry);
  if (!dir) {
    dir = mkdtempSync(join(tmpdir(), 'codeloop-shim-'));
    const shim = join(dir, 'codeloop');
    writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${entry}" "$@"\n`);
    chmodSync(shim, 0o700);
    if (shims.size === 0) process.on('exit', () => shims.forEach(d => rmSync(d, { recursive: true, force: true })));
    shims.set(entry, dir);
  }
  // The command that started this check or agent has already synced with the cloud.
  return { ...process.env, CODELOOP_NO_SYNC: '1', PATH: `${dir}${delimiter}${process.env.PATH ?? ''}` };
}
