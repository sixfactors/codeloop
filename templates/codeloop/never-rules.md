# Rules

What must never happen in this repository. Every agent reads this file before it edits; the
reviewer checks every change against it. `codeloop setup` rewrites the never-rules section from
your answers; add your own rules under it.

## Never

| Rule | Enforced by |
|---|---|
| Push straight to the main branch | the pre-push hook |
| Edit a database migration that has already run | the pre-commit hook |
| Show a secret: a key or token in a diff, a log or a page | the pre-commit hook |
| Touch production: a deploy, a live database, a live account | the reviewer, and your approval before release |
| Add a dependency without asking | the reviewer |

## Conventions

None kept yet. `codeloop setup` fills this from what learning found, when you say to keep them.
