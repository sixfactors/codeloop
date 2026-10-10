# CL-002 spec: The README describes the product that ships

Story: As a visitor, I can read the README and the site and find the same product, so that I trust the install.

feature: Install and first run
initiative: wiki/initiatives/any-stack-same-loop.md
size: S
metric: install after visit
done_when: `bash scripts/readme-quickstart.sh` exits 0 in an empty folder

acceptance:
- US1 Given the npm page or the repo, when I read the first screen, then I see the same three sentences and the same lane diagram as codeloop.protobox.ai.
- US2 Given a clean folder, when I follow the quickstart top to bottom, then `codeloop inbox` prints a board with one card and no errors.
- US3 Given the README, when I look for the three most common things, then I find start a card, answer the inbox, and approve a gate, each as one command.

screens: none

## Not building

- A docs site. The README links to the site; docs stay in docs/.
- Any mention of the ten old commands. They are stages inside lanes now.

## Failure modes

- Quickstart names a command that does not exist in 0.3.0.
- README and site drift again after the next release: the site build copies the README's first section, or a test diffs them.
