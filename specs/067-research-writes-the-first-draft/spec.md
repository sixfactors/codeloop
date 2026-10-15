# c-067 spec: Research writes the first draft

Story: As a founder, I can get a research page with sources and screenshots and a draft spec before I spend a minute, so that my time goes to deciding, not gathering.

feature: agent-thinks-first
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: time to spec gate
done_when: codeloop research <a proposed card> && codeloop check research <card> --min-sources 3 && codeloop check file specs/<card>/spec.md --has 'Story: As a' --has '- US1' --has '## Not building'

exists: unlock (research.md; the research half runs today, the draft spec and the backlog path are new code, so the card does not close)

acceptance:
- US1 Given a proposed card, when `codeloop research <id>` runs, then research.md has an `exists:` verdict and three `- source:` lines with URLs, spec.md has a Story line, at least one US line and a non-empty `## Not building`, and the card is at the interview stage heading for the spec gate, under 30 minutes on a dogfood card.
- US2 Given an agent with no browser, when research runs, then a `screenshots: none` line passes the check; given Chrome MCP is present, then screenshots are saved under the spec folder and each path on the `screenshots:` line exists.
- US3 Given research.md with no source under `.codeloop/wiki/competitors/`, or an `exists:` of have, unlock or port with no path or URL, or a spec.md still on the template, when the research stage's done cmd runs, then it exits 1 naming the missing line.
- US4 Given a verdict of `have` or `unlock`, when the research run ends, then the card is parked at research with one inbox question "close? recommended yes", the lane slot is freed, and the card is never closed by the run.
- US5 Given the Monday plan run, when it runs, then `codeloop research` starts on the top five proposed cards and on none other; a scan proposal alone starts no research.

screens: none

assumption: a researched backlog card whose verdict is `build` stays in the build lane (research, then interview) and counts against `wip:` from the moment `codeloop research` runs; the owner's Q3 answer says it reaches the spec gate, the wip count is inferred (interview.md R7-1).
assumption: the Monday plan run calls `codeloop research <card>` on each of the top five proposed cards, which is the build lane's research stage, skill and check; `.codeloop/lanes/plan.yaml`'s own research stage is unchanged (interview.md R7-4).

## Not building

- Research on every scan proposal: the owner's Q2 answer limits it to on demand and the Monday top five, for cost.
- Auto-closing a card on a `have` or `unlock` verdict: Q5, the run asks and parks, never closes.
- A TypeScript fetcher that writes research.md with no agent: the `exists:` verdict is a judgement over this codebase, and there is no web search without an API key (research.md `## Options`, second bullet).
- A separate `draft` stage between research and interview: one more agent run per card, and the interview would read a third file (research.md `## Options`, third bullet; c-116 is cutting stages).
- Required screenshots: no code path takes one; best-effort through Chrome MCP only (Q1).
- A web search API key in `.codeloop/config.yaml`: the agent's own tools search the web.

## Failure modes

- Three URLs answer `--online` and settle nothing: the check requires one source under `.codeloop/wiki/competitors/` and an `exists:` line with a path or URL (US3).
- A headless run fails because no screenshot exists: `screenshots: none` satisfies the check (US2).
- The draft `## Not building` contradicts the interview answers: the interview treats the draft as proposals it may strike, and the spec stage rewrites spec.md, never appends.
- The plan lane's research stage and the build lane's drift apart: the Monday run calls the build stage's command, plan.yaml's stage is not a second implementation (assumption above).
- The board shows a backlog card in flight before the founder chose it: `codeloop research` moves a proposed card into research, so the inbox names it as research-started, not founder-started.
- `check file` passes on template text: the `--has` strings are `Story: As a` and `- US1`, which the template's `Story: As a <persona>` line also contains, so the check must reject a Story line that still holds `<persona>` or the US line that still holds `<state>`.
