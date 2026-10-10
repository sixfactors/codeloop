## Q1 Scope: Fly and Vercel integrations, deploy guard, smoke test, GitHub Environment gate. Which first?
recommended: Fly plus smoke first with chanl-api as the real target and `deploy-guard.sh` ported as-is; Vercel and the GitHub Environment gate are a child card.
answer: 

## Q2 What is the smoke test: health, one authenticated request and a host assert (the chanl standard), plus a headless DOM check for frontends?
recommended: Health, one authed request, host assert; the headless DOM and zero-console-errors check only when the plugin detects a frontend.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a card at the prod gate, when `approve`, then prod.md has the deploy log and `result: pass` from the smoke and the card is live; a failed smoke leaves `result: fail`, the card stays at live-stage, and no second deploy runs.
answer: 

## Q4 Riskiest assumption: an agent deploying prod. Does approve trigger the deploy or only allow it?
recommended: Approve allows; the deploy runs only from `codeloop next` run by a person or an explicit `run --agent --allow-deploy`; never from the cron schedule.
answer: 

## Q5 Rollback: in this card?
recommended: No, under Not building; the guard already refuses a deploy from a commit not reachable from main with a tag.
answer: 
