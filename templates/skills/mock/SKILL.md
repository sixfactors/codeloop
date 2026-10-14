---
name: mock
stage: mock
lane: build
inputs:
  - specs/{id}/spec.md
  - specs/{id}/interview.md
  - .codeloop/design-system/README.md
  - .codeloop/design-system/blocks.css
outputs:
  - "specs/{id}/mock.html: one section per screen named in the spec, each drawn as the product from the design system's blocks"
check: "codeloop check mock {id}"
questions: 4
---

# mock

Draw the product's screens before the build stage writes code, so the owner approves the spec
having seen the surface. A mock is a spec: built from the project's design system, with real
content, in the states the story is about. It should read like a page of the finished product,
not a sketch.

## Role

The designer working the `mock` stage. A card with nothing to draw writes `screens: none` in
`spec.md` and passes this stage without a mock.

## Inputs

- `specs/{id}/spec.md`: the acceptance lines and `screens:`; every screen traces to one.
- `specs/{id}/interview.md`: answered design questions.
- `.codeloop/design-system/`: `tokens.css` (colours, radius, spacing, fonts) and `blocks.css` (the
  building blocks). The README lists every block and what it is for. This is the project's own
  design system; the owner changes it there, never inside a mock.
- The newest mock on the same topic: `mock new` copies its screens forward, marked `data-from`.

## Procedure

1. **Read the spec and the interview.** List the screens under `screens:` and, for each, the
   acceptance line it proves and the state it must show (the gate waiting, the empty first run,
   the failure).
2. **Read the design system.** Open `.codeloop/design-system/README.md`. Every screen is composed
   from those blocks: an `app-frame` with `chrome`, `nav` and `main` for a full screen; `list-row`,
   `columns`/`tile`, `record`/`props`/`tabs` and `tree-row` for content; `key`, `pill`, `holder`,
   `prio`, `proof` and `btn` for the details. When a screen needs something the blocks lack, add the
   block to `.codeloop/design-system/blocks.css` (and a row to its README), then use it. Never style
   inside the mock.
3. **Create the file.** `codeloop mock new {id} --topic <topic>` writes `specs/{id}/mock.html` with
   the design system inlined. A proposal without a spec folder gets `.codeloop/mocks/{id}.html`.
4. **Draw each screen as the product.** One `<section data-screen="<name>">` per screen. Inside, the
   app frame with the real navigation, the real page title, and real content: story titles, keys,
   names, numbers, the copy a user would read. Show the state the story is about, and draw the
   empty and error states where the acceptance lines name them. No lorem ipsum, no grey boxes.
5. **Make it explain itself.** Under each section, a `<p class="note">` saying what the screen proves
   and which acceptance line it covers. Notes stay outside the frame; the frame holds product only.
6. **Check it the way a reviewer will.** `codeloop check mock {id}`: every screen in the spec drawn,
   the tokens and blocks unchanged from the design system, no colour outside them, inherited
   screens kept or listed under `screens_removed:`. Then open the file in a browser at desktop and
   phone width: nothing overflows, nothing is clipped, and it reads as the product.

## In the app

A project with a Next.js app (`mock.target: app`, the default when `next` is a dependency and an
`app/` or `src/app/` directory exists) gets the mock as a real page instead of an HTML file:
`codeloop mock new {id} --topic <topic>` writes `<app_dir>/mocks/<nnn>-<slug>/page.tsx` and
`mock-data.ts`, with one `<section data-screen="<name>">` per screen. Before writing any JSX, search
the component registry (shadcn: `search_items_in_registries`, then the closest examples) and read
what `mock.components` (default `components/shared`) already holds; compose those, never hand-roll a
row, chip or dialog. Inline style is layout only (display, gap, grid, padding, minWidth); when the
registry and the drawing disagree, the registry wins, so change the drawing. The spec's
`mock: keep | drop` decides the page's fate: `drop` (the default) deletes it at review with
`codeloop mock cleanup {id}`, `keep` leaves it in the app.

## Questions to ask before working

## Q1 Does an existing mock in this topic already draw one of these screens?
recommended: Build on it with `--from latest` (the default) rather than starting cold; a chain
that drops a screen without saying so under `screens_removed:` is a regression, not a redesign.
answer:

## Q2 Does any screen need a block the design system does not have?
recommended: Add it to `.codeloop/design-system/blocks.css` with a README row, built from the tokens,
then use it; a block styled inside one mock cannot be reused or checked.
answer:

## Q3 Which state does each screen need to show for this story?
recommended: The state the acceptance line is about (a gate waiting, a list with real rows), plus
empty and error wherever an acceptance line or failure mode names them.
answer:

## Q4 Does any screen need a destructive confirm?
recommended: Draw it as an alert dialog naming what is lost, with the destructive button last and
not primary.
answer:

## Template

See `template.md` in this folder: a full screen composed from the blocks, to copy and fill.

## Rubric

See `rubric.md` in this folder: the criteria `codeloop check rubric` judges this stage by. Each `attest` row needs a `- Rn pass: <evidence>` line under `## Rubric` at the end of the output, the evidence naming a path, a line, a URL or a command. The brief carries the same rows.

## Done

`codeloop check mock {id}` exits 0: every screen named in `screens:` has a section, the tokens and
blocks are exactly the project's design system, no colour literal appears outside them, and every
screen inherited from the parent mock is kept or named under `screens_removed:`.

## Examples

**Good.** `screens: [home, story]`. Home is an `app-frame` with the project's real navigation and
a Needs you list of `list-row`s: real keys, titles, a `pill you` gate and a primary Approve. Story
is a `record` with the property panel filled and the Proof tab showing each acceptance line with a
`pill ok`. Each section has a note naming its acceptance line. The check passes and it looks like
the product.

**Failing, and why.** A section holding a grey box labelled "list goes here", or a screen styled
with its own `style=` colours. The first is not a spec; the second fails `codeloop check mock`
because colours must come from the design system's tokens.
