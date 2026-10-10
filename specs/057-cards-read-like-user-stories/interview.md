## Q1 Scope: does this card only add the check, or also rewrite the existing cards on the board? Both, or check only?
recommended: Check only. The 32 proposals were rewritten by hand today and the migration already filled their fields; new cards go through the check from now on.
answer: 

## Q2 When a title fails, refuse the card or create it with a warning? Refuse, warn, or refuse unless --force?
recommended: Refuse unless --force, and print the failing rule with a rewritten example so the agent fixes it on the next try.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a title with a flag or a file name, when an agent runs card new, then it exits 2 naming the rule; given a story with no so-that, then it exits 2; given a plain-words card with all three parts, then it is created and check story prints ok.
answer: 

## Q4 Riskiest assumption: agents will keep writing technical titles and just add --force. What stops that?
recommended: --force is logged as an event on the card and shows as a badge on the board; stats counts forced cards per week, and the plan lane refuses to rank a forced card.
answer: 

## Q5 Should personas be fixed (founder, builder, reviewer, dev, visitor, team) or open per repo?
recommended: Fixed six plus personas: in config.yaml with a pain line each; an unknown persona fails the check so the persona list stays the ranked ICP list and not a free text field.
answer: 
