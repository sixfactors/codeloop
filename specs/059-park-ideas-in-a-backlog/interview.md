## Q1 Scope: backlog column plus proposing beyond the WIP limit only, or also `--as` on every command and `serve --bg` from A6?
recommended: Column and propose-beyond-WIP only. `--as` goes as a task under c-088 (roles); `serve --bg` as a task under c-062.
answer: Column and propose-beyond-WIP only. `--as` goes as a task under c-088 (roles); `serve --bg` as a task under c-062.

## Q2 What pulls a card out of the backlog: founder `card start`, `run` auto-pulling when a WIP slot frees, or both?
recommended: Both. `run` pulls the top-RICE backlog card when a slot frees (createdAt order until c-061 ships); `card start <id>` jumps the queue.
answer: Both. `run` pulls the top-RICE backlog card when a slot frees (createdAt order until c-061 ships); `card start <id>` jumps the queue.

## Q3 Acceptance: what proves it?
recommended: Given WIP=2 with two cards in build, when `card propose` a third, then it sits in `backlog` on `serve`, the inbox counts it under parked, and `run` leaves it there until a slot frees.
answer: Given WIP=2 with two cards in build, when `card propose` a third, then it sits in `backlog` on `serve`, the inbox counts it under parked, and `run` leaves it there until a slot frees.

## Q4 Riskiest assumption: the backlog becomes a graveyard. Age it, auto-drop, or leave it?
recommended: Age it, never drop: inbox prints "N in backlog, oldest 21d"; the plan lane's Monday rank is the only thing that reorders it.
answer: Age it, never drop: inbox prints "N in backlog, oldest 21d"; the plan lane's Monday rank is the only thing that reorders it.

## Q5 Is `proposed` (what the scan lane writes) the same column as backlog, or two columns?
recommended: One column: rename stage `proposed` to `backlog`; scan proposals and founder parkings sit together, sorted by rice.
answer: One column: rename stage `proposed` to `backlog`; scan proposals and founder parkings sit together, sorted by rice.
