# mock checklist

Reviewer-facing. Pull this into a PR description or run it by eye before handing off to `spec`.

- [ ] `codeloop check artifact {id} --kind mock` passes
- [ ] Every screen in `screens:` has a frame for every state in `states:`
- [ ] Every frame has a sibling `.caption` with a label, rationale, and an API/data line
- [ ] Every component in `components:` has a filled state-matrix row (or an explicit `gap` cell with a reason)
- [ ] No colour literal outside the `:root` / dark token blocks, everything draws from `var(--...)`
- [ ] Both the light `:root` block and a dark-mode block are present and redefine the same tokens
- [ ] Copy inside a `.frame` is product copy only; every judgement call lives in the caption
- [ ] A screen matched to a registry block names that block in the component map, not a bespoke class
- [ ] If this mock has a parent (`lineage:` longer than one entry), every screen the parent drew is
  still present, or is named under `screens_removed:` with a reason
- [ ] The design contract section names the actual spacing/radius tokens and the presentation
  surface (push/sheet/dialog) per screen
