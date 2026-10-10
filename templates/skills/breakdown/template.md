# Epic: {{title}}
<!-- One sentence: what shipping this epic should do, and why. -->
hypothesis: <one sentence>
<!-- The one number this epic should move. -->
metric: <metric name>
<!-- Optional: set here when every story shares one capability slug; otherwise set feature: per story. -->
feature: <slug>

## Stories

<!--
One line per story, ordered so each ships alone and is usable by itself before the next exists.
At most seven lines here; anything past that goes under ## Later.

    - S1 [S] <title> · exists: <have|unlock|port|build> <path when not build> · done_when: <text> · depends_on: none

Separators are ` · ` (space, middle dot U+00B7, space). Size is S or M in brackets; an L is
refused, split it with SPIDR into sibling stories before this file is written. done_when is a
thing a person can click or run, never "all tasks complete". depends_on is none or earlier story
ids only; a forward or unknown id is refused. The rank step appends
` · rice: R=<n> I=<n> C=<n> E=<n>` (reach, impact, confidence 1-10; effort in weeks) once the
stories are settled; `--ranked` requires it on every line.
-->
- S1 [S] <title> · exists: build · done_when: <text> · depends_on: none

## Later

<!-- Deferred, not queued. Bare titles, no size or exists needed. -->
- <title>
