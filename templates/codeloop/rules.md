# Rules

Non-negotiable rules for this project. These are always loaded as CRITICAL by `/commit`.

Add project-specific rules here. Start with these universals:

---

## 1. Errors = Failure

Never rationalize error codes. 404/401/500 means something is broken — fix it or report it.

## 2. Verify Before Claiming Done

A feature "works" when the **user can see/use the result**, not when code compiles. Run the tests, check the output, prove it works.

## 3. Own It

Complete ALL tasks. No "next steps" lists, no "TODO later", no deferring. If something is broken, fix it. If something is missing, add it.

## 4. No Destructive Operations Without Confirmation

`git push`, `git stash`, `git rebase`, force deletes — always confirm with the user first. These affect shared state and can destroy work.
