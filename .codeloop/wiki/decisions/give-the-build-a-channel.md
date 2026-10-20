---
title: Give the build a channel
scope:
  - src/lib/hub-registry.ts
  - src/lib/hub-state.ts
  - src/lib/hookd.ts
  - src/commands/hub.ts
  - src/lib/schedule.ts
  - vitest.setup.ts
  - scripts/check-frozen.sh
  - dist/index.js
  - docs/artifacts/codeloop/cloud/c-321-implementation-plan.html
  - src/lib/version.ts
freq: 1
severity: warning
cards:
  - c-332
updated: 2026-10-20
---

## Options

- Give the build a channel: `dist/channel.json` saying `stable` is written only by the release pack, so a tree build with no channel file is `next`; `next` defaults the home to `~/.codeloop-next`, refuses a `CODELOOP_HOME` equal to the v1 home, keeps every state path under `<home>/v2`, listens on its own default port, writes `major` and `channel` into its hub record and refuses to adopt one without `major: 2`, tags its crontab lines by channel and never edits a line with another tag, and is reached as `codeloop-next` through a shim written beside the global `codeloop`. Chosen. Every surface a v1 process shares with a v2 process (home, hub record, socket, crontab, PATH name, MCP name) gets a value that differs by channel, and the default for a tree build is the safe one, so forgetting to configure anything cannot reach v1.
- One binary and one home, told apart by an environment variable (`CODELOOP_CHANNEL=next`) with no second command name. Rejected: a hook line, a cron line or an MCP entry that forgets the variable runs against the v1 home without saying so, and the name on PATH is what a person types and what `.mcp.json` and the crontab record. The failure is silent exactly where it is most costly.
- Publish v2 as a second npm package (`@protoboxai/codeloop-next`) with its own bin. Rejected for v2.0: it doubles the package, the site and the install docs for a phase that ends when v2 becomes `codeloop`; a shim beside the global `codeloop` that points at the checkout's dist gives the same name with no second package, and the release pack later writes `channel.json` as `stable` and the shim goes away.

## Why

a builder (persona builder) developing v2 in the checkout has no way to run or test the build that cannot also write the record, hub and schedule the production project runs on: `codeloopHome()` in `src/lib/hub-registry.ts` (line 23) resolves to `~/.codeloop` for every build, and `scripts/check-frozen.sh` run on 2026-10-20 found a checkout `dist/index.js` process writing a hand-back onto ops-ai's board and the shared hub running from the checkout. Source: `src/lib/hub-registry.ts`, `scripts/check-frozen.sh` and the 10-18 plan story S0.3 in `docs/artifacts/codeloop/cloud/c-321-implementation-plan.html`.

## Consequences

Give the build a channel: `dist/channel.json` saying `stable` is written only by the release pack, so a tree build with no channel file is `next`; `next` defaults the home to `~/.codeloop-next`, refuses a `CODELOOP_HOME` equal to the v1 home, keeps every state path under `<home>/v2`, listens on its own default port, writes `major` and `channel` into its hub record and refuses to adopt one without `major: 2`, tags its crontab lines by channel and never edits a line with another tag, and is reached as `codeloop-next` through a shim written beside the global `codeloop`. Every surface a v1 process shares with a v2 process (home, hub record, socket, crontab, PATH name, MCP name) gets a value that differs by channel, and the default for a tree build is the safe one, so forgetting to configure anything cannot reach v1. The other options are not built; reopening one is a new decision.
