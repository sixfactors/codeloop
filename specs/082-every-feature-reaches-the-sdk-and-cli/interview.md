## Q1 Scope: a pre-gate check "SDK exposes it, CLI shows it, or `none: reason`". Same mechanism as c-079's `docs:` lines?
recommended: Yes: `sdk:` and `cli:` lines in spec.md, same seam check as c-079; c-079 ships first and this reuses it.
answer: 

## Q2 What proves "exposes": a method name in the diff, a use case at that layer, or a CLI command run?
recommended: A use case at layer `sdk` and one at `cli` under `usecases/<nnn>/`; verify runs them.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a card adding an API route with no sdk use case, when `next` at verify, then exit 2 names the missing layer; adding the use case or `sdk: none: internal` passes.
answer: 

## Q4 Riskiest assumption: most cards are UI or internal and this nags.
recommended: The plugin's `detect` fires only when the diff touches a controller or route file; otherwise it is silent.
answer: 

## Q5 Which SDK repos: chanl-admin's platform-sdk, the public chanl-sdk, or both?
recommended: Both, listed under `repos:` in config; the public SDK is the one that must not fall behind.
answer: 
