---
title: Lanes
description: The eight lanes codeloop init installs, stage by stage, from templates/lanes in the 0.4.1 package.
---

Each table is one lane file. The gate column says when the card stops: after the check passes, or before the stage runs for a public step. `codeloop lane show <id>` prints the same from your repo, and [Lanes](/docs/concepts/lanes) explains the keys.

```text
  analyze    v1  pull → compare → judge → findings  cron 0 9 * * FRI
  build      v1  research → mock → spec → build → verify → review → staging → live  manual
  deploy     v1  staging → verify → prod → smoke  on git.tag
  learn      v1  capture → bump → promote  manual
  market     v1  brief → draft → publish → measure  on lane.done (build)
  plan       v1  gather → research → rank → story  cron 0 9 * * MON
  scan       v1  scan  cron 0 7 * * MON
  triage     v1  capture → classify → dedupe → file  cron 0 20 * * *
```

## build

A feature, from research to live. Metric `cycle_time_days`, target under 5. Trigger manual. WIP 2, retries 3. When a card finishes, a market card starts.

| Stage | Skill | Output | Check | Gate |
|---|---|---|---|---|
| research | design | `{spec}/research.md` | `codeloop check research {id} --min-sources 3` | |
| mock | design | | `codeloop check mock {id}` | |
| spec | plan | `{spec}/tasks.md` | `codeloop spec check {id}` | spec, owner, after |
| build | test | | `codeloop task check {id} --all-done && npm test` | |
| verify | qa | `evidence/{nnn}/verify.md` | `codeloop verify {id}` | local, owner, after |
| review | commit | `evidence/{nnn}/review.md` | `codeloop check file evidence/{nnn}/review.md --has 'verdict: approve'` | pr, reviewer, after |
| staging | deploy | `evidence/{nnn}/staging.md` | `codeloop check file evidence/{nnn}/staging.md --has 'result: pass'` | |
| live | ship | `evidence/{nnn}/prod.md` | `codeloop check file evidence/{nnn}/prod.md --has 'result: pass'` | prod, owner, before |

The mock stage is optional per card: a spec with `screens: none` passes it without a mock.

## deploy

A release. Metric `change_failure_rate`, target under 15%. Trigger: a new git tag. WIP 1, retries 3.

| Stage | Skill | Output | Check | Gate |
|---|---|---|---|---|
| staging | deploy | `deploy/{id}/staging.md` | `codeloop check file deploy/{id}/staging.md --has 'result: pass'` | |
| verify | qa | `deploy/{id}/verify.md` | `codeloop check file deploy/{id}/verify.md --has 'result: pass'` | |
| prod | ship | `deploy/{id}/prod.md` | `codeloop check file deploy/{id}/prod.md --has 'result: pass'` | prod, owner, before |
| smoke | debug | `deploy/{id}/smoke.md` | `codeloop check file deploy/{id}/smoke.md --has 'result: pass'` | |

## market

A launch post for every shipped feature. Metric `signups_from_launch`, target +10%. Trigger: a build card finishing. WIP 2, retries 3.

| Stage | Skill | Output | Check | Gate |
|---|---|---|---|---|
| brief | plan | `marketing/{id}/brief.md` | `codeloop check file marketing/{id}/brief.md --has 'audience:' 'claim:' 'metric:'` | |
| draft | design | `marketing/{id}/blog.md` | `codeloop check file marketing/{id}/blog.md --has 'claim:'` | copy, owner, after |
| publish | ship | `marketing/{id}/published.md` | `codeloop check file marketing/{id}/published.md --has 'url:'` | publish, owner, before |
| measure | reflect | `marketing/{id}/result.md` | `codeloop check file marketing/{id}/result.md --has 'verdict:'` | |

## plan

The weekly plan. Metric `shipped_cards_that_moved_their_metric`. Trigger: Monday 09:00. WIP 1, retries 3. Proposals from triage and scan are promoted into this lane.

| Stage | Skill | Output | Check | Gate |
|---|---|---|---|---|
| gather | reflect | `plan/{id}/signals.md` | `codeloop check file plan/{id}/signals.md --has 'signals:'` | |
| research | design | `plan/{id}/research.md` | `codeloop check file plan/{id}/research.md --has 'verdict:'` | |
| rank | manage | `plan/{id}/ranked.md` | `codeloop check file plan/{id}/ranked.md --has 'rice:'` | |
| story | plan | `plan/{id}/stories.md` | `codeloop check file plan/{id}/stories.md --has 'acceptance:'` | backlog, owner, after |

## triage

Issues and feedback become proposals. Metric `proposals_accepted_ratio`. Trigger: every day 20:00. WIP 1, retries 3.

| Stage | Skill | Output | Check | Gate |
|---|---|---|---|---|
| capture | debug | `triage/{id}/capture.md` | `codeloop check file triage/{id}/capture.md --has 'sources:'` | |
| classify | manage | `triage/{id}/classified.md` | `codeloop check file triage/{id}/classified.md --has 'category:'` | |
| dedupe | manage | `triage/{id}/deduped.md` | `codeloop check file triage/{id}/deduped.md --has 'duplicates:'` | |
| file | manage | `triage/{id}/proposals.md` | `codeloop check file triage/{id}/proposals.md --has 'proposals:'` | proposals, owner, after |

## scan

What competitors shipped. Metric `competitor_proposals_promoted`. Trigger: Monday 07:00. WIP 1, retries 3. One stage, and the stage is a command: no skill, no agent.

| Stage | Skill | Output | Check | Gate |
|---|---|---|---|---|
| scan | | | `codeloop scan competitors` | |

`scan competitors` reads the changelog link on each page in `.codeloop/wiki/competitors/`, compares it with the last scan, and proposes one plan card per competitor that shipped something new. The proposals wait in the inbox.

## analyze

The weekly growth review. Metric `north_star`, from analytics. Trigger: Friday 09:00. WIP 1, retries 3. When a card finishes, a plan card starts.

| Stage | Skill | Output | Check | Gate |
|---|---|---|---|---|
| pull | reflect | `growth/{id}/metrics.md` | `codeloop check file growth/{id}/metrics.md --has 'north_star:'` | |
| compare | reflect | `growth/{id}/compare.md` | `codeloop check file growth/{id}/compare.md --has 'delta:'` | |
| judge | reflect | `growth/{id}/verdicts.md` | `codeloop check file growth/{id}/verdicts.md --has 'verdict:'` | verdicts, owner, after |
| findings | reflect | `growth/{id}/findings.md` | `codeloop check file growth/{id}/findings.md --has 'findings:'` | |

## learn

A lesson into a rule. Metric `repeat_gotcha_rate`. Trigger manual. WIP 2, retries 3.

| Stage | Skill | Output | Check | Gate |
|---|---|---|---|---|
| capture | reflect | `learn/{id}/capture.md` | `codeloop check file learn/{id}/capture.md --has 'gotcha:'` | |
| bump | reflect | `learn/{id}/bump.md` | `codeloop check file learn/{id}/bump.md --has 'freq:'` | |
| promote | reflect | `learn/{id}/promote.md` | `codeloop check file learn/{id}/promote.md --has 'rule:'` | rule, owner, after |

## What `stats` can compute

`codeloop stats` prints `metric <name>: <value|no-data>` per lane. A value only comes back for `source: cards` and a name the engine knows how to derive from the cards themselves: `done`, `done_cards`, `cards_done`, `done_without_reject`, `first_pass_done`, `cycle_time_hours`, `cycle_time_days`, `proposals_accepted_ratio`. Of the eight shipped lanes, that is build's `cycle_time_days` and triage's `proposals_accepted_ratio` — the rest (deploy, plan, scan's card-sourced names, and analyze's, market's and learn's analytics/knowledge-sourced ones) print `no-data` until something outside the card log feeds the number in.

## The skills the lanes name

`codeloop init` writes these ten, one file each under the host's commands folder, and every stage above names one.

| Skill | Used by |
|---|---|
| design | build/research, build/mock, market/draft, plan/research |
| plan | build/spec, market/brief, plan/story |
| manage | plan/rank, triage/classify, triage/dedupe, triage/file |
| test | build/build |
| commit | build/review |
| qa | build/verify, deploy/verify |
| deploy | build/staging, deploy/staging |
| debug | deploy/smoke, triage/capture |
| reflect | market/measure, plan/gather, analyze (all four), learn (all three) |
| ship | build/live, deploy/prod, market/publish |
