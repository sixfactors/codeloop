## Q1 Scope: the mock becomes a route in the app built from `components/shared/`, with a screen inventory spine and `ui-spec-compare` as the check. Does the current HTML mock template go away?
recommended: Route-in-app replaces the HTML template where the plugin detects Next plus shadcn; the current `mock` template stays for repos with no app.
answer: 

## Q2 How does the board find the mock: a `mock:` line in spec.md with the route?
recommended: `mock: /mocks/<nnn>` in spec.md; `serve` links it and the local gate note carries a screenshot.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given chanl-admin, when the mock stage runs for a card, then `app/mocks/<nnn>/page.tsx` exists importing only `components/shared` and `components/ui`, and the build done-check runs ui-spec-compare between the mock route and the built route with divergence under the threshold.
answer: 

## Q4 Riskiest assumption: mock routes ship to prod.
recommended: The `/mocks` route group is gated by `NEXT_PUBLIC_MOCKS=1` and the deploy check fails if it is set in prod env.
answer: 

## Q5 What is the screen inventory spine and who updates it?
recommended: `docs/screens.md`: route, components, card; the mock stage appends a row; the check fails on a new route without one.
answer: 
