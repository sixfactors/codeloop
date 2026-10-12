# mock checklist

- [ ] `codeloop check mock {id}` passes
- [ ] Every screen named under `screens:` has a `<section data-screen>`
- [ ] Each screen is built from `.codeloop/design-system/` blocks: app frame, rows, tiles, records, pills
- [ ] No styling inside the mock: a missing block was added to the design system instead
- [ ] Real content throughout: real titles, keys, names, numbers and copy; no lorem ipsum or grey boxes
- [ ] The state the story is about is drawn, plus empty and error where the acceptance lines name them
- [ ] A `<p class="note">` under each screen names what it proves and its acceptance line
- [ ] Opened in a browser at desktop and phone width: no overflow, nothing clipped
- [ ] Screens inherited from the parent mock are kept, or listed under `screens_removed:` with a reason
