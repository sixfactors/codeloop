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
