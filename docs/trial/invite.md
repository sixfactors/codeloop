# Trial invite

Status: current. The text to send a team, six lines, as is. The tarball comes from `npm pack` on main; the npm package is older and does not have the board.

codeloop is a small CLI plus a local web board that runs your AI coding agent through stages you define in a YAML file, stops at the gates you choose, and refuses to let the agent approve its own work. It works on the repo you already have.
Install: `npm install -g ./protoboxai-codeloop-0.3.0.tgz` (attached; Node 20 or newer), then in your repo `codeloop init --tools claude` and `codeloop serve --owner --open`.
Try, in 20 minutes: make one card on the board, move it to the first gate, approve it from the Inbox page, write one wiki page, and answer one question the agent asks. The guide: docs/trial/trial-guide.md.
Report at <https://github.com/sixfactors/codeloop/issues>, one issue per thing, with the command or screen and what you expected. A line that says "lost here" is enough.
We measure how long install to first approved gate takes, where you left the docs, and whether the agent ever got past a gate without you.
Reply with the date you will try it and we will be on Slack that hour.
