# Research rubric

What the research stage must satisfy before it counts as done. `check` rows run in `codeloop check rubric <card>`; `attest` rows need a `- Rn pass: <evidence>` line under `## Rubric` at the end of research.md, the evidence naming a path, a line, a URL or a command; `review` rows are judged by the stage reviewer when the lane names one, otherwise by the owner at the gate.

R1 | `exists:` is one of have, unlock, port, build, with a path or URL when not build | check
R2 | The `exists:` verdict is proven: a grep or route list, named, that would have found the thing if it existed | attest
R3 | `pain:` names a persona and a source, or `assumption:` and what would confirm it | check
R4 | At least three sources, each with a note saying what it settled | check
R5 | At least two options compared, with the one taken and why the other lost | attest
R6 | Nothing proposed that R2 showed already exists | review
R7 | Open questions are listed for the interview, not guessed | attest
