---
name: mock
stage: mock
lane: build
inputs:
  - specs/{id}/spec.md
  - specs/{id}/interview.md
  - docs/artifacts/<project>/<topic>/*-mock.html (the prior mock in this topic, if any)
outputs:
  - "docs/artifacts/<project>/<topic>/{id}-mock.html: frames per screen state, a component map, a state matrix, a design contract"
check: "codeloop check artifact {id} --kind mock"
questions: 4
---

# mock

Draw the product's screens before the build stage writes a line of code, so a reviewer can see the
surface before approving the spec. One mock per card, one frame per screen **state**
(loading/ready/empty/error), never one frame per screen.

## Role

The designer working the `mock` stage of a card. A card with nothing to draw sets `screens: none`
in `spec.md` and skips this stage; everything else must produce a mock before `spec` opens.

## Inputs

- `specs/{id}/spec.md`, the acceptance lines; every screen in the mock traces to one.
- `specs/{id}/interview.md`, answers to open design questions asked at the prior stage.
- The newest mock in the same project/topic folder under `docs/artifacts/`, when one exists -
  `codeloop artifact new {id} --kind mock --topic <topic>` copies its frontmatter forward by
  default (`--from latest`), so a chain means something instead of starting cold each time.

## Procedure

1. **Read the spec and the interview.** Pull the card's acceptance lines and any answered design
   questions. Note the entities, states, and who is using the screen (role, device).
2. **Pick the surface pattern.** Match each screen to a known pattern before drawing anything: list
   page, detail/record page, form, dashboard, sidebar app shell, dialog, wizard. If nothing fits,
   say so in the contract section and justify a new pattern, never invent silently.
3. **Search the registry.** `mcp__shadcn__search_items_in_registries` for the chosen pattern's
   keyword, then `get_item_examples_from_registries` on the best 1–2 matches. Record the block or
   primitive chosen in the component map table before writing frame markup.
4. **Create the file.** `codeloop artifact new {id} --kind mock --topic <topic>` (alias:
   `codeloop mock new {id} --topic <topic>`). Fill the frontmatter's `screens:`, `components:` and
   `states:` lists first, the check reads them to know what the mock owes.
5. **Draw frames per state.** For every screen, one `<section class="screen-group"
   data-screen="<name>">` holding loading (a skeleton matching the real layout, never a bare
   spinner) → ready → empty (says what will fill it) → error (keeps input, offers retry), each
   wrapped in `.chrome` so it reads as the product. Copy inside a `.frame` is product copy only.
6. **Caption every frame.** A sibling `.caption` div per frame: label, one-sentence rationale, an
   `.api` line naming the request that fills it. A frame with no caption fails the check.
7. **Fill the component map and state matrix.** One row per name in `components:`; the state
   matrix needs a non-empty cell (or an explicit `<td class="gap">why</td>`) for every state named
   in `states:`.
8. **Write the contract section.** The spacing/radius tokens actually used (they come from
   `templates/artifacts/base.css`; do not invent new ones), which surfaces are push/sheet/dialog,
   and the container each error state uses.
9. **Self-check.** `codeloop check artifact {id} --kind mock`. Then look at the frame alone, delete
   anything inside it that would not ship as product copy, confirm every colour is a token, confirm
   every frame has a caption.

## Questions to ask before working

## Q1 Does an existing mock in this topic already draw one of these screens?
recommended: Build on it with `--from latest` (the default) rather than starting cold; a chain
that drops a screen without saying so under `screens_removed:` is a regression, not a redesign.
answer:

## Q2 Does this screen match a registry block, or does it need hand-composed primitives?
recommended: Name the block first (`dashboard-01`, `sidebar-0N`, `sheet-side`, …); only fall back to
primitives for forms and wizards, where no dedicated block exists yet.
answer:

## Q3 Which states does each data-bearing component actually need?
recommended: All four (loading/ready/empty/error) unless the component never shows that state in
this product, and say why in the state matrix, don't just leave the cell blank.
answer:

## Q4 Does any frame need a destructive confirm, and is it drawn as `alert-dialog`, not `dialog`?
recommended: Yes for anything irreversible; the plain `dialog` primitive is never the right surface
for that case.
answer:

## Template

See `template.md` in this folder for the component-map and state-matrix row formats.

## Checklist

See `checklist.md` in this folder.

## Done

`codeloop check artifact {id} --kind mock` exits 0: every screen in `screens:` has a frame for
every state in `states:`, every frame has a caption, every component in `components:` has a filled
state-matrix row, no colour literal appears outside the token blocks, and both the light and dark
token blocks are present.

## Examples

**Good.** `screens: [board, card-drawer]`, four states each. The board's empty state shows the
exact copy a first-run workspace sees ("No cards yet, `codeloop card new` creates one"), not a grey
box; the card-drawer's error state keeps the field values the user typed and offers Retry. Every
frame's caption names the endpoint it reads, e.g. `GET /api/cards?lane=build`.

**Failing, and why.** A mock with one frame per screen, no `data-state` variants, and a caption that
only says "card drawer" with no rationale or API line. `codeloop check artifact {id} --kind mock`
passes anyway if the frontmatter's `states:` list is edited down to a single entry, which is why
step 2 of the procedure asks what states the component needs before the frontmatter is written, not
after: the check only enforces what the frontmatter claims.
