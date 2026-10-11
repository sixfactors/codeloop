## Q1 Scope: this is L. Loader with repo and home folder sources this card, npm later, catalog in c-087?
recommended: Yes: `plugin.yaml` shape, `detect`, loading from `.codeloop/plugins/` and `~/.codeloop/plugins/` here; npm is a child card; the catalog is c-087.
answer: Yes: `plugin.yaml` shape, `detect`, loading from `.codeloop/plugins/` and `~/.codeloop/plugins/` here; npm is a child card; the catalog is c-087.

## Q2 Which plugin proves the shape first?
recommended: A `backend-nestjs` stub with one rule and one check, loaded by codeloop's own repo; the full plugin is c-080.
answer: A `backend-nestjs` stub with one rule and one check, loaded by codeloop's own repo; the full plugin is c-080.

## Q3 Acceptance: what proves it?
recommended: Given a plugin folder with plugin.yaml and one check, when `init` runs in a repo matching `detect`, then `brief` for the build stage lists the plugin's rules and the build done-check runs its check; a repo not matching loads nothing.
answer: Given a plugin folder with plugin.yaml and one check, when `init` runs in a repo matching `detect`, then `brief` for the build stage lists the plugin's rules and the build done-check runs its check; a repo not matching loads nothing.

## Q4 Riskiest assumption: four kinds is too much for the first cut. Ship all four or two?
recommended: Load `specialist` and `stage`; declare `lane` and `integration` in the schema but do not load them until a card needs one.
answer: Load `specialist` and `stage`; declare `lane` and `integration` in the schema but do not load them until a card needs one.

## Q5 Two plugins detecting the same stage: error, first wins, or config?
recommended: Error at init naming both; `plugins.prefer:` in config resolves it.
answer: Error at init naming both; `plugins.prefer:` in config resolves it.
