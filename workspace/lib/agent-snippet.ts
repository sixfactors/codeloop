// The agents block from the starter configs, shown wherever "Run this stage" needs one. No secret
// belongs here: the agent command reads its own login.
export const AGENT_SNIPPET = `agents:
  default: claude
  claude:
    cmd: "claude -p --permission-mode acceptEdits < {brief}"
    timeout_minutes: 20
    max_runs_per_day: 20
  codex:
    cmd: "codex exec - < {brief}"`;
