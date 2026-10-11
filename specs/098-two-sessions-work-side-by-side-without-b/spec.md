# c-098 spec: Two sessions work side by side without blocking

Story: As a founder, I can run several agent sessions in one repo at once, so that no session switches off another's work.

feature: sessions
size: M
metric: blocked_edits
done_when: `npx vitest run src/lib/__tests__/host-enforcement.test.ts` exits 0

acceptance:
- US1 Given two sessions in one repo, when each activates a different story, then each session's guards read its own story.
- US2 Given a file in another live session's story plan, when this session edits it, then the edit is refused naming that story, unless the path is in leases.shared.
- US3 Given a session that never activated a story, when it edits, then it falls back to the repo's card; when a session ends, its story is released.

screens: none

## Not building

- Leases across machines; sessions are local to one checkout.

## Failure modes

- One session's activate switches off another's story (US1).
- Two sessions edit the same file from different stories (US2).
- A shared file blocks every story (US2).
- Sessions started before this release are blocked at the switch (US3).
