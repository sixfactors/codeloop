---
title: Deploy without a surprise
description: Tag a release and let an agent stage and verify it, with nothing reaching production until you approve that step.
---

## The problem

A release goes to production while you are looking elsewhere, or you hold it back because you do not trust that staging was tested. Either way you cannot say afterwards what was checked before it went out.

## Without codeloop

You tag the release, run the staging deploy by hand, run the checks you remember and then run the production deploy. If an agent does any of it for you, the steps run in one go, and the production step is not distinguishable from the staging step. The record of what passed is a chat log. When the release fails, you reconstruct the order of events from memory.

## With codeloop

The deploy lane starts on a git tag. Its stages are staging, verify, prod and smoke, and each stage is done only when its check exits 0: a file for the stage has to exist and say `result: pass`. The prod stage has an outward gate. An outward gate parks the card before the stage runs, so no agent starts and no check runs until you approve. A tag such as `v0.1.0` creates the card:

```text
      15:35  created c-008 in deploy (trigger: git.tag v0.1.0)
      15:35  c-008: agent fake ran staging
      16:05  c-008: agent fake ran verify
      16:05  c-008: waiting for you
  ok   deploy did staging and verify, then stopped on entering prod
  ok   nothing was released: the prod step has not run and no agent was started for it
```

`codeloop inbox` shows the card with the note that the check has not run yet, because the stage has not. When you approve, the prod stage runs, and then the smoke stage tests what was released:

```sh
codeloop approve c-008 --as owner
```

The `--as owner` role matters outside a terminal: from a script or CI an agent has no right to approve. In CI, `codeloop gate check <id> --require prod` exits 2 unless the card has an approval for that gate, so a pipeline can refuse to deploy without one. `codeloop init --ci github` writes three workflows: `codeloop-pr.yml` runs `lane lint` on pull requests, `codeloop-staging.yml` deploys to staging and runs `codeloop verify <id> --env staging`, and `codeloop-prod.yml` runs on a `v*` tag inside a GitHub environment named `production`, whose required reviewers are the human gate.

## What you still do

- Tag the release.
- Approve the prod gate, after reading the verify result.

## Not yet

- Approvals are local roles and are not authenticated. `gate check` says so when CI asks who approved. A hosted board with signed-in roles is planned.
- The commands that deploy come from `deploy.staging.command` and `deploy.prod.command` in your `config.yaml`. codeloop does not know how to deploy your project until you set them.

Next: the [deploy lane, stage by stage](/docs/reference/lanes).
