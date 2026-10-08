---
title: Review a client deliverable
description: Run a skill you already have, the Deloitte language review, as a lane stage so every deck is checked before it leaves, and you only approve the send.
---

This guide is for work that is not code. A consultant has a skill that rewrites client decks into house style. codeloop runs it on every deliverable, checks that the output is complete, and parks the card until the person who owns the client relationship says send.

Everything below was run on 2026-10-08 with codeloop from the current branch and Claude Code as the agent. The outputs are pasted from that run.

## What you need

- codeloop installed globally (`npm i -g @protoboxai/codeloop`), so that `codeloop` is on your path. The lane's checks call it by name.
- `claude` on your path if you want the headless run in step 6.
- The skill. This guide uses `deloitte-language-review`, a skill that takes a deck or memo and returns the rewritten text, a findings table and the evidence gaps. Any skill with a file as its output works the same way. Skills synced from claude.ai live under `~/.claude/skills/synced/<id>/`; skills you wrote yourself live under `~/.claude/skills/<name>/`.

## 1. Start a repo for the work

Deliverables are files, so they live in a repo like anything else.

```sh
mkdir client-decks && cd client-decks && git init
codeloop init --tools claude
```

## 2. Index the skills you already have

`adopt` reads skill folders and writes what it finds to `.codeloop/skills.index.yaml`, so a lane can name a skill by name. Name every folder the lane will draw from: the commands `init` wrote (the lane below uses `manage` and `ship` from there) and the folder your skill lives in.

```sh
codeloop adopt --from .claude/commands ~/.claude/skills/synced/<your-sync-id>
```

```text
  indexed 35 skills and commands into .codeloop/skills.index.yaml
```

If your skill is under `~/.claude/skills/<name>/`, plain `codeloop adopt` with no `--from` finds it, because that folder is in the default scan.

Check it saw the one you want:

```sh
grep -n deloitte .codeloop/skills.index.yaml
```

```text
100:- name: deloitte-language-review
101:  source: /Users/you/.claude/skills/synced/<id>/deloitte-language-review/SKILL.md
```

One thing to know: `adopt --from` replaces the index rather than adding to it. If you pass only the synced folder, the lane in step 3 fails `lane lint` because `manage` and `ship` are not indexed, and so do the seven default lanes. Passing both folders, as above, avoids that.

## 3. Write the lane

A lane is a YAML file with stages. Each stage names a skill, the file it must produce and the command that decides whether it is done. Save this as `.codeloop/lanes/deliverable-review.yaml`.

```yaml
id: deliverable-review
version: 1
metric: { name: deliverables_sent_without_edits, source: cards }
trigger: { manual: true }
wip: 2
retries: 2
stages:
  - id: intake
    skill: manage
    output: review/{id}/draft.md
    done: { cmd: "codeloop check file review/{id}/draft.md --has 'client:'" }
    notes:
      - "Paste the deliverable into review/{id}/draft.md under a `client:` line naming who it goes to."
  - id: review
    skill: deloitte-language-review
    output: review/{id}/rewrite.md
    done: { cmd: "codeloop check file review/{id}/rewrite.md --has 'Findings' && codeloop check file review/{id}/rewrite.md --has 'Evidence gaps'" }
  - id: sent
    gate: { name: send, approver: owner, outward: true }
    skill: ship
    output: review/{id}/sent.md
    done: { cmd: "codeloop check file review/{id}/sent.md --has 'sent:'" }
```

Three things the lane encodes:

- The review stage is done when `review/<id>/rewrite.md` exists and contains the words `Findings` and `Evidence gaps`. That is what `check file --has` tests: the presence of text, nothing more. It catches a run that wrote nothing or stopped before the tables. It does not judge the rewrite. A stricter check is a script of your own in `done.cmd`, for example one that counts findings rows.
- The `send` gate sits on the `sent` stage and is marked `outward`. An outward gate parks the card before the stage runs, so nothing leaves until a person approves.
- `wip: 2` means at most two decks are in review at once.

```sh
codeloop lane lint
```

```text
  9 lanes ok
```

## 4. Start a card

```sh
codeloop card new deliverable-review "Send the AI governance deck to the client without edits" \
  --persona founder \
  --can "send a client deck that reads like our house style" \
  --so "the partner does not rewrite it on a Sunday" \
  --size S --metric deliverables_sent_without_edits
```

```text
created c-001 in deliverable-review at stage intake
Next: run the /manage skill to write review/c-001/draft.md, then `codeloop next c-001`.
```

## 5. Intake: put the draft in the card

Paste the deck text into the file the stage names, with the `client:` line at the top.

```sh
mkdir -p review/c-001
cat > review/c-001/draft.md <<'EOF'
client: Deloitte, AI governance programme lead
deck: AI delivery governance, draft 3

# Forty efforts, six stacks, one question nobody can answer

Agents are not chatbots. Today the firm leverages six platforms to unlock agent delivery at scale, with no holistic view of what runs in production.
...
EOF
codeloop next c-001
```

```text
c-001 moved to review
Next: run the /deloitte-language-review skill to write review/c-001/rewrite.md, then `codeloop next c-001`.
```

`next` runs one stage's check and moves the card one step. The intake check passed, so the card is now at review. A second `next` before the skill has run shows what the review check wants:

```text
missing file: review/c-001/rewrite.md
c-001 failed the review check (1 so far)
Next: missing file: review/c-001/rewrite.md. The /deloitte-language-review skill produces review/c-001/rewrite.md. Then `codeloop next c-001`.
```

## 6. Run the review

You have two ways.

**By hand, in Claude Code.** Open the repo, run `/deloitte-language-review` on `review/c-001/draft.md`, save the result as `review/c-001/rewrite.md`, then `codeloop next c-001`. `codeloop brief c-001` prints exactly what the stage expects, including the full skill text, if you want to paste it into another tool.

**Headless.** Tell codeloop which agent to start, then let it run the stage.

```yaml
# .codeloop/config.yaml
agents:
  default: claude
  claude:
    cmd: "claude -p --permission-mode acceptEdits < {brief}"
    timeout_minutes: 10
    max_runs_per_day: 20
```

```sh
codeloop run --agent
```

```text
  c-001: agent claude ran review (exit 0, 41s, .codeloop/state/agent-runs/c-001-review-1.log)
  c-001: waiting for you
```

The agent got the stage brief as its prompt: the card, the skill text, the output path, the check, and the rule that it may not move the card itself. It wrote the file. codeloop ran the check, moved the card to `sent`, and parked it at the send gate.

What the run produced. The first headline of the rewritten deck in `review/c-001/rewrite.md`, after its `client:` and `deck:` lines:

```text
# AI delivery runs on six platforms with no single inventory of production agents

The firm has [client to confirm: count of active AI efforts, draft says forty] AI efforts
across six platforms [client to confirm: platform list]. No one inventory records which
agents run in production, who owns them, or what they can access.
```

The first two rows of its findings table, unedited (the table has twelve):

```text
| Location | Tell (§2) | Original | Rewritten |
|---|---|---|---|
| Slide 1 headline | 2 tricolon, 14 insinuation, 16 unsourced number | Forty efforts, six stacks, one question nobody can answer | AI delivery runs on six platforms with no single inventory of production agents |
| Slide 1 body | 1 X-not-Y, 3 portentous fragment | Agents are not chatbots. | [n] of the agent patterns in scope run multi-step tasks, not single-turn chat, with the control consequence stated |
```

The evidence-gaps table lists eight placeholders and who supplies each: three for the client, five for the author.

A caution about `run`: it runs everything that is due in the repo, not only this lane. In this run it also started the nightly triage lane's card and spent an agent run on it. If this repo only reviews deliverables, delete the default lanes you do not use.

## 7. Approve the send

```sh
codeloop inbox
```

```text
0 shipped this week, 1 waiting on you, oldest today

Waiting for you (1)
  c-001  Send the AI governance deck to the client without edits: deliverable-review/sent, gate send
        read: review/c-001/sent.md   last check: not run yet (public step, approve first)
        codeloop approve c-001   or   codeloop reject c-001 "<what to change>"
```

Read `review/c-001/rewrite.md`. If the placeholders are filled and the rewrite holds, approve.

```sh
codeloop approve c-001 --as owner
```

`--as owner` matters outside a terminal. At a terminal codeloop assumes you are the owner. From Claude Code, a script or CI it assumes an agent, and an agent cannot approve a gate:

```text
refused: gate "send" needs owner; agent cannot approve it
```

If the rewrite is not ready, reject with a note:

```sh
codeloop reject c-001 "numbers on slide 2 still unsourced" --as owner
```

```text
c-001 rejected at sent; note recorded
Next: redo with the /ship skill to write review/c-001/sent.md, then `codeloop next c-001`.
```

A rejection keeps the card at the gate and puts your note in the brief for that stage. It does not send the card back to the review stage. To redo the review, run the skill again on the draft, overwrite `review/c-001/rewrite.md`, and approve when it is right. Sending a rejection back to the stage before the gate is on the list; it is not in this version.

The `sent` stage then expects `review/c-001/sent.md` with a `sent:` line (date, channel, who). Write it when the deck has gone, run `codeloop next c-001`, and the card is done. `codeloop stats --lane deliverable-review` then counts it as done and reports human turns, cycle time and the first-pass rate at the send gate. The lane's `metric:` line names what you measure; the number itself is not computed by `stats` in this version.

The same works from the board: `codeloop serve --owner` opens the card with Approve and Reject buttons and the rewrite one click away.

## What this gives you

- Every deliverable goes through the same review, and a run that produced no rewrite, or stopped before the findings and evidence tables, cannot pass the check.
- Nothing is sent without a person approving it, and the approval or rejection is recorded on the card with your note.
- The card keeps the draft, the rewrite, the findings and who supplied each number, so the next deck starts from what the last one learned.

## Known rough edges

- `adopt --from` replaces the skill index, as noted in step 2.
- `run --agent` runs every due lane in the repo; there is no flag yet to limit it to one lane or one card.
- `reject` keeps the card at the gate rather than returning it to the stage before it.
- `check file --has` tests for text, not quality. A stricter done-check is your own script.
- The skill text is injected into the brief in full on every run. For a long skill that is a long prompt.
