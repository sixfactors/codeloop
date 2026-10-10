# Spec checklist, c-{nnn}

- [ ] title ≤ 12 words, none of `` ` `` `--` `:` `.yaml` `.md` `/` `()`, no camelCase token
- [ ] story has all three parts: persona, "I can", "so that"
- [ ] persona is known (built-in six, or listed under `.codeloop/config.yaml` `personas:`)
- [ ] `size:` is S, M, or L; an L is split before the spec gate
- [ ] `metric:` present and defined under the lane or in `wiki/numbers/`
- [ ] `done_when:` is a command or a screen, never "all stories complete"
- [ ] `acceptance:` is 1–5 lines, each `Given ... when ... then ...`
- [ ] `screens:` names match the mock's sections, or says `screens: none`
- [ ] every acceptance line has at least one task
- [ ] every task has exactly one layer tag (`api`, `sdk`, `ui`, `test`, `docs`)
- [ ] `codeloop spec check {id}` exits 0
