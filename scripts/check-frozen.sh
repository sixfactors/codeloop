#!/usr/bin/env bash
# Proves the production project runs the frozen release and nothing from this checkout.
#
#   bash scripts/check-frozen.sh [tag] [project-dir]      default v1.0.0, the ops-ai project
#
# Checks, each printed as PASS or FAIL; exits 1 when any fails:
#   1. `which codeloop` resolves (links followed) inside the global node_modules package folder,
#      and that folder is a real directory, not a link.
#   2. The installed package.json carries the tag's version and gitHead (release-pack.sh writes
#      gitHead from the tag, so a tarball packed from a dirty tree, or from another commit, fails).
#   3. `codeloop --version` run inside the project prints the tag's version.
#   4. Every codeloop crontab line (`# codeloop:` marker) names a binary or schedule script that
#      resolves to the installed package.
#   5. No codeloop process runs a script from this checkout's dist or .test-dist.
#   6. The recorded hub, when one runs, runs from the installed package.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TAG="${1:-v1.0.0}"
PROJECT="${2:-}"
HOME_DIR="${CODELOOP_HOME:-$HOME/.codeloop}"
fails=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; fails=$((fails + 1)); }

if [ -z "$PROJECT" ]; then
  PROJECT="$(node -p "try { (require('$HOME_DIR/projects.json').find(p => p.id === 'ops-ai') || {}).path || '' } catch { '' }")"
fi

PKG="$(npm root -g)/@protoboxai/codeloop"
BIN="$(command -v codeloop || true)"
REAL="$([ -n "$BIN" ] && readlink -f "$BIN" || echo none)"
case "$REAL" in
  "$PKG"/*) pass "codeloop is $BIN -> $REAL, inside $PKG" ;;
  *) fail "codeloop is $BIN -> $REAL, not inside $PKG" ;;
esac
if [ -d "$PKG" ] && [ ! -L "$PKG" ]; then pass "$PKG is a real directory"; else fail "$PKG is $([ -L "$PKG" ] && echo 'a link' || echo 'missing')"; fi

WANT_SHA="$(git -C "$ROOT" rev-parse --verify --quiet "refs/tags/$TAG^{commit}" || true)"
WANT_VERSION="$(git -C "$ROOT" show "$TAG:package.json" 2>/dev/null | node -p "try { JSON.parse(require('fs').readFileSync(0,'utf8')).version } catch { '' }")"
if [ -z "$WANT_SHA" ]; then fail "no tag $TAG in $ROOT"; fi
GOT_VERSION="$(node -p "try { require('$PKG/package.json').version } catch { '' }")"
GOT_SHA="$(node -p "try { require('$PKG/package.json').gitHead || '' } catch { '' }")"
if [ -n "$WANT_VERSION" ] && [ "$GOT_VERSION" = "$WANT_VERSION" ]; then pass "installed package.json version $GOT_VERSION matches $TAG"; else fail "installed package.json version is '$GOT_VERSION', $TAG says '$WANT_VERSION'"; fi
if [ -n "$WANT_SHA" ] && [ "$GOT_SHA" = "$WANT_SHA" ]; then pass "installed gitHead $GOT_SHA is the $TAG commit"; else fail "installed gitHead is '$GOT_SHA', $TAG is '$WANT_SHA' (packed from another commit or a dirty tree)"; fi

if [ -n "$PROJECT" ] && [ -d "$PROJECT" ]; then
  RUN_VERSION="$(cd "$PROJECT" && codeloop --version 2>/dev/null || echo '')"
  if [ "$RUN_VERSION" = "$WANT_VERSION" ]; then pass "codeloop --version in $PROJECT prints $RUN_VERSION"; else fail "codeloop --version in $PROJECT prints '$RUN_VERSION', wanted '$WANT_VERSION'"; fi
else
  fail "no project directory to run in (pass one as the second argument)"
fi

# Crontab lines: the binary or schedule script each one runs must resolve into the package.
LINES="$(crontab -l 2>/dev/null | grep '# codeloop:' || true)"
if [ -z "$LINES" ]; then
  pass "no codeloop crontab lines (nothing scheduled to check)"
else
  while IFS= read -r line; do
    # The command part: everything before the marker, quotes dropped. Tokens that name a codeloop
    # binary or a schedule script are resolved; a schedule script's exec line names the entry.
    cmd="${line%%# codeloop:*}"
    found=0
    for tok in $(printf '%s' "$cmd" | tr "'\"" '  '); do
      case "$tok" in
        */codeloop|*/codeloop-hook)
          found=1
          r="$(readlink -f "$tok" 2>/dev/null || echo missing)"
          case "$r" in "$PKG"/*) pass "cron binary $tok -> $r" ;; *) fail "cron binary $tok -> $r, not inside $PKG" ;; esac ;;
        */run-*.sh)
          found=1
          if [ -f "$tok" ]; then
            entry="$(grep -oE "exec '[^']*' '[^']*'" "$tok" | sed -E "s/exec '[^']*' '([^']*)'/\1/" | head -1)"
            r="$(readlink -f "$entry" 2>/dev/null || echo missing)"
            case "$r" in "$PKG"/*) pass "cron script $tok runs $r" ;; *) fail "cron script $tok runs $r, not inside $PKG" ;; esac
          else
            fail "cron script $tok is missing"
          fi ;;
      esac
    done
    [ "$found" = 1 ] || fail "cron line names no codeloop binary or schedule script: $cmd"
    # The old inline form runs `node <bin/codeloop>`; node cannot run that shell script. A warning,
    # not a failure: the line still names the frozen binary, and the crontab is the owner's to fix.
    if printf '%s' "$cmd" | grep -qE "node' '[^']*/bin/codeloop'|node [^ ]*/bin/codeloop( |$)"; then
      first="$(head -c 2 "$(printf '%s' "$cmd" | grep -oE "[^' ]*/bin/codeloop" | head -1)" 2>/dev/null || true)"
      [ "$first" = "#!" ] && echo "WARN  cron line runs node on bin/codeloop, which is a shell script, so this schedule never runs; \`codeloop schedule install\` in the project rewrites it"
    fi
  done <<< "$LINES"
fi

# Processes: nothing may run this checkout's build.
# Anchored on the process's own argv (pid, then node, then flags, then the script), so a shell whose
# command string quotes such a line, or a worker whose --worker-dir names the checkout, is not counted.
STRAY="$(ps -eo pid,command | grep -E "^ *[0-9]+ +([^ ]*/)?node( --[^ ]+)* ${ROOT}/(dist|\.test-dist)/(index|hookd-main)\.js" || true)"
if [ -z "$STRAY" ]; then pass "no codeloop process runs a script from $ROOT/dist"; else fail "processes still run from the checkout:"; echo "$STRAY" | sed 's/^/        /'; fi

HUB_STATE="$HOME_DIR/state/hub.json"
if [ -f "$HUB_STATE" ]; then
  HUB_PID="$(node -p "try { String(require('$HUB_STATE').pid ?? '') } catch { '' }")"
  HUB_CMD="$(ps -o command= -p "$HUB_PID" 2>/dev/null || true)"
  if [ -z "$HUB_CMD" ]; then
    fail "hub.json names pid $HUB_PID, which is not running"
  else
    case "$HUB_CMD" in
      *"$PKG"/*) pass "hub pid $HUB_PID runs from the installed package" ;;
      *) fail "hub pid $HUB_PID runs: $HUB_CMD" ;;
    esac
  fi
else
  pass "no hub recorded (none to check)"
fi

if [ "$fails" = 0 ]; then echo "FROZEN  every check passed"; exit 0; fi
echo "NOT FROZEN  $fails check(s) failed"
exit 1
