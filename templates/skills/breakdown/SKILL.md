---
name: breakdown
stage: breakdown
lane: shape
inputs:
  - shape/{id}/brief.md
  - shape/{id}/interview.md
  - docs/story-standard.md
  - docs/terminology.md
outputs:
  - shape/{id}/breakdown.md
check: "codeloop check breakdown {id} --ranked"
questions: 2
---

# Breakdown

## Role

You are the breakdown stage of a codeloop shape workflow. Good work turns a brief and an answered
interview into stories that each ship alone and are usable on their own, sized honestly, with
every dependency pointing backward. Bad work is an epic written to look thorough: a story sized L
because splitting it felt like extra steps, a `done_when` of "all stories complete", a story that
secretly needs one two cards later to be worth shipping. The check catches the mechanical half of
this; the ordering itself, whether story 2 is genuinely usable without story 4, is on you.

## Inputs

1. `shape/{id}/brief.md`, the `exists:` verdicts and the problem. Every story's `exists:` verdict
   is copied from here, never re-decided.
2. `shape/{id}/interview.md`, every answered question from the interview stage. An answer here
   that never reaches a story was pointless to ask.
3. `docs/story-standard.md`, in particular the Size table and SPIDR split
   (paths, interfaces, data, rules, spike): an L story is split with these five cuts into two or
   three stories under the same feature, not shipped as one L.
4. `docs/terminology.md`, the RICE section: reach, impact and confidence on 1–10, effort in weeks.
   You write this per story once the stories themselves are settled, not per feature as the rest
   of codeloop does, because the epic has no feature page yet at this stage.

## Procedure

1. Read the brief's problem and every `exists:` line. These are facts now, not drafts: a capability
   the brief found `have` does not get a story, `unlock` gets a story to expose it, `build` gets a
   story to build it.
2. Write the epic header: `# Epic: <title>`, `hypothesis:` (one sentence: what you believe shipping
   this does and why), `metric:` (the one number this epic should move), and `feature:` when every
   story shares one capability slug (omit it and set `feature:` per story when they don't).
3. List the stories that answer the problem, ordered so each one ships alone and is usable by
   itself before the next exists. A story that only makes sense once a later one ships is a sign
   the order is wrong, not that the dependency is fine.
4. For a story that would be L by the Size table, split it now with SPIDR into two or three
   sibling stories under the same feature, rather than writing one L line, the check refuses an L
   outright and sending it back costs a round trip you can avoid here.
5. For each story, copy its `exists:` verdict from the brief (the same `have | unlock | port |
   build`, with the brief's path when not `build`), write a `done_when:` a person can click or
   run, never "all tasks complete" or similar, and set `depends_on:` to `none` or to earlier story
   ids in this same file only. The check refuses a `depends_on` naming a later or unknown story,
   because a story that waits on one that hasn't shipped yet isn't shippable on its own, which is
   the entire point of ordering them in the first place.
6. Stop at seven stories. Anything past that goes under `## Later` as a bare title, deferred, not
   queued, the check refuses an eighth story in `## Stories` outright, the fix is to cut the epic
   down, not to ask the check to allow eight.
7. Rank. This skill runs twice on a shape card: the breakdown stage ends at step 6 and
   `codeloop check breakdown {id}` passes without rice; the rank stage adds the rice part and
   `--ranked` checks it. Do both in one pass when you have the information. For each story, decide reach and impact (1–10) against the brief's problem, confidence
   (1–10) in the `exists:` call and the estimate, and effort in weeks, then append
   ` · rice: R=<n> I=<n> C=<n> E=<n>` to its line. Every story needs all four, `--ranked` checks
   that nothing was skipped.
8. Run the done command and fix every line it reports before the plan goes to the owner's gate.

## Questions to ask before working

Most of what breakdown needs should already be settled by the brief and the interview. Ask only
when writing the stories out turns up something genuinely new:

```
## Q1 Splitting this with SPIDR produced a fourth story beyond what the interview implied. Fold it in, or does the epic need to shed scope to stay at seven or fewer?
recommended: Fold it in if it still ships alone and the epic has room under seven; otherwise move the thinnest story to ## Later rather than force an eighth into ## Stories.
## Q2 Two stories could reasonably ship in either order. Does the dependency matter, or is it safe to mark both depends_on: none?
recommended: Mark both none unless one genuinely can't be used without the other; an unnecessary depends_on blocks the second story's queue slot for no reason.
```

## Template

```
# Epic: {{title}}
hypothesis: <one sentence>
metric: <metric name>
feature: <slug>

## Stories
- S1 [S] <title> · exists: <have|unlock|port|build> <path when not build> · done_when: <text> · depends_on: none · rice: R=<n> I=<n> C=<n> E=<n>

## Later
- <title>
```

## Checklist

See `checklist.md`:

- [ ] `hypothesis:` line present, one sentence
- [ ] `metric:` line present, names the one metric this epic moves
- [ ] every story has a size tag, `[S]` or `[M]`; an `[L]` is split into sibling stories before
  this file is written
- [ ] every story's `done_when:` is a thing a person can click or run, never "all tasks complete"
  or similar
- [ ] every story has an `exists:` verdict copied from the brief, with a path or URL when not
  `build`
- [ ] every `depends_on:` is `none` or an earlier story id in this same file
- [ ] at most seven stories under `## Stories`; anything past that sits under `## Later`
- [ ] every story's line ends with `rice: R=<n> I=<n> C=<n> E=<n>`, all four present
- [ ] `codeloop check breakdown {id} --ranked` exits 0

## Done

```
codeloop check breakdown {id} --ranked
```

Exit 2 and one line per problem: a missing `hypothesis:` or `metric:`, a story with no size or an
`L`, a `done_when` that's missing or a placeholder, a missing `exists:`, a `depends_on` naming an
unknown or later story, more than seven stories in `## Stories`, or (with `--ranked`) a story
missing its `rice:` part. The check refuses forward and unknown dependencies and any `L` on
purpose: every story in `## Stories` has to be shippable the moment its listed dependencies are
done, so a forward reference or an unsplit `L` would let a story onto the board that can't
actually ship alone yet.

## Examples

**Good**, `shape/pack-publish/breakdown.md`, for the brief "Let a workspace publish a skill pack
from the web app":

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

Ran `codeloop check breakdown pack-publish --ranked` against this file: exit 0 (hypothesis and
metric present, four stories each sized S or M with a real `done_when`, every `depends_on` points
backward, four stories under the cap, every line carries all four rice values).

**Bad**, the same epic with S3 written as `- S3 [S] Publish the pack to the workspace catalog ·
exists: build · done_when: all tasks complete · depends_on: S4` and a ninth story added to
`## Stories`: fails four ways at once. `exists: build` ignores the brief's `unlock` finding for
`pack build`, `done_when: all tasks complete` is exactly the placeholder the check refuses,
`depends_on: S4` points forward to a story that hasn't shipped yet, and the ninth story overflows
the seven-story cap. Each is a separate line in the check's output, not one combined failure.
