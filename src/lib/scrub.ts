import { realpathSync } from 'fs';
import { homedir, tmpdir } from 'os';

// Cursor moves and erase codes as well as colours: vitest and tsc print `[2K` and `[1G` too.
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

function realOr(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Tool output as it may be written into a tracked file: the temp folder reads `<temp dir>`, the
 * home folder `~`, and terminal codes are gone. The repo is public, and a home path or a macOS
 * `/private/var/folders/...` path names the machine and changes on every run.
 */
export function scrubOutput(text: string): string {
  const strip = (p: string) => p.replace(/\/+$/, '');
  // The temp folder first: on Linux it can sit under the home folder, and on macOS the real path
  // (/private/var/...) is longer than the one tmpdir() returns (/var/...), so it goes first too.
  const temps = [...new Set([strip(realOr(tmpdir())), strip(tmpdir())])].filter(p => p.length > 1);
  const homes = [...new Set([strip(realOr(homedir())), strip(homedir())])].filter(p => p.length > 1);
  let out = text.replace(ANSI, '');
  for (const t of temps) out = out.split(t).join('<temp dir>');
  for (const h of homes) out = out.split(h).join('~');
  return out;
}
