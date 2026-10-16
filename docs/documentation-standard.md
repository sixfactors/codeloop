# Documentation standard

Status: current. Set 2026-10-16 after the owner read the published docs and found pages that
point a web reader at repository files, open with a definition instead of the problem, and narrate
where the author got their text. Applies to every page under `site/content/docs/` and to any
page in `docs/` meant for a reader who is not working on codeloop's code.

## Who reads a page

A developer who has not installed codeloop, or installed it an hour ago, reading one page in a
browser tab. They did not read the previous page. They cannot open a file in the repository. They
will leave the page the moment it asks them to go somewhere else to understand the next sentence.

## The shape of every page

Every page runs in this order. A page that cannot be written in this order is two pages.

1. **The problem.** One or two sentences on what goes wrong without this, in the reader's work.
   "An agent that may move its own card will mark its own work done" is a problem. "A gate is a
   stage attribute" is not.
2. **What codeloop does about it.** The one sentence that answers the problem.
3. **How it works.** The mechanism, short, with the one command or file the reader will meet
   first and its real output.
4. **Everything else.** Options, edge cases, the config block, the table, in the order a reader
   meets them. Facts that are not yet true go under a heading that says so.

The first screen of the page, before any scrolling, carries 1, 2 and the start of 3.

## Self-contained

- A page never sends the reader to the repository. A path such as `scripts/demo.sh` or
  `docs/terminology.md` is not a reference the reader can follow. If the content is needed, it is
  on the page; if it is only a pointer, it is a link to the file on GitHub, or it is deleted.
- A word the page relies on is defined on the page, in one sentence, the first time it is used.
  Stripe defines idempotency keys where they appear, not in a glossary.
- A config block, table or command the reader needs to follow the page is on the page, even when
  another page also has it. Repetition between pages is cheaper than a reader lost between them.
- A link to another docs page is a next step, placed where the reader would want it, never a
  substitute for a sentence. "See Lanes" in the middle of a paragraph is a sentence that was not
  written.
- The page says what the reader can run to see a claim for themselves. "The script passed 75
  checks" is a claim about the author's machine; `codeloop demo founders-week` is a claim the
  reader can test.

## One kind of page at a time

The four kinds from Diátaxis, and the section of the site each lives in:

| Kind | Reader is | Section | The page does |
|---|---|---|---|
| Tutorial | learning by doing | Start | one path, every step, real output, no options |
| How-to | doing a task they already understand | Guides | the steps for one goal, choices named, nothing taught |
| Explanation | trying to understand | Concepts | the problem, the mechanism, the trade-offs |
| Reference | looking something up | Reference | complete, flat, tabular, no persuasion |

A tutorial that stops to explain, or an explanation that turns into steps, is two pages. The
problem-first shape above applies to all four; in a reference page the problem is one line.

## Use-case pages

The owner, 2026-10-16, on the founder's week page: "too cryptic/technical - we need to explain a
summary of what is the problem first, how human would do it without codeloop and then add how
codeloop helps". A use-case page is a how-to told from the reader's job, and the Use cases
section of the site is the list of them. Each page runs:

1. **The problem**, in the words of the person who has it. No codeloop words yet.
2. **Without codeloop.** How a person does this today, step by step, and where it goes wrong:
   what they forget, what they cannot see, what the agent claims that nobody checked.
3. **With codeloop.** The same job with the lane, the gates and the commands, with real output
   where a page already has it. The reader should see which of the steps above disappear and
   which become a one-click approval.
4. **What you still do.** The decisions that stay with the person, named as gates.
5. **Not yet**, when part of the job is still by hand.

A use-case page names one lane and links to its reference row as a next step. The title says
what the reader gets, in their words: "Ship a feature you did not watch being built", not
"The build lane".

## Sentences

- Second person, present tense, active voice. "You approve the gate", not "the gate is approved".
- The condition before the instruction: "When the check fails, the card parks", not "The card
  parks when the check fails", so the reader knows whether the sentence is for them before reading it.
- Short everyday words. Cut any word the sentence survives without.
- Plain statements. State the fact and its consequence; no "X is a Y, not a Z" contrasts, no
  rhetorical questions, no sentence whose only job is to sound decisive.
- No em dashes. A comma, a full stop or a spaced hyphen.
- No narration and no provenance: nothing about how the page was researched, which build it was
  checked against, what an earlier plan called for, or which file the quotes came from. The page
  states what is true now. Chronology lives in the changelog.
- What is not done is stated as a fact under its own heading, with what the reader will see
  instead. Never as an apology and never hidden in a caveat clause.

## Before a page is published

1. Read only the first screen. Does it name the problem, the answer and the first command?
2. Grep the page for `/` paths that are not URLs and not something the reader types. Each one is
   inlined, linked to GitHub or deleted.
3. Grep for the em dash character, "see ", "repo", "at research time", "this build", "the plan". Each hit is fixed.
4. Every `/docs/` link resolves to a page in `site/lib/docs.ts`; every anchor to a heading.
5. Every claim of "works" names the command that shows it.
6. One kind of page. If the page teaches and lists, split it.

## Sources

The shape and the rules above are taken from the following, adapted to a one-person docs site:
the four-kinds split and the rule that a page is one kind only from
[Diátaxis](https://diataxis.fr/); self-contained pages, second person, active voice and
conditions before instructions from the
[Google developer documentation style guide](https://developers.google.com/style/highlights);
define a term where it is first used and keep the code beside the prose so the reader never leaves
the page, from the way [Stripe's docs](https://docs.stripe.com/) are built; start from the
reader's real task and support recovery from error, from John Carroll's minimalism
(*The Nurnberg Funnel*, 1990). The problem-first order is the owner's rule, 2026-10-16.
