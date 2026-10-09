---
title: Run your own skills in a lane
description: A lane stage names a skill. Point it at a skill you already have, from Claude Code, Cursor, Codex, BMAD or Spec Kit, and codeloop runs it with a check and a gate.
---

codeloop does not replace the skills you use. A lane stage names a skill by name, hands it a brief, and checks the file it writes. The skill can be one that ships with codeloop, one you wrote, or one from another framework.

## Where skills come from

`codeloop adopt` reads skill folders and commands and writes what it finds to `.codeloop/skills.index.yaml`. A folder with a `SKILL.md` is a skill; a markdown file is a command. The default scan covers your repo's `.claude/skills`, `.claude/commands`, `.cursor/commands`, `.agents/skills`, and your home `~/.claude/skills` and `~/.claude/commands`. Add any other folder with `--from`.

```sh
codeloop adopt --from ~/.claude/skills ~/.claude/skills/synced/<id> .bmad/skills
```

```text
  indexed 71 skills and commands into .codeloop/skills.index.yaml (36 added, 0 updated, 0 removed)
```

`adopt` merges into the index. `--replace` rebuilds it from the folders you name.

## Name the skill in a stage

```yaml
  - id: spec
    skill: bmad-spec
    output: "{spec}/spec.md"
    done: { cmd: "codeloop spec check {id}" }
    gate: { name: spec, approver: owner }
```

`codeloop lane lint` refuses a stage whose skill is not in the index, so a typo fails before a card does. The brief the agent gets (`codeloop brief <card>`) carries the skill's full text, the output path, the check command and the rule that the agent may not move the card itself.

## What the check looks at

The skill decides how the work is done. The stage's `done.cmd` decides whether it is done. If a BMAD skill writes a spec in its own layout, give the stage a check that matches that layout, for example `codeloop check file {spec}/spec.md --has 'Acceptance'`, or keep codeloop's `spec check` and tell the skill, in its brief notes, which lines it must produce.

## Three ways in

| You have | Do |
|---|---|
| A Claude Code command or skill | Nothing beyond `adopt`; name it in the lane |
| A BMAD module | `adopt --from <the module's skills folder>`; name the skill; set the stage check to the file the skill writes |
| A Spec Kit project | `codeloop import speckit` brings the specs in as cards; its slash commands are indexed by `adopt --from .specify` and can be named in a stage |

## Example

The guide [Review a client deliverable](/docs/guides/review-a-client-deliverable) runs a consulting review skill as a lane stage end to end, with the real outputs.
