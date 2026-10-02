#!/usr/bin/env bash
# Use cases for CL-001. Each case builds a throwaway project in a temp dir and drives the CLI
# that is running `codeloop verify` (it is on PATH as `codeloop` for use-case runs).
#   bash usecases/001/uc.sh <us1|us2|us3|us4|us5>
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
mkdir -p .codeloop/lanes
unset CODELOOP_ROLE

lane() { # lane <stages yaml>
  printf 'id: market\nversion: 1\nmetric: { name: m, source: cards }\n%s\n' "$1" > .codeloop/lanes/market.yaml
}
field() { codeloop card show c-1 --json | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.$1)"; }
refused() { local got=0; "$@" > /dev/null 2>&1 || got=$?; [ "$got" = 2 ] || { echo "expected exit 2, got $got: $*"; exit 1; }; }
# Each assertion is its own command: under set -e a failing test inside an && list would not stop the script.
is() { [ "$(field "$1")" = "$2" ] || { echo "expected $1 = $2, got $(field "$1")"; exit 1; }; }
GATED='stages:
  - id: draft
    done: { cmd: "true" }
    gate: { name: copy, approver: owner }
  - id: ship
    done: { cmd: "true" }'

case "$1" in
  us1)
    lane 'retries: 2
stages:
  - id: draft
    done: { cmd: "false" }'
    codeloop card new market t --id c-1 > /dev/null
    refused codeloop card advance c-1
    is stage draft
    is retries.draft 1
    is gate undefined
    refused codeloop card advance c-1
    is stage draft
    is gate stuck
    echo "stays-then-stuck"
    ;;
  us2)
    lane "$GATED"
    codeloop card new market first --id c-1 > /dev/null
    node --input-type=module -e "
      import { readCards, writeCards, ConflictError } from '$ROOT/dist/lib/cards.js';
      const a = readCards('.'), b = readCards('.');
      writeCards('.', a, [...a.cards, { ...a.cards[0], id: 'c-2' }]);
      try { writeCards('.', b, []); console.log('second write landed'); process.exit(1); }
      catch (e) { if (!(e instanceof ConflictError)) throw e; }
      if (readCards('.').cards.length !== 2) { console.log('a write was lost'); process.exit(1); }
      console.log('conflict-no-lost-write');
    "
    ;;
  us3)
    lane "$GATED"
    codeloop card new market t --id c-1 > /dev/null
    codeloop card advance c-1 > /dev/null
    refused codeloop card approve c-1 --as agent
    is gate copy
    codeloop card approve c-1 --as owner > /dev/null
    is stage ship
    echo "agent-refused-owner-releases"
    ;;
  us4)
    printf 'gates:\n  mode: trusted\n' > .codeloop/config.yaml
    lane 'stages:
  - id: draft
    done: { cmd: "true" }
    gate: { name: copy, approver: owner }
  - id: publish
    done: { cmd: "true" }
    gate: { name: publish, approver: owner, outward: true }'
    codeloop card new market t --id c-1 > /dev/null
    codeloop card advance c-1 > /dev/null
    is stage publish
    is gate publish
    refused codeloop card advance c-1
    echo "outward-gate-stops"
    ;;
  us5)
    lane "$GATED"
    codeloop card new market t --id c-1 > /dev/null
    for n in 1 2 3; do
      codeloop card advance c-1 > /dev/null
      codeloop card reject c-1 --as owner --note "too vague $n" > /dev/null
    done
    codeloop lane propose > /dev/null
    grep -q c-1 .codeloop/proposals/market-draft-1/why.md
    refused codeloop lane promote market-draft-1 --as owner
    [ "$(codeloop lane show market | grep '^version')" = "version: 1" ] || { echo "lane version changed"; exit 1; }
    echo "proposal-cites-cards-promote-refused"
    ;;
  *) echo "unknown case $1"; exit 64 ;;
esac
