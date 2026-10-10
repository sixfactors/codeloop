## Q1 Scope: stage-to-skill mapping at init plus package manager and test command detection. Are the specialist plugins themselves in?
recommended: Mapping and detection only; a stage with no match prints `skill: generic` and writes a gotcha.
answer: 

## Q2 How does init pick: plugin `detect`, adopted skill name matching the stage id, or ask?
recommended: In order: plugin `detect`, then an adopted skill whose name or description matches the stage id, then generic; print the table and post one inbox question only when two skills match.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given chanl-platform with `.claude/skills/usecase` and `nestjs-coder`, when `codeloop init`, then build.yaml's build stage names nestjs-coder, verify names usecase, `done:` uses `make usecase-test`, and `brief` prints the adopted skill's body.
answer: 

## Q4 Riskiest assumption: adopted skills assume chanl make targets and break elsewhere.
recommended: Accept it; init is per repo, the brief prints the skill verbatim, and the test command comes from package.json or the Makefile.
answer: 

## Q5 Re-running init: overwrite the mapping or merge?
recommended: Merge; `--reset` overwrites.
answer: 
