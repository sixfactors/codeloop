---
title: You already have a project
description: A repo with CI, a ticket tracker, your own slash commands and an open branch. What init touches, what it leaves alone, and the one folder the verify stage needs.
---

The first three Start pages use an empty repo. This page is for a repo that already has history, CI, tickets and your own commands. Everything below was run on 2026-10-08 against a stand-in repo (`acme-app`: a `package.json` with `test`, `build` and `lint` scripts, a `.github/workflows/ci.yml`, two commands under `.claude/commands/`) with codeloop from the current branch. Outputs are pasted from that run.

## What init writes, and what it leaves alone

```sh
codeloop init --tools claude
```

```text
  No specific stack detected, using generic config
  Detected scripts.test, scripts.lint, scripts.build in package.json (npm)
  ~ .claude/commands/ left alone (pass --yes to write into it)

Initializing codeloop...
  Tools: claude | Stack: Generic project

  quality_checks from package.json: Lint (npm run lint), Build (npm run build)
  Created:
    + .codeloop/lanes/analyze.yaml
    + .codeloop/lanes/build.yaml
    + .codeloop/lanes/deploy.yaml
    + .codeloop/lanes/learn.yaml
    + .codeloop/lanes/market.yaml
    + .codeloop/lanes/plan.yaml
    + .codeloop/lanes/scan.yaml
    + .codeloop/lanes/triage.yaml
    + .codeloop/rules.md
    + .codeloop/gotchas.md
    + .codeloop/patterns.md
    + .codeloop/principles.md
    + .codeloop/board.json
    + .codeloop/.gitignore
    + .codeloop/config.yaml

Done.

  8 lanes in .codeloop/lanes/, 39 skills indexed in .codeloop/skills.index.yaml.
  codeloop serve opens the board in a browser.

  Next, type:
    codeloop start "<your feature>"
    codeloop inbox
```

Four things to know from that output:

- **A `.claude/commands/` folder with files in it is left alone.** Nothing is written next to your commands unless you pass `--yes`. With `--yes`, the ten shipped commands go in and a file that already exists is kept and listed under `Skipped (already exist):` with a `~`; the repo above keeps its own `/test`. `CLAUDE.md`, your workflows and your `package.json` are not touched, and only `.codeloop/` is new in `git status`.
- **Scripts in `package.json` become quality checks.** `scripts.lint` and `scripts.build` are written to `quality_checks:` in `config.yaml`. The test command in `config.yaml` stays commented out; the build stage runs `npm test` from `.codeloop/lanes/build.yaml` whatever the config says, so change that line for another runner.
- **Stack detection reads one file.** `tsconfig.json` means TypeScript; `pyproject.toml`, `setup.py`, `requirements.txt` or `Pipfile` means Python; `go.mod` means Go. A `package.json` on its own is "Generic project". `--starter node-typescript` picks the Node starter without a `tsconfig.json`.
- **Your own commands are indexed.** The 39 skills are the bundled ones plus the two under `.claude/commands/` it found; with `--yes` it is 48. `grep fix-ticket .codeloop/skills.index.yaml` shows yours as `kind: command`.

There is no flag to skip one of the ten commands. Delete what you do not want after `init --yes`; `codeloop update` does not bring a deleted file back, it lists it as `not installed` and refreshes only the skill files that exist with an older version comment. `init --hooks` and `init --ci github` write only the hook and only the workflows.

## Tickets from Linear, Jira or GitHub

A card title has to say what the user can now do, so a ticket-style title is refused:

```sh
codeloop start "ACME-412: add CSV export endpoint to /invoices" --size S
```

```text
refused: title carries ":", "/": name what the user can now do, not the mechanism (--force overrides)
```

Two ways in. `--force` keeps the ticket title as it is, and the card carries it everywhere, including the spec folder name:

```sh
codeloop start "ACME-412: add CSV export endpoint to /invoices" \
  --persona dev --can "download every invoice as one CSV" --so "I stop exporting by hand" --size S --force
```

```text
created c-001 in build at stage research (specs/001-acme-412-add-csv-export-endpoint-to-invo/)
Next: run the /design skill to write specs/001-acme-412-add-csv-export-endpoint-to-invo/research.md, then `codeloop next c-001`.
```

Or retitle by what the user gets and keep the ticket link on the card with `--source`. For an idea that nobody should start yet, `card propose` puts it in the inbox instead of a lane:

```sh
codeloop card propose build "Rate-limit the invoices API" \
  --persona dev --can "call the invoices API without a spike taking it down" \
  --so "one client cannot block the rest" --size S \
  --source "https://linear.app/acme/issue/ACME-413"
```

```text
proposed c-003 for build: Rate-limit the invoices API
Next: `codeloop approve c-003` puts it in the build lane, or `codeloop reject c-003 "<why not>"` drops it.
```

The inbox then shows `proposed from https://linear.app/acme/issue/ACME-413` under the card. There is no Linear, Jira or GitHub Issues importer; `codeloop import` reads Spec Kit and BMAD folders only. A `ticket:` field on the card is <span class="planned">planned</span>; today the link lives in `--source` and the id in the title.

## Your own slash commands in a lane

`init` indexed the commands under `.claude/commands/`, so a lane can name them. This lane runs `/api-contract` and then `/fix-ticket`, with your own `npm test` as the second stage's check and a gate after it:

```sh
cat > .codeloop/lanes/contract.yaml <<'EOF'
id: contract
version: 1
metric: { name: cycle_time_days, source: cards, target: "<2" }
trigger: { manual: true }
wip: 2
retries: 3
stages:
  - id: contract
    skill: api-contract
    output: "{spec}/contract.md"
    done: { cmd: "codeloop check file {spec}/contract.md --has 'mismatches:'" }
  - id: fix
    skill: fix-ticket
    done: { cmd: "npm test" }
    gate: { name: fixed, approver: owner }
EOF
codeloop lane lint
codeloop card new contract "Invoices API matches its OpenAPI file" \
  --persona dev --can "trust that every invoices route matches openapi.yaml" \
  --so "clients stop breaking on undocumented fields" --size S
```

```text
  9 lanes ok
created c-001 in contract at stage contract (specs/001-invoices-api-matches-its-openapi-file/)
Next: run the /api-contract skill to write specs/001-invoices-api-matches-its-openapi-file/contract.md, then `codeloop next c-001`.
```

`codeloop brief c-001` prints the stage brief an agent gets: the check command, then your command's text verbatim under `## Skill: api-contract`, then the rules (write only the output file, never approve or advance). A command you add later is picked up by `codeloop adopt`, which rebuilds the index. [Lanes](/docs/concepts/lanes) has the lane file reference.

## The usecases folder the verify stage needs

The build lane's verify stage runs `codeloop verify`, and the Start pages stop before it. With nothing under `usecases/`, the stage fails:

```sh
codeloop next c-002
```

```text
  acceptance line US1 has no use case in usecases/
c-002 failed the verify check (1 so far)
Next: acceptance line US1 has no use case in usecases/. The /qa skill produces evidence/002/verify.md. Then `codeloop next c-002`.
```

One file per acceptance line, under the card's number. The smallest one runs your existing test command:

```sh
mkdir -p usecases/002
cat > usecases/002/uc-001.yaml <<'EOF'
id: uc-002-01
accept: US1
failure_mode: "the export is empty or the test suite is skipped"
layers:
  cli: { run: "npm test", expect: { exit: 0 } }
EOF
codeloop next c-002
```

```text
c-002 is waiting for you at verify (gate local, owner approves)
Next: read evidence/002/verify.md, then `codeloop approve c-002`, or `codeloop reject c-002 "<what to change>"`.
```

`evidence/002/verify.md` now holds `result: pass`, the commit SHA, and one row per use case. `accept:` names the acceptance line in `spec.md`; `failure_mode:` is the sentence that says what the check guards; `expect:` can also carry `stdout:`. [Stages and checks](/docs/concepts/stages-and-checks) has the `api` layer and `verify --mutate`.

After `init` and one card, the repo root has four new folders: `.codeloop/`, `specs/`, `usecases/`, `evidence/`.

## CI you already have, and the Feature trailer

`codeloop init --ci github` writes three workflows next to yours and does not read yours. `codeloop-pr.yml` runs `npm ci`, `npm run build`, `npm test`, `codeloop lane lint`, and then a step named "Every commit carries a Feature trailer" that fails the PR if any commit on the branch has no `Feature: <card-id>` trailer. `codeloop-staging.yml` does nothing until `deploy.staging.command` is set in `config.yaml`. `codeloop-prod.yml` runs on a `v*` tag under the `production` environment.

The trailer comes from the commit-msg hook, installed by `codeloop init --hooks`. It adds `Feature: <id>` when the branch name contains an id shaped like `c-012` or `ACME-412` and the message has none. Verified on two branches:

```sh
git checkout -q -b feat/ACME-412-csv-export && git commit -q --allow-empty -m "add export" && git log -1 --format=%B
git checkout -q -b feat/csv-export-no-id && git commit -q --allow-empty -m "add more" && git log -1 --format=%B
```

```text
add export

Feature: ACME-412

add more
```

So a branch opened before `init`, with no id in its name, gets no trailer and its existing commits have none either; the PR workflow would fail it. Three fixes, pick one: add the trailer to the open commits (`git rebase -i` with `git interpret-trailers`), rename the branch to carry the ticket id before the next commit, or delete the trailer step from `codeloop-pr.yml` if you do not want the link between commits and cards. If your own `ci.yml` already runs the tests, delete the duplicate `npm test` line from `codeloop-pr.yml` too; `lane lint` and the trailer step are the parts your CI does not have.

## Turning the follow-on lane off

When a build card reaches done, the engine starts a card in the market lane:

```text
c-002 done
started c-004 in market
Next: nothing left on this card. `codeloop inbox` shows what else is waiting.
```

Two lines cause that, and both have to go. `.codeloop/lanes/build.yaml` ends with `on_done: { start: market }`, and `.codeloop/lanes/market.yaml` has `trigger: { on: lane.done, lane: build }`; either one alone starts the card. Remove the `on_done` line and set the market trigger to `manual: true`:

```sh
perl -ni -e 'print unless /^on_done:/' .codeloop/lanes/build.yaml
perl -pi -e 's/^trigger: \{ on: lane.done, lane: build \}/trigger: { manual: true }/' .codeloop/lanes/market.yaml
codeloop lane lint
codeloop lane list
```

```text
  8 lanes ok
  analyze    v1  pull → compare → judge → findings  cron 0 9 * * FRI
  build      v1  research → mock → spec → build → verify → review → staging → live  manual
  deploy     v1  staging → verify → prod → smoke  on git.tag
  learn      v1  capture → bump → promote  manual
  market     v1  brief → draft → publish → measure  manual
  plan       v1  gather → research → rank → story  cron 0 9 * * MON
  scan       v1  scan  cron 0 7 * * MON
  triage     v1  capture → classify → dedupe → file  cron 0 20 * * *
```

The cron lanes (analyze, plan, scan, triage) only run when `codeloop run --agent` is on a schedule; nothing starts on its own in a repo where you only type commands.

Next: [Initiatives, epics, features and priority](/docs/concepts/initiatives-epics-features-and-priority), for where a card sits once there are more than a few.
