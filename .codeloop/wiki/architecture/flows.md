# Flows

## An unattended run works one stage

`codeloop run --agent` (cron or by hand). The Runner starts an Agent only when the stage's check fails, then calls the Engine, which alone moves the card.

```mermaid
sequenceDiagram
  participant Commands
  participant Runner
  participant Cards
  participant Agent
  participant Engine
  Commands->>Runner: runDueWithAgent (run.ts:219)
  Runner->>Cards: withLock(last-run.json): startDue creates cards for due cron slots
  Runner->>Runner: agentStep: skip if running() or the stage check already passes
  Runner->>Cards: recordEvent agent-start, judged by limit() on the same read
  alt wip, gates_per_day or max_runs_per_day reached
    Cards-->>Runner: RefusalError, no agent starts, reason returned
  else limits allow it
    Runner->>Agent: runAgent: CODELOOP_ROLE=agent, brief on stdin, timeout kills the process group
    Agent-->>Runner: exit code, or null when killed
    Runner->>Cards: recordEvent agent-run with exit, duration, log
  end
  Runner->>Engine: advanceCard(unattended: true)
  alt done.cmd exits non-zero
    Engine->>Cards: fail event, retries + 1, stuck gate at lane.retries
  else check passes and the stage has a gate
    Engine->>Cards: gate and awaiting set, card parked
  else check passes
    Engine->>Cards: advance event, card.stage = next stage
  end
```

## The owner approves a gate on the board

The board is read-only unless `codeloop serve --owner` started it. Approving also advances once when the stage's check had already passed.

```mermaid
sequenceDiagram
  participant Workspace
  participant Sdk
  participant Server
  participant Services
  participant Engine
  participant Cards
  Workspace->>Sdk: approveCard(id, note)
  Sdk->>Server: POST /api/cards/:id/approve with x-codeloop-token
  alt server not started with --owner
    Server-->>Sdk: 403 read-only
  else owner server
    Server->>Services: approve(projectDir, id, owner)
    Services->>Engine: approveFlow, then approveCard
    alt role is not the gate's approver
      Engine-->>Server: RefusalError, 400
    else approver matches
      Engine->>Cards: approve event with fingerprint of output and check
      Cards-->>Engine: version + 1
      Engine->>Engine: advanceCard once if the check passed before the gate
      Server-->>Sdk: 200 cards payload with the decision
    end
  end
```

## Two processes write the board at once

A cron run and a person at a terminal both call `writeCards`. The loser retries from a fresh read.

```mermaid
sequenceDiagram
  participant Runner
  participant Commands
  participant Cards
  Runner->>Cards: readCards (version 7)
  Commands->>Cards: readCards (version 7)
  Commands->>Cards: writeCards: lock, version still 7, rename, version 8
  Runner->>Cards: writeCards from version 7
  alt version on disk moved
    Cards-->>Runner: ConflictError
    Runner->>Cards: recordEvent re-reads and calls build again, up to 5 attempts
  else version unchanged
    Cards-->>Runner: version + 1
  end
```

## Sharp edges

- `advanceCard` runs the stage check outside the lock. If the check wrote the board itself (the scan stage proposes cards), the advance is written on that newer board; if a person moved or parked the card meanwhile it throws `ConflictError` instead (`src/lib/engine.ts:450`).
- A failing check with an unchanged output file counts no retry on an unattended run, so a stage cannot reach stuck by being polled (test: does not count a failure again while the working tree is unchanged, in `src/lib/__tests__/review.test.ts`).
- Nothing the Runner starts can approve its own gate: `resolveRole` refuses any role but agent when `CODELOOP_AGENT_RUN` is set (test: runs the agent as CODELOOP_ROLE=agent, in `src/lib/__tests__/agent.test.ts`).
- Lane `done.cmd` lines need `codeloop` on PATH; call sites must pass `checkEnv()` (`.codeloop/wiki/gotchas/lane-checks-need-codeloop-on-path.md`).
