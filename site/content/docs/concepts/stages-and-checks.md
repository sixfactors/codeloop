---
title: Stages and checks
description: A stage is done when a command exits 0. Not when a model says so.
---

## The check is a command

Each stage in a lane carries `done: { cmd: "..." }`. The engine runs that command from the project root. Exit 0 moves the card to the next stage. Any other exit is a failure, counted toward the lane's `retries`, with the command's output written to the card as an event and into the next brief.

That is the whole rule. An agent can write "all tasks complete" at the bottom of a file, and the card does not move, because `codeloop task check 001 --all-done` reads the checkboxes.

## The brief an agent gets

`codeloop brief <card>` prints what an agent is given for the current stage: the check it must satisfy, the feedback from the last failure or rejection, the skill text, the wiki pages that apply, and the rules. The first part of a real brief:

```text
# Stage brief: c-001 research

Card: c-001
Title: Export invoices as CSV
Lane: build (version 1)
Stage: research
Skill: design
Output: specs/001-export-invoices-as-csv/research.md

## The check that must pass

The stage is finished when this command, run from the project root, exits 0. It judges specs/001-export-invoices-as-csv/research.md, which this stage writes:

    codeloop check research c-001 --min-sources 3

## Feedback on this stage

The check last failed with:

    specs/001-export-invoices-as-csv/research.md has no line starting with "verdict:"
    specs/001-export-invoices-as-csv/research.md cites 0 sources, needs 3 (`- source: <url> — <note>`)
```

And the last part, the rules every brief ends with:

```text
## Rules

- Do only the research stage of c-001.
- Write the output to specs/001-export-invoices-as-csv/research.md.
- Do not run `codeloop approve`, `codeloop next` or `codeloop card advance`. The run that started you checks the work and moves the card.
- Do not edit .codeloop/cards.json or anything in .codeloop/lanes/.
- Stop when the output is written.
```

## The check helpers

Any command works as a check: `npm test`, `make smoke`, a script. The CLI ships helpers for the common cases, all under `codeloop check` and its relatives.

| Command | Exit 0 when |
|---|---|
| `check file <path> --has <str...>` | The file exists, is not empty, and contains every string. The shipped lanes use this for most evidence files: `--has 'result: pass'`, `--has 'verdict:'`, `--has 'url:'`. |
| `check research <card> --min-sources <n> [--online]` | `research.md` has a `verdict:` line and at least n `- source: <url> — <note>` lines. `--online` also requires each URL to answer 2xx or 3xx. |
| `check mock <card>` | The card's mock is built from the shared template, keeps its tokens, uses no other colours and draws every screen the spec names. `screens: none` in the spec passes. |
| `check story <card>` | The card meets the story standard. |
| `check gotchas --files <path...> [--ack <title...>]` | No critical wiki page applies to these files without being acknowledged. |
| `spec check <nnn>` | Every task has a layer tag and every acceptance line has a task. Exit 2 otherwise. |
| `task check <nnn> [--all-done]` | No task is open. |
| `verify <nnn>` | Every acceptance line has a use case and every use case passed. Writes evidence. |
| `gate check <id> --require <gate>` | The card has an approval for that gate. For CI. Exit 2 otherwise. |

## Verify writes evidence

`codeloop verify <nnn>` reads `usecases/<nnn>/*.yaml`. A use case names the acceptance line it covers, the failure mode it guards, and how to run it per layer:

```yaml
id: uc-001-01
accept: US1
failure_mode: "a failing check moves the card anyway, or never parks it"
layers:
  cli: { run: "bash usecases/001/uc.sh us1", expect: { exit: 0, stdout: "stays-then-stuck" } }
```

The `cli` layer runs a command and compares exit code and stdout. The `api` layer makes an HTTP request against `deploy.<env>.base_url` from `config.yaml` and compares the status. `verify` writes `evidence/<nnn>/verify.md` with the result, the commit SHA and one row per use case, and records it on the card. The build lane's local gate reads that file.

```text
# Verify c-006

result: pass
sha: e4fcafedc23dc67e42694af96e22a76248582eb8
env: local

| Use case | Accepts | Layers |
|---|---|---|
| uc-1 | US1 | cli pass |
```

Exit codes: 2 when there is nothing to verify or an acceptance line has no use case, 1 when a use case failed.

## A check that cannot fail is worse than none

`verify --mutate` checks out the commit before the feature, builds it, and runs the use cases again. A use case that still passes is vacuous, and `verify` exits 4. `lane eval` refuses a proposal that changes a check without a fixture that fails under it. The [founder's week](/docs/start/founders-week) has an eval run with its `expected fail, got fail` line.

## Retries and stuck

Three failures on one stage, in the shipped lanes, park the card as stuck. On an unattended run the engine fingerprints the stage's output file (or the working tree, for a stage with no output file) and does not re-run a check when nothing changed since the last failure, so a scheduled run does not burn three retries on one broken file.

## Where the skills come from

The `skill:` on a stage names a file in the skills index. `codeloop init` writes ten and indexes them; `codeloop adopt` indexes the skills and commands a repo already has so lanes can name those too. `codeloop render` turns every lane stage into a host-specific agent, rule or skill file. [Hosts](/docs/hosts) shows the output.
