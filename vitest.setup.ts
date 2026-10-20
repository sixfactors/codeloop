import { mkdtempSync, statSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { afterAll } from 'vitest';

// The real v1 home must not change while a test file runs (c-333): a test that leaks past
// CODELOOP_HOME (a hard-coded ~/.codeloop, a spawned CLI with a scrubbed env) would register a
// fixture project or rewrite the hub record of the production install. mtime and size of the v1
// files are taken before the file's tests and compared after; a change fails the file by name.
// The production board itself is not watched here: other sessions append to it while a suite runs.
const REAL_HOME = join(homedir(), '.codeloop');
const V1_FILES = ['projects.json', 'state/hub.json', 'state/hub-secrets.json'];
const v1Stamp = (): string =>
  V1_FILES.map(f => {
    try {
      const s = statSync(join(REAL_HOME, f));
      return `${f} ${s.mtimeMs} ${s.size}`;
    } catch {
      return `${f} absent`;
    }
  }).join('\n');
const v1Before = v1Stamp();
afterAll(() => {
  const after = v1Stamp();
  if (after !== v1Before) {
    throw new Error(`a test in this file changed the real codeloop home (${REAL_HOME}); v1 files before and after:\n${v1Before}\n---\n${after}`);
  }
});

// Runs once per test file. A fresh CODELOOP_HOME keeps the hub registry and user store of one file
// away from the next and from ~/.codeloop; the sandbox flag makes projectRoot() refuse any root
// outside the temp folder, so a fixture can never land on the real board. Spawned CLIs inherit all
// three. CODELOOP_PROJECT_DIR is left unset: most tests spawn the CLI with a temp cwd and rely on it.
process.env.CODELOOP_HOME = mkdtempSync(join(tmpdir(), 'codeloop-test-home-'));
process.env.CODELOOP_NO_SCHEDULE = '1';
process.env.CODELOOP_TEST_SANDBOX = '1';
// A suite started by a lane check (`npm test` in a stage's done.cmd) inherits the story's own
// variables; they name the real tree, so the fixtures must not see them.
for (const key of ['CODELOOP_WORK_DIR', 'CODELOOP_PROJECT_DIR', 'CODELOOP_STORY_REF', 'CODELOOP_CARD']) delete process.env[key];
// A suite run from an assistant's shell inherits the host's session variables, which the active
// story and host detection read; the suite must not depend on which host runs it.
for (const key of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CURSOR_AGENT', 'CURSOR_CONVERSATION_ID', 'CURSOR_SESSION_ID']) delete process.env[key];
