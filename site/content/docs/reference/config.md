---
title: Config
description: The keys in .codeloop/config.yaml that codeloop 0.4.1 reads, and the local.yaml overlay.
---

## Two files

`.codeloop/config.yaml` is committed and shared. `.codeloop/local.yaml` is gitignored, never synced to the cloud, and laid over `config.yaml` key by key: a map in `local.yaml` merges with the shared one, a list or a plain value replaces it. Put agent commands, machine paths and anything secret there.

`codeloop config get <dotted.path>` prints one value with the overlay applied, or nothing when it is unset. The CI templates use it: `codeloop config get deploy.staging.command`.

## Keys the CLI reads

| Key | Default | Read by |
|---|---|---|
| `project.name` | the folder name | Mock paths, status output. |
| `personas` | founder, builder, reviewer, dev, visitor, team | The story check. A list of names, a list of `{ name, pains }`, or a map keyed by name. |
| `agents.default` | the only agent, when one is configured | `run --agent` with no name. |
| `agents.<name>.cmd` | required | Shell command run in the project directory. `{brief}` becomes the shell-quoted path of the stage brief. |
| `agents.<name>.timeout_minutes` | 20 | The agent and its children are killed after this. |
| `agents.<name>.max_runs_per_day` | 20 | Starts of this agent across the project in any 24 hours. |
| `run.agent` | false | `true` makes plain `codeloop run` start agents. `--no-agent` turns it off for one run. |
| `lanes.auto_start` | false | A finishing lane's own `on_done: { start }` actually starts the next card. Off, a done card only announces what it would start. A downstream lane's own `trigger: { on: lane.done }` is a separate mechanism and fires either way. |
| `gates.mode` | `all` | `trusted` auto-approves gates that come after a check. Outward gates still park on entry. |
| `capacity.gates_per_day` | unset | `start` and `card new` are refused while this many cards are waiting on you. Proposals do not count. |
| `deploy.<env>.command` | unset | The CI workflows run it for staging and production. |
| `deploy.<env>.base_url` | unset | `verify --env <env>` sends api-layer use cases here. |
| `verify.setup` | `npm ci && npm run build` | What `verify --mutate` runs on the old commit before re-running use cases. |
| `codeloop.critical_frequency` | 3 | A wiki page at this frequency becomes critical. |
| `codeloop.promote_frequency` | 10 | A wiki page at this frequency is copied into `rules.md`. |
| `store.driver` | `file` | Where cards, lanes, wiki and evidence are read from. Only `file` ships. |

## Keys the skills read

The ten skill files that `init` writes are prompts, and they read these keys when a host runs them. The CLI does not enforce them.

| Key | Used by |
|---|---|
| `scopes.<name>.paths`, `gotcha_sections`, `pattern_sections` | `/commit` maps changed files to scopes and loads only those sections of `gotchas.md` and `patterns.md`. |
| `quality_checks.<scope>[]` with `name` and `command` | `/commit` runs them; a non-zero exit is a critical finding. `codeloop status` warns when none are defined. |
| `diff_scan[]` with `pattern`, `files`, `exclude`, `severity`, `message` | `/commit` searches the diff. |
| `test.command`, `coverage_threshold`, `integrity_checks` | `/test` and `/qa`. |
| `deploy.staging.verify`, `deploy.production.verify`, `deploy.production.requires` | `/deploy` and `/ship`. |
| `debug.logs`, `debug.health` | `/debug`. |
| `commit.types`, `commit.format` | `/commit` builds the message. |
| `watch.*` | `codeloop watch`: `enabled`, `idle_timeout`, `signals.*`, `ignore`. |

## A working example

The generic starter, with the agent block filled in:

```yaml
project:
  name: "exportly"

personas:
  - founder
  - accountant

scopes:
  all:
    paths: ["**/*"]
    gotcha_sections: []
    pattern_sections: []

quality_checks:
  all:
    - name: "Typecheck"
      command: "npx tsc --noEmit 2>&1 | tail -20"

commit:
  types: [feat, fix, refactor, docs, test, chore, perf]
  format: "type(scope): message"

deploy:
  staging:
    command: "make deploy-staging"
    base_url: "https://staging.exportly.example"
  production:
    command: "make deploy-prod"

agents:
  default: claude
  claude:
    cmd: "claude -p --permission-mode acceptEdits < {brief}"
    timeout_minutes: 20
    max_runs_per_day: 20
run:
  agent: true

codeloop:
  critical_frequency: 3
  promote_frequency: 10
  max_knowledge_lines: 200
```

Starters for `node-typescript`, `python` and `go` fill in scopes and quality checks for that stack; `init` picks one from the files it finds, or takes `--starter`.
