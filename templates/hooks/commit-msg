#!/bin/sh
# Installed by `codeloop init --hooks`. Adds a `Feature: <card-id>` trailer when the branch name
# contains a card id (feat/CL-001-lane-engine, fix/c-012-export) and the message has none.
branch=$(git symbolic-ref --quiet --short HEAD) || exit 0
id=$(printf '%s' "$branch" | grep -oE '[A-Za-z]{1,10}-[0-9]{1,6}' | head -1)
[ -n "$id" ] || exit 0
grep -q '^Feature: ' "$1" && exit 0
git interpret-trailers --in-place --trailer "Feature: $id" "$1"
