// The hook daemon's own entry, started by `codeloop hookd` with lean V8 flags. It skips the CLI
// shell (commander, the preAction hook) because a request already runs the guard functions itself.
import { writeFileSync } from 'fs';
import { hookdSocket, serveHookd } from './lib/hookd.js';

const minutes = Number(process.argv[2] ?? '10');
// The pid file lets a test or `codeloop ps` find the daemon without parsing the process table.
writeFileSync(`${hookdSocket()}.pid`, String(process.pid));
await serveHookd({ idleMs: minutes * 60_000 });
