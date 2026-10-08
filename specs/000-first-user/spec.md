# first-user spec: A stranger installs codeloop from a package and uses the board

<!-- No card carries this spec: `codeloop verify first-user` resolves a ref with no card to key
000, so this folder and the `usecases/000` link are what let the first-user use cases run. The
proof itself is scripts/first-user.sh. Give it a card (key 000) when one exists and drop the link. -->
Story: As a dev, I can install codeloop from the npm package, follow the Start pages and use the board, so that nothing from the repo checkout is assumed.

feature: Install codeloop the way any skill installs
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: S
metric: first_pass
done_when: codeloop verify first-user

acceptance:
- US1 Given a machine with only node and npm, when the packed tarball is installed into a private npm prefix with this checkout off PATH, then `codeloop --version` runs from that prefix.
- US2 Given the Start pages install, first-card, inbox and approve-a-gate, when every ```sh block is run in order, then every ```text block that follows one matches the CLI's output.
- US3 Given `codeloop serve --owner` from the installed package, when a card parked at its spec gate is opened on the board and Approve is pressed, then the gate box names the gate and the card moves to build.
- US4 Given the served board, when a wiki page is created from the UI, then it lands under .codeloop/wiki and search finds it.

screens: none

## Not building

- A static-board (dist/ui) wiki: the script reports which UI it tested and fails the wiki case there.

## Failure modes

- The package only works next to this checkout (US1).
- A Start page drifts from the CLI (US2).
- The packaged board cannot approve a gate (US3).
- The wiki does not write or index a page (US4).
