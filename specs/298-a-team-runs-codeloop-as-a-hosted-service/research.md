# c-298 research: A team runs codeloop as a hosted service and every developer's repo plugs in

## What exists

exists: unlock — the hub (`src/lib/hub.ts`), the http SDK transport (`src/sdk/http.ts`), the version-checked store (`src/lib/store/`) and a board sync to a remote workspace (`src/lib/cloud.ts`) are built; none is exposed as a multi-user hosted service. Accounts, a secret store, runners and webhooks are absent: build.

## How others host it

| Source | Hosting model |
|---|---|
| Devin (Cognition) | Fully hosted: each session runs in a cloud machine with the repo cloned; the developer talks to it in a web app or Slack. Architecture B. Source: https://docs.devin.ai |
| OpenAI Codex cloud | Tasks run in cloud sandboxes with the repo preloaded, setup script and internet policy per environment; results return as diffs and PRs. Architecture B. Source: https://developers.openai.com/codex/cloud |
| GitHub Copilot coding agent | Runs inside GitHub Actions on a runner the team already pays for, started by assigning an issue, working on a branch and opening a PR. B, with GitHub as the identity, secrets and audit layer. Source: https://docs.github.com/en/copilot/concepts/agents/coding-agent |
| Cursor background agents | Remote machines per agent cloned from GitHub, started from the editor and handed back as a branch; the editor stays local. Closest to C. Source: https://docs.cursor.com/background-agent |
| Sweep | A GitHub app: an issue labelled for it becomes a PR, all work on the vendor's side. B with a webhook front door. Source: https://github.com/sweepai/sweep |

## Options

- A first: cheapest, reuses the hub, and tests whether teams want the shared board; cannot run work for a laptop that is closed.
- B is what every vendor above sells, and also what takes the most to build and secure.
- C keeps keys local, as Cursor does with the editor, and adds a queue to build.

## Risks

- Hosting model keys is a liability codeloop avoids under A and C.
- Two writers on one card; the store's version check turns that into a refusal, not a merge.

## Sources

- source: src/lib/hub.ts — one process, many projects, each in its own context
- source: src/sdk/http.ts:10 — baseUrl, token and project options
- source: src/lib/cloud.ts — board sync with conflict copies
- source: src/lib/store/README.md — versions and ConflictError

verdict: unlock (A first; B and C stay options)
