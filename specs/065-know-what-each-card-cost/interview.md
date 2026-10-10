## Q1 Scope: capture and show tokens, dollars and human turns in stats, board and site. Are per-stage budgets or auto-stop in?
recommended: Capture and display only; budgets and auto-stop are a later card.
answer: 

## Q2 Where do token counts come from: Claude Code's session JSONL, the agent printing a usage line, or the `run --agent` wrapper reading SDK usage?
recommended: The `run --agent` wrapper reads SDK usage after each stage and writes `cost:` into the stage event; manual sessions use `codeloop cost add <id> --tokens --usd`.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given three cards shipped through `run --agent`, when `codeloop stats`, then each shows tokens, usd, human turns and the stage with the most spend; the board row shows usd; the site numbers page reads the same file.
answer: 

## Q4 Riskiest assumption: SDK usage is reachable for every host (Claude Code, Codex, Cursor). Which host do we prove on?
recommended: Claude Code only this card; other hosts fall back to manual `cost add` and are listed under Not building.
answer: 

## Q5 Pricing: hard-coded per model or config?
recommended: `pricing:` in `.codeloop/config.yaml` with a shipped default for current Claude models; a stale price is a wiki gotcha, not a bug.
answer: 
