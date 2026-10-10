---
name: ui
stage: build
lane: build
inputs:
  - .codeloop/wiki/architecture/*.md
  - specs/{id}/spec.md
  - "the sdk stage's hooks for the data this card shows"
  - "the app's existing component registry (components/ui, components/shared, components/<feature>)"
  - "the app's design tokens (globals.css or equivalent)"
outputs:
  - "one real route/page per screen named in spec.md's screens: list"
  - "every required interactive state (default, hover, focus, active, disabled, loading, empty)"
  - "specs/{id}/tasks.md: every [ui] line ticked"
check: "codeloop task check {id} --all-done && npm test"
questions: 5
---

# ui

Build the screens named in the card's `spec.md` (`screens:` list) as real routes in the app, using
the app's own component registry and tokens, with every required state. The card's mock, drawn
in the `mock` stage, checked by `codeloop check mock {id}`, is the spec for what these screens
look like; this stage builds the real thing from the same components the mock was supposed to be
drawn from, not a fresh interpretation.

## Role

The builder working the `[ui]` tasks in `specs/{id}/tasks.md`, after `sdk` has exposed the data
this card shows. Per `docs/architecture.md`, this stage calls only the SDK's hooks, never a raw
fetch, never a second copy of a type the SDK already declares, never a client-side join of two
calls that the API should have returned pre-joined.

## Inputs

- `specs/{id}/spec.md`, the `screens:` list (one name per screen the mock drew) and the
  acceptance lines each screen must satisfy.
- The card's mock, if the lane ran a `mock` stage before `build`, the shipped screens must match
  it in substance; where the registry and the mock disagree, the registry wins and the mock is
  the one that's wrong.
- The SDK's hooks for this entity, from the `sdk` stage.
- The app's existing component registry: a UI framework's component library (shadcn, Material,
  etc.) if the project vendors one, plus the app's own shared/feature component folders. Read
  what already exists before writing a new component.
- The app's design tokens file, the semantic color/spacing scale already defined for this app.

## Procedure

1. **Read the screen list and the mock.** For each screen name in `spec.md`, find its section in
   the card's mock (if one exists) and the acceptance line(s) it serves.
2. **Search the registry before writing anything.** Look for an existing block, page pattern, or
   component that already does most of this screen. Whole patterns usually exist, a list +
   detail layout, a data table with filters, a multi-step dialog. Check the app's own pages for
   the closest existing screen and copy it.
3. **Check shared components** for anything this screen needs that isn't a registry primitive -
   empty states, loading skeletons, card wrappers. A second hand-rolled empty-state markup when
   one already exists is the mistake this step prevents.
4. **Build the route as a real page**, wired to real data via the SDK hook from the `sdk` stage -
   never hardcoded mock data in the shipped route. If the task is explicitly a "mock the screen
   with fake data" task ahead of a backend that doesn't exist yet, say so in the task and still
   build it as a real route in the app (not a standalone HTML file), so it inherits the app's
   fonts, layout, and components.
5. **Cover every required state** for the screen: default, hover, focus-visible, active,
   disabled, loading, and empty. A screen that only renders the happy path with data present is
   not done, check what it looks like with zero items, with the request pending, and with an
   error.
6. **Tokens only.** No hardcoded hex, no raw Tailwind color utility outside the semantic scale, no
   arbitrary spacing value. If a token the app needs doesn't exist yet, add it to the tokens file
   in every mode the app supports (light/dark), not as a one-off inline value.
7. **Responsive check.** Render the screen at the app's smallest supported width and its largest.
   No horizontal scroll introduced by this screen unless the screen is a data table that
   explicitly allows it.
8. **Where the registry and the mock disagree**, follow the registry and note the divergence
   (in the PR description or a comment on the task) rather than reproducing the mock exactly with
   a custom component.
9. **Tick the task**, move to the next `[ui]` task.
10. **When every `[ui]` task is ticked**, run `codeloop task check {id} --all-done && npm test`,
    then `codeloop check mock {id}` if the lane's `mock` stage applies to this card, to confirm
    the shipped screens still match what the spec named.

## Stack notes

**Next.js (App Router).** Each screen is a route under `app/`, a server component where the data
can be fetched server-side or a client component (`'use client'`) when it needs the SDK's
TanStack Query hooks. Keep data fetching in one or the other, not split across both for the same
screen. Loading and error states use `loading.tsx` / `error.tsx` at the route level, in addition
to in-component skeletons for partial loads.

**NestJS-served frontend (same monorepo).** The UI never calls the NestJS service directly, it
goes through the SDK, which already knows the response envelope and field conventions (`.id`,
pagination shape). Don't re-detect the envelope shape in a component.

**Express-served SPA.** Routes are client-side (React Router or similar); the loading state for a
route transition is a skeleton rendered immediately, not a blank screen while the bundle or data
loads.

**FastAPI backend, separate frontend.** Same rule as NestJS: the UI calls the SDK, not the FastAPI
routes directly. If the backend serves server-rendered templates instead of an API (no SDK layer
in play), this skill still applies to the templates themselves, screens, states, and tokens, built
from whatever component/partial system the templating stack already has.

## Questions to ask before working

## Q1 Does a registry block or an existing app page already cover most of this screen?
recommended: Yes, by default, search before building; name what's being copied and what's
changing.
answer:

## Q2 Is this screen's data ready from the sdk stage, or does this task need to mock data temporarily?
recommended: Build the real route wired to the real hook whenever the sdk stage for this card is
done; only mock data inside the real route's markup when the backend genuinely isn't ready yet,
and say so in the task.
answer:

## Q3 Where does the mock and the registry disagree, if anywhere?
recommended: Registry wins; note the divergence rather than reproducing the mock pixel for pixel
with a custom component.
answer:

## Q4 Does this screen need a new design token, or does an existing semantic token already cover the case?
recommended: Check the existing semantic scale first; add a token only when genuinely new, in
every theme mode the app supports.
answer:

## Q5 What does this screen look like with zero items, a pending request, and a failed request?
recommended: Build all three before calling the screen done, not just the happy path with seeded
data.
answer:

## Template

See `template.md` in this folder for the per-screen state checklist to fill before marking a
`[ui]` task done.

## Checklist

- [ ] `codeloop task check {id} --all-done && npm test` passes
- [ ] `codeloop check mock {id}` passes, if the lane's `mock` stage applies to this card
- [ ] Every `[ui]` task ticked, each tracing to an acceptance line
- [ ] Every screen named in `spec.md`'s `screens:` list exists as a real route in the app
- [ ] Every screen is wired to a real SDK hook, not hardcoded or mock data left in the shipped
  route
- [ ] Every screen has all seven states: default, hover, focus-visible, active, disabled,
  loading, empty
- [ ] No hardcoded color, no off-scale spacing value, anywhere touched by this card
- [ ] No modification to a vendored primitive component, extensions are wrapped, not edited in
  place
- [ ] Responsive at the app's smallest and largest supported widths, no new horizontal scroll
- [ ] Every divergence from the mock is noted, with the reason the registry won

## Done

`codeloop task check {id} --all-done && npm test` exits 0, and `codeloop check mock {id}` exits 0
when the card's lane includes a `mock` stage, confirming the shipped screens still draw every
screen the spec named, from the shared template, with no colors outside the app's tokens.

## Examples

**Good.** Task: `[ui] T006 [US2] Build the workspace settings screen`. Built as
`app/dashboard/settings/page.tsx`, using the app's existing `PageLayout` + `SettingsSection`
components, wired to `useWorkspaceSettings()` and `useUpdateWorkspaceSettings()` from the `sdk`
stage. Loading state is a `Skeleton` matching the form's shape; the save button shows a spinner
and disables while the mutation runs; an empty state isn't applicable here (settings always
exist) so the task notes that explicitly rather than skipping it silently. Colors and spacing are
all semantic tokens already defined in the app.

**Failing, and why.** Same task, built as a new standalone component with inline hex colors
matching the mock's screenshot pixel-for-pixel, hardcoded `padding: 13px`, a `fetch()` call inside
a `useEffect` instead of the `sdk` stage's hook, and no loading or disabled state on the save
button. It looks right once, on one screen size, with the network already warm. It breaks in dark
mode (no tokens to swap), lets a user submit the form twice before the first request returns
(no disabled state), and would need to be rebuilt the next time the settings shape changes,
because nothing routes through the SDK.
