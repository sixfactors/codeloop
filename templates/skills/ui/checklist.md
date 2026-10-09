# ui checklist

- [ ] `codeloop task check {id} --all-done && npm test` passes
- [ ] `codeloop check mock {id}` passes, where the lane runs a `mock` stage
- [ ] Every `[ui]` task ticked, each tracing to an acceptance line
- [ ] Every screen in `spec.md`'s `screens:` list is a real route in the app, not a standalone
  HTML artifact
- [ ] Every screen is wired to a real SDK hook from the `sdk` stage
- [ ] All seven states present on every screen: default, hover, focus-visible, active, disabled,
  loading, empty
- [ ] No hardcoded color (`#hex`, raw `rgb()`/`oklch()`, non-semantic Tailwind color utility)
- [ ] No off-scale spacing value
- [ ] No edit to a vendored primitive component, wrapped instead
- [ ] Responsive at the app's smallest and largest supported widths
- [ ] Every mock/registry divergence is noted with its reason
- [ ] `data-testid` (or the app's equivalent) present on every new interactive element
