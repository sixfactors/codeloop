---
name: workflow
stage: design
lane: build
inputs:
  - specs/{id}/spec.md
  - specs/{id}/interview.md
outputs:
  - "docs/artifacts/<project>/<topic>/{id}-workflow.html: one sequence diagram per flow, a swimlane table, a state diagram for the main entity"
check: "codeloop check artifact {id} --kind workflow"
questions: 3
---

# workflow

Document a multi-step process end to end before building it: who triggers it, what each step does
and to whom, where it can fail, and what state the entity it mutates moves through.

## Role

The designer documenting a workflow for a card whose scope is a process that spans more than one
request, an approval chain, a sync job, a multi-party handoff, rather than a single screen.

## Inputs

- `specs/{id}/spec.md`, the acceptance lines; every flow traces to one.
- `specs/{id}/interview.md`, answers to open questions about failure handling or ownership.

## Procedure

1. **Name the actors and entities.** Who (or what system) takes part, and what entity's lifecycle
   does the workflow drive? List them under `actors:` and `entities:` in the frontmatter.
2. **Create the file.** `codeloop artifact new {id} --kind workflow --topic <topic>`.
3. **One sequence diagram per flow.** For every name in `flows:`, a `sequenceDiagram` naming every
   actor/entity involved as a `participant`, with the data passed labelled on each arrow, not just
   the action name. Every actor in `actors:` must appear in at least one diagram, or the check
   flags it as unused.
4. **Swimlane table.** One row per step: actor, system, data in, data out, failure path. The
   failure path names what the user or the next system sees, not just "error".
5. **Entity state diagram.** A `stateDiagram-v2` for the main entity the workflow drives. One
   diagram is enough even when several flows touch the same entity's lifecycle.
6. **Self-check.** `codeloop check artifact {id} --kind workflow`. Every flow in `flows:` needs a
   sequence diagram; every actor needs to appear somewhere in a diagram.

## Questions to ask before working

## Q1 Is this really one workflow, or several that happen to share an entity?
recommended: Split into separate `flows:` entries when the trigger differs, one sequence diagram
per distinct trigger-to-outcome path, not one diagram trying to show every branch at once.
answer:

## Q2 What does the user or caller actually see when a step fails midway?
recommended: Name it in the swimlane's failure-path column, not just "retries" or "errors out" -
a reviewer needs to know whether the entity is left in a valid state or needs manual cleanup.
answer:

## Q3 Does every actor named in `actors:` genuinely take part, or is one a role nobody calls into this flow?
recommended: Drop an actor from the frontmatter rather than leaving it unused, the check treats an
actor with no diagram appearance as a documentation bug, not a future placeholder.
answer:

## Template

See `template.md` in this folder for the swimlane row format.

## Checklist

See `checklist.md` in this folder.

## Done

`codeloop check artifact {id} --kind workflow` exits 0: tokens and dark mode present, no raw
colour, every mermaid block parses, every flow in `flows:` has a sequence diagram, and every actor
in `actors:` appears in at least one diagram.

## Examples

**Good.** `flows: [approve-a-gate]`. Sequence diagram: `Owner->>Board: approve(cardId)`,
`Board->>Engine: advanceCard(cardId)`, `Engine-->>Owner: stage moved to "build"`. Swimlane names the
failure path for a gate that's already moved: "409, someone else advanced it first; reload and
re-check before retrying."

**Failing, and why.** A sequence diagram with `participant Owner` and `participant Board` but the
frontmatter's `actors:` also lists `Reviewer`, who never appears because the diagram only covers the
owner's gate, not the reviewer's. `codeloop check artifact {id} --kind workflow` flags `Reviewer` as
absent from every diagram, either add the reviewer's step or drop them from `actors:`.
