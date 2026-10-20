#!/usr/bin/env bash
# One check, run before and after any v2 test, rehearsal or dogfood session, that proves v1 and the
# production project were left alone.
#
#   bash scripts/v1-untouched.sh snapshot [options]     records what v1 depends on
#   bash scripts/v1-untouched.sh compare  [options]     exits 0 when nothing v2 could damage changed,
#                                                        1 listing each changed path, 2 on misuse
#
# Options (defaults in brackets):
#   --home <dir>       the v1 home [$CODELOOP_V1_HOME, else ~/.codeloop]
#   --project <dir>    the production project [the registry's ops-ai entry]
#   --file <path>      the snapshot file [<home>/v1-untouched.snapshot.json, outside everything hashed]
#   --binary <path>    the global codeloop to resolve [`command -v codeloop`]
#   --crontab <cmd>    the crontab command to list with [crontab]; --no-crontab skips it
#
# What is compared: the v1 home's projects.json; the hub record's port and host; the global binary's
# resolved path and the installed package's version, gitHead and file tree; the codeloop-tagged
# crontab lines; the project's hook and MCP settings and where its cards.json link points; and the
# board behind that link, per card, as a prefix: the events recorded at the snapshot must be the
# first events of the card now, so v1's own appends pass and a dropped or edited old event fails.
exec node "$(dirname "$0")/v1-untouched.mjs" "$@"
