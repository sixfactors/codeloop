#!/usr/bin/env bash
# Packs a codeloop release from a clean export of a git tag, never from the working tree, so an
# uncommitted edit in the checkout can never reach the frozen build the production project runs.
#
#   bash scripts/release-pack.sh [tag]            default tag v1.0.0
#
# git archive <tag> is extracted into a scratch folder, its package.json gets gitHead=<tag commit>
# (npm records that only when packing from a repository, and the export has none), the three
# package trees are installed from their lockfiles, `npm run build:all` builds the CLI, the board
# UI and the workspace app, and `npm pack` writes the tarball. The tarball, its sha256 (shasum -c
# format) and a small manifest land in $CODELOOP_HOME/releases (default ~/.codeloop/releases) as
# codeloop-<tag>-<sha7>.tgz; an existing file of that name is never overwritten.
# KEEP_SCRATCH=1 leaves the scratch folder for inspection.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TAG="${1:-v1.0.0}"
HOME_DIR="${CODELOOP_HOME:-$HOME/.codeloop}"
RELEASES="${CODELOOP_RELEASES:-$HOME_DIR/releases}"

fail() { echo "release-pack: $*" >&2; exit 2; }

SHA="$(git -C "$ROOT" rev-parse --verify --quiet "refs/tags/$TAG^{commit}")" || fail "no tag $TAG in $ROOT"
SHORT="${SHA:0:7}"
NAME="codeloop-$TAG-$SHORT.tgz"
[ -e "$RELEASES/$NAME" ] && fail "$RELEASES/$NAME exists; a release is packed once (delete it by hand to pack again)"

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/codeloop-release-XXXXXX")"
if [ "${KEEP_SCRATCH:-}" = 1 ]; then echo "release-pack: scratch folder kept at $SCRATCH"; else trap 'rm -rf "$SCRATCH"' EXIT; fi

echo "release-pack: exporting $TAG ($SHA) into $SCRATCH"
git -C "$ROOT" archive --format=tar "$TAG" | tar -x -C "$SCRATCH"
cd "$SCRATCH"
[ -f package.json ] || fail "the export has no package.json"
VERSION="$(node -p "require('./package.json').version")"

# The export has no .git, so npm would record no gitHead; check-frozen.sh compares this to the tag.
npm pkg set gitHead="$SHA" >/dev/null

echo "release-pack: installing dependencies from the lockfiles"
npm ci --no-audit --no-fund --loglevel=error
(cd ui && npm ci --no-audit --no-fund --loglevel=error)
(cd workspace && npm ci --no-audit --no-fund --loglevel=error)

echo "release-pack: building (CLI, board UI, workspace app)"
npm run build:all

echo "release-pack: packing"
mkdir -p "$RELEASES"
PACKED="$(npm pack --pack-destination "$SCRATCH" --json --loglevel=error | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))[0].filename")"
[ -f "$SCRATCH/$PACKED" ] || fail "npm pack wrote no $PACKED"
# The packed package.json must carry the tag's commit, or the dirty-tree check below means nothing.
PACKED_HEAD="$(tar -xOf "$SCRATCH/$PACKED" package/package.json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).gitHead || ''")"
[ "$PACKED_HEAD" = "$SHA" ] || fail "the packed package.json says gitHead $PACKED_HEAD, the tag is $SHA"

mv "$SCRATCH/$PACKED" "$RELEASES/$NAME"
(cd "$RELEASES" && shasum -a 256 "$NAME" > "$NAME.sha256")
node -e '
const [out, tag, sha, version, name] = process.argv.slice(1);
require("fs").writeFileSync(out, JSON.stringify({ tag, commit: sha, version, tarball: name, builtAt: new Date().toISOString(), node: process.version }, null, 2) + "\n");
' "$RELEASES/$NAME.json" "$TAG" "$SHA" "$VERSION" "$NAME"

echo "release-pack: $RELEASES/$NAME"
echo "release-pack: $(cat "$RELEASES/$NAME.sha256")"
echo "release-pack: version $VERSION, gitHead $SHA"
echo "release-pack: install it with: bash scripts/release-install.sh $RELEASES/$NAME"
