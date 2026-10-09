---
name: system-design
stage: design
lane: build
inputs:
  - specs/{id}/spec.md
  - docs/architecture.md (or the repo's own architecture doc, for the layer names already in use)
outputs:
  - "docs/artifacts/<project>/<topic>/{id}-system-design.html: context, layers, deployment, network, data stores, tech choices, risks"
check: "codeloop check artifact {id} --kind system-design"
questions: 4
---

# system-design

Document a system's shape before it is built or changed at scale: who uses it, what layer runs
what technology, where each piece is deployed, and what it costs to run. One artifact per system
or per significant change to one.

## Role

The architect documenting a system for a card whose scope is infrastructural rather than a single
feature slice, a new service, a deployment topology change, a data-store migration.

## Inputs

- `specs/{id}/spec.md`, what the system must do and for whom.
- The repo's own architecture doc (e.g. `docs/architecture.md`), for the layer names, hosting
  platform and datastore already in use, a tech-choices table that reinvents what the repo
  already runs is a review flag, not a decision.

## Procedure

1. **Name the actors.** Who uses this system, and what external systems does it talk to? List them
   under `scope:` in the frontmatter before writing a section.
2. **Create the file.** `codeloop artifact new {id} --kind system-design --topic <topic>`.
3. **Context section.** One row per actor/external system, with the relationship ("reads via REST",
   "writes events to", "authenticates through").
4. **Software layers.** A `flowchart` mermaid diagram, UI → API → services → data. Every box names
   its technology (framework, language, or runtime), a box that only names the layer, not the
   tech, fails the check. Use the repo's existing stack unless the card is specifically about
   changing it.
5. **Deployment topology.** One table row per environment named under `environments:`, naming
   where each piece runs, plus a `flowchart` grouping pieces by environment subgraph.
6. **Network view.** Ingress, the auth boundary, internal service-to-service calls, and ports, a
   `flowchart` with the client on one side and the datastore on the other.
7. **Data stores.** An `erDiagram` excerpt for the entities this system owns. Crow's-foot notation
   (`||--o{`) is fine; it is not drawn as balanced brackets.
8. **Tech choices.** One row per non-obvious choice: the choice, the alternative considered, why,
   and the cost (hosting, licensing, or operational).
9. **Risks.** One bullet per risk this design accepts, and its mitigation if any.
10. **Self-check.** `codeloop check artifact {id} --kind system-design`. Every environment named in
    `environments:` needs a deployment-topology row; every software-layer box needs a named tech.

## Questions to ask before working

## Q1 Does this system already exist, or is this a change to one that's running?
recommended: Read the repo's own architecture doc first; a tech-choices row that duplicates an
existing choice without naming it as the current state is a sign the doc wasn't read.
answer:

## Q2 Which environments does this card actually touch, all of them, or just one?
recommended: Name only the environments this change affects under `environments:`; a topology
table with every environment when only staging changed hides the real diff.
answer:

## Q3 Is every mermaid diagram's diagram type the one that fits the content (flowchart vs erDiagram vs sequence)?
recommended: `flowchart` for layers/network/deployment, `erDiagram` for data stores, mixing them up
produces a diagram that technically renders but says the wrong thing.
answer:

## Q4 Does any tech choice here conflict with a hard rule the repo already has (e.g. no `.env` files, a required ORM pattern)?
recommended: Check the repo's hard-rules doc before finalizing a choice; a design that reintroduces
a banned pattern should say so explicitly and justify the exception, not silently assume it.
answer:

## Template

See `template.md` in this folder for the context, deployment-topology and tech-choices row formats.

## Checklist

See `checklist.md` in this folder.

## Done

`codeloop check artifact {id} --kind system-design` exits 0: tokens and dark mode present, no raw
colour, every mermaid block parses as a known diagram type with balanced syntax (crow's-foot
notation excepted), every software-layer box names a technology, and every environment in
`environments:` has a deployment-topology row.

## Examples

**Good.** Software layers: `UI["Next.js 15"] --> API["Hono"] --> SVC["Node.js workers"] --> DATA["Postgres"]`.
Deployment topology has a row for `staging` and a row for `production`, each naming the Fly.io app
or Vercel project the piece runs on.

**Failing, and why.** Software layers drawn as `UI["Frontend"] --> API["Backend"] --> DATA["Database"]`
- renders, but names no technology, so a reader cannot tell what to go read the docs for or what
breaks when a dependency is upgraded. `codeloop check artifact {id} --kind system-design` flags each
box by name.
