# Fixtures for `codeloop skill eval`

One folder per skill, named after it: `fixtures/skills/<skill>/`. Inside, one folder per fixture:
`fixtures/skills/<skill>/<fixture-id>/`.

A fixture is the minimal repo state the skill's stage needs to do its work — whatever the skill's
`inputs` name, as plain files:

```
fixtures/skills/<skill>/<fixture-id>/
  spec.md        # if the skill reads one
  research.md    # if the skill reads one
  tasks.md       # if the skill reads one
  expected.md    # not read by the eval — tells a human which checklist lines this fixture should pass
```

`codeloop skill eval <skill> --fixture <fixture-id>` copies that folder into a throwaway temp
project's card spec folder, runs the configured agent on the skill's stage, runs the stage's
`check` from `SKILL.md`'s frontmatter, then grades the output against `checklist.md` with a
second agent call. Without `--fixture` it runs every fixture under the skill's folder.

## Adding a fixture

1. Pick what should be true going in — a spec with a clear goal, one with a vague goal, one with
   a research.md to cite, one where the done-check should fail. Each fixture should exercise a
   different way the skill's stage can go right or wrong; three or four is usually enough.
2. Write `expected.md`: which `checklist.md` lines must grade "yes" for this fixture, and why.
   This is documentation for whoever maintains the fixture, not input to the eval — nothing reads
   it at run time, so it rots silently if you let it; keep it next to the fixture and update it
   when you change the fixture.
3. Run `codeloop skill eval <skill> --fixture <fixture-id> --json` and read the table. If the
   grader's calls do not match `expected.md`, the fixture, the checklist, or the skill's own
   instructions is off — in that order of likelihood.

## `spec-brief`

`fixtures/skills/spec-brief/` is codeloop's own fixture skill (`SKILL.md`, `template.md`,
`checklist.md` live there too, not under `templates/skills/`) — it exists only to prove the eval
runner works end to end, with three fixtures: `basic` (a clear goal, no research), `vague-goal`
(the spec's own goal is not concrete — tests whether the grader catches an agent inventing one),
`with-research` (a research.md naming sources the brief must cite, not re-derive).
