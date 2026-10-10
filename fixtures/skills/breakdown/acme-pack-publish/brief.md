# pack-publish brief: Let a workspace publish a skill pack from the web app

problem: A workspace that has installed or built several skills in Acme has no way to turn a
chosen set of them into one thing a developer installs elsewhere. Every skill sits alone in the
workspace's library; sharing them today means telling a developer to copy each MCP URL and config
one at a time.
users: team

## What exists

exists: have, the workspace skill library and the one-server install page for a single skill
already ship (apps/web/app/skills/page.tsx, apps/web/app/install/[slug]/page.tsx)
exists: unlock, `pack build` on the CLI already assembles a skill pack from a manifest and
uploads it to the catalog (packages/cli/src/commands/pack.ts); the web app has no UI for it
exists: build, there is no way in the web app to select skills into a draft pack, save it, or
reopen it

## Sources

- source: https://acme.example/docs/skills — the library page today, one card per skill, no
multi-select
- source: packages/cli/src/commands/pack.ts — `pack build` reads a manifest and calls the catalog
API, already shipped on the CLI
- source: .codeloop/wiki/decisions/role-packs.md — the 2026-09-13 decision that packs are
an explicit install, not an automatic bundle, and that the web app is the store
