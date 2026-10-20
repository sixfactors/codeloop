#!/usr/bin/env bash
# Installs a packed codeloop release as the global `codeloop`, replacing whatever is there (an npm
# link into a checkout, or an earlier tarball), and restarts what runs from it.
#
#   bash scripts/release-install.sh <tarball> [--no-hub]
#
# Refused unless the tarball sits inside $CODELOOP_HOME/releases (default ~/.codeloop/releases)
# and its <name>.sha256 (written by release-pack.sh) matches: a stray tarball elsewhere, such as
# one in a repository root, is never installed. Then: the hub is stopped and its port remembered,
# the hook daemon is stopped, `npm i -g <tarball>` replaces the global package in place, the hub
# starts again from the installed build on the same port (--no-hub skips that), the processes are
# listed, and a dated line goes into $CODELOOP_HOME/v1-freeze.md. A `codeloop mcp` process that a
# running assistant session owns is left alone: it picks up the installed build when that session
# next starts, and this script says so.
set -euo pipefail

HOME_DIR="${CODELOOP_HOME:-$HOME/.codeloop}"
RELEASES_DIR="${CODELOOP_RELEASES:-$HOME_DIR/releases}"
HUB_LOG="$HOME_DIR/hub.log"
NOTE="$HOME_DIR/v1-freeze.md"
START_HUB=1

fail() { echo "release-install: $*" >&2; exit 2; }

TARBALL=""
for arg in "$@"; do
  case "$arg" in
    --no-hub) START_HUB=0 ;;
    -*) fail "unknown option $arg" ;;
    *) TARBALL="$arg" ;;
  esac
done
[ -n "$TARBALL" ] || fail "usage: release-install.sh <tarball under $RELEASES_DIR> [--no-hub]"
[ -f "$TARBALL" ] || fail "$TARBALL is not a file"
[ -d "$RELEASES_DIR" ] || fail "$RELEASES_DIR does not exist; pack a release first"
RELEASES="$(cd "$RELEASES_DIR" && pwd -P)"
REAL="$(cd "$(dirname "$TARBALL")" && pwd -P)/$(basename "$TARBALL")"
case "$REAL" in
  "$RELEASES"/*) ;;
  *) fail "refusing $REAL: a release is installed only from $RELEASES (release-pack.sh puts it there with its sha256)" ;;
esac
NAME="$(basename "$REAL")"
[ -f "$REAL.sha256" ] || fail "refusing $NAME: no $NAME.sha256 beside it; pack the release with release-pack.sh"
(cd "$RELEASES" && shasum -a 256 -c "$NAME.sha256" >/dev/null 2>&1) || fail "refusing $NAME: its sha256 does not match $NAME.sha256"

VERSION="$(tar -xOf "$REAL" package/package.json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")"
GIT_HEAD="$(tar -xOf "$REAL" package/package.json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).gitHead || 'unknown'")"
echo "release-install: $NAME is codeloop $VERSION (gitHead $GIT_HEAD), sha256 verified"

# What runs now, before anything changes.
BEFORE_BIN="$(command -v codeloop || true)"
BEFORE_REAL="$([ -n "$BEFORE_BIN" ] && readlink -f "$BEFORE_BIN" || echo none)"
echo "release-install: global codeloop before: ${BEFORE_REAL}"

HUB_STATE="$HOME_DIR/state/hub.json"
HUB_PORT=""
HUB_HOST="127.0.0.1"
if [ -f "$HUB_STATE" ]; then
  HUB_PORT="$(node -p "try { String(require('$HUB_STATE').port ?? '') } catch { '' }")"
  HUB_HOST="$(node -p "try { require('$HUB_STATE').host || '127.0.0.1' } catch { '127.0.0.1' }")"
  HUB_PID="$(node -p "try { String(require('$HUB_STATE').pid ?? '') } catch { '' }")"
  if [ -n "$HUB_PID" ]; then
    HUB_CMD="$(ps -o command= -p "$HUB_PID" 2>/dev/null || true)"
    echo "release-install: hub pid $HUB_PID on port $HUB_PORT runs: ${HUB_CMD:-nothing (already gone)}"
  fi
  if [ -n "$BEFORE_BIN" ]; then
    echo "release-install: stopping the hub"
    "$BEFORE_BIN" hub --stop || echo "release-install: hub --stop exited $?; going on"
  fi
fi

# The hook daemon: its pid file sits beside its socket. It also exits on its own once the installed
# entry file changes, but a stop here means no hook answers from the old code in the meantime.
HOOKD_PID_FILE="$HOME_DIR/state/hookd.sock.pid"
if [ -f "$HOOKD_PID_FILE" ]; then
  HOOKD_PID="$(cat "$HOOKD_PID_FILE" 2>/dev/null || true)"
  if [ -n "$HOOKD_PID" ] && kill -0 "$HOOKD_PID" 2>/dev/null; then
    echo "release-install: stopping the hook daemon (pid $HOOKD_PID)"
    kill "$HOOKD_PID" 2>/dev/null || true
  else
    echo "release-install: no hook daemon running (stale pid file ${HOOKD_PID:-empty})"
  fi
  rm -f "$HOOKD_PID_FILE" "$HOME_DIR/state/hookd.sock"
fi

echo "release-install: npm i -g $NAME"
npm i -g "$REAL" --no-audit --no-fund --loglevel=error

AFTER_BIN="$(command -v codeloop)" || fail "no codeloop on PATH after the install"
AFTER_REAL="$(readlink -f "$AFTER_BIN")"
PKG="$(npm root -g)/@protoboxai/codeloop"
case "$AFTER_REAL" in
  "$PKG"/*) ;;
  *) fail "the global codeloop resolves to $AFTER_REAL, not inside $PKG" ;;
esac
[ -L "$PKG" ] && fail "$PKG is still a link"
echo "release-install: global codeloop now: $AFTER_REAL ($("$AFTER_BIN" --version))"

if [ "$START_HUB" = 1 ] && [ -n "$HUB_PORT" ]; then
  echo "release-install: starting the hub from the installed build on port $HUB_PORT"
  nohup "$AFTER_BIN" hub --port "$HUB_PORT" --host "$HUB_HOST" >> "$HUB_LOG" 2>&1 &
  disown || true
  for _ in $(seq 1 120); do
    if [ -f "$HUB_STATE" ] && curl -fs -o /dev/null "http://127.0.0.1:$HUB_PORT/api/hub/projects" 2>/dev/null; then break; fi
    sleep 0.5
  done
  if [ -f "$HUB_STATE" ]; then
    NEW_PID="$(node -p "require('$HUB_STATE').pid")"
    echo "release-install: hub pid $NEW_PID runs: $(ps -o command= -p "$NEW_PID" 2>/dev/null || echo 'nothing yet')"
  else
    echo "release-install: the hub has not written $HUB_STATE yet; see $HUB_LOG" >&2
  fi
elif [ "$START_HUB" = 1 ]; then
  echo "release-install: no hub was recorded, none started"
fi

echo "release-install: codeloop processes now"
"$AFTER_BIN" ps 2>/dev/null || ps -eo pid,command | grep -E '[c]odeloop|[h]ookd-main' || true
MCP="$(ps -eo pid,ppid,command | grep -E '@protoboxai/codeloop/.*[d]ist/index\.js mcp$' || true)"
[ -n "$MCP" ] && echo "release-install: these MCP processes belong to running assistant sessions and were left alone; each takes the installed build when its session next starts:" && echo "$MCP"

{
  echo ""
  echo "- $(date -u +%Y-%m-%dT%H:%M:%SZ): installed $NAME (codeloop $VERSION, gitHead $GIT_HEAD) as the global codeloop at $PKG; before: $BEFORE_REAL. Hub ${HUB_PORT:+restarted on port $HUB_PORT }from the installed build."
} >> "$NOTE"
echo "release-install: noted in $NOTE"
echo "release-install: done; run bash scripts/check-frozen.sh to prove it"
