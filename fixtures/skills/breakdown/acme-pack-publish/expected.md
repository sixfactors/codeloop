# Expected grading: acme-pack-publish (breakdown)

`brief.md` and an answered `interview.md` exist going in. The skill must write an epic with a
hypothesis and a metric, S1 to S4 as shippable stories each with a size, an `exists:` verdict
copied from the brief, a real `done_when`, a backward-only `depends_on`, and RICE on every line,
with S5 (versions and deprecation) deferred under `## Later` per the interview's answer to Q2.
`codeloop check breakdown {id} --ranked` must exit 0.

A breakdown that would pass fully:

```
# Epic: Publish a skill pack from the web app
hypothesis: letting a workspace turn its own skills into one installable pack gets its developers
using the hosted MCP endpoint instead of wiring up each skill by hand.
metric: packs published per workspace
feature: skill-pack-publishing

## Stories
- S1 [S] See my skills listed in the web app · exists: unlock apps/web/app/skills/page.tsx · done_when: open /skills, see the list · depends_on: none · rice: R=8 I=5 C=9 E=1
- S2 [M] Pick skills into a draft pack · exists: build · done_when: a draft pack with two skills saved and reopened · depends_on: S1 · rice: R=7 I=7 C=7 E=2
- S3 [S] Publish the pack to the workspace catalog · exists: unlock packages/cli/src/commands/pack.ts · done_when: the pack appears in the catalog with its skills · depends_on: S1, S2 · rice: R=7 I=8 C=8 E=1
- S4 [S] Install page for a published pack · exists: unlock apps/web/app/install/[slug]/page.tsx · done_when: open the install page, copy the MCP URL · depends_on: S3 · rice: R=6 I=6 C=9 E=1

## Later
- Versions and deprecation
```

Checklist lines that must be yes:
- `hypothesis:` and `metric:` lines present
- every story has a size tag, `[S]` or `[M]`, none `[L]`
- every story's `done_when:` is a thing a person can click or run
- every story has an `exists:` verdict with a path when not `build`
- every `depends_on:` is `none` or an earlier story id (S3 depends on S1 and S2; S4 depends on S3)
- four stories under `## Stories`, S5 deferred under `## Later`
- every story's line ends with `rice: R=<n> I=<n> C=<n> E=<n>`
- `codeloop check breakdown {id} --ranked` exits 0
