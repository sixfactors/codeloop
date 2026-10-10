## Q1 Scope: `docs:` and `site:` lines in spec.md plus a check that they are satisfied or `none: <reason>`. Are the section templates and StoryBrand copy rules in?
recommended: Lines and check in; copy rules go in the plugin's rules.md as advice; section templates out.
answer: 

## Q2 What satisfies a line: a commit in the named repo with the `Feature: <id>` trailer, or just a pointer?
recommended: A commit with the trailer in the docs or site repo, found by reconcile; `none: <reason>` passes and the reason is shown at the pr gate.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a card with `site: pricing page`, when `next` at pr, then it fails until a trailer commit exists in chanl-site; with `site: none: internal` it passes and the gate note shows the reason.
answer: 

## Q4 Riskiest assumption: every card says `none` and the check is theatre.
recommended: The inbox prints "features live without docs this month" (the card's metric); that number is the evidence, not the check.
answer: 

## Q5 Does the docs or site repo need codeloop installed?
recommended: No; reconcile reads it through `gh` or a local path listed under `repos:` in config.
answer: 
