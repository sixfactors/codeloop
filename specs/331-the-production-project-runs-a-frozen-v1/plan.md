# c-331 plan: The production project runs a frozen v1 that new builds cannot change

## Layers touched

api (three shell scripts under scripts/), docs (CLAUDE.md, package.json version), test (check-frozen.sh).

## Files

- scripts/release-pack.sh
- scripts/release-install.sh
- scripts/check-frozen.sh
- package.json
- package-lock.json
- CLAUDE.md
- specs/331-the-production-project-runs-a-frozen-v1/

## Risks

- The pack picks up uncommitted edits: it extracts `git archive <tag>` into a scratch folder and sets gitHead to the tag's commit; check-frozen.sh compares the installed gitHead to the tag.
- A hub or hook daemon started from the checkout keeps serving old code: release-install.sh stops both before the install and starts the hub again from the installed binary; check-frozen.sh fails while any process runs a script under the checkout's dist.
- npm writes the bin somewhere the cron line does not name: check-frozen.sh resolves the binary each `# codeloop:` crontab line names and requires it inside the installed package.
- The stray tarball in the repository root gets installed: release-install.sh refuses a tarball outside ~/.codeloop/releases or without its sha256 file.
