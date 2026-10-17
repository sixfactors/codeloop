import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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
