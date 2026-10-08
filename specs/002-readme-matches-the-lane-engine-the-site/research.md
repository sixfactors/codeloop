# CL-002 research: The README describes the product that ships

## What exists

exists: unlock — the lane engine, board, inbox and cloud sync are built and published as @protoboxai/codeloop@0.3.0; only the README still describes the pre-lane product (ten slash commands, `/design → /ship`). The site at codeloop.protobox.ai already describes lanes.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| Spec Kit | README opens with a 4-step quickstart (`specify init`, then the slash commands in order) and a supported-agents table | https://github.com/github/spec-kit |
| BMAD | README opens with the four-phase loop (clarify, plan, build, learn) and one install command (`npx skills add`) | https://docs.bmad-method.org/ |

## The pain, grounded

pain: a visitor reads two products: the site sells lanes and gates, the README sells ten commands. Source: this repo, README.md line 15 vs site/app/page.tsx. Spec Kit issue #75 ("illusion of work") shows what happens when the pitch and the tool diverge.

## Options

- Rewrite the README to the three questions (what, run it, three common things) with the lane diagram from the site. Chosen.
- Point the README at the site and keep it to a quickstart. Rejected: npm shows the README, not the site.

## Risks

- The quickstart must be run from a clean clone before merge or it lies the same way.

## Sources

- source: https://github.com/github/spec-kit - README structure, quickstart first
- source: https://docs.bmad-method.org/ - one install command, loop first
- source: https://codeloop.protobox.ai - what the site already promises

verdict: build
