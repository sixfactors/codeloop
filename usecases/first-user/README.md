# first-user use cases

Proof that a stranger can install codeloop from the packed tarball, follow the Start pages and use the board. Each case runs one phase of `scripts/first-user.sh --only <phase>`; the script prints a PASS/FAIL table and `FIRST-USER PASS <phase>` on success.

`codeloop verify first-user` resolves a ref with no card to key `000`, so `usecases/000` is a link to this folder and the acceptance lines live in `specs/000-first-user/spec.md`. One file per case: verify parses each `.yaml` as a single use case.

Rerun by hand: `bash scripts/first-user.sh` (all phases, ~20 s) or `--only install|docs|gate|wiki`. `--keep` leaves the temp install behind for a look. `FIRST_USER_DOCS=<dir>` runs another copy of the Start pages; `FIRST_USER_PLAYWRIGHT=<package.json>` names where playwright is installed.
