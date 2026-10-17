# c-312 tasks: The board keeps me signed in whichever link I open

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [x] T001 [US1] [api] hubUrl names a loopback hub localhost (src/lib/hub-state.ts), and hubListener answers a 127.0.0.1 page request with a 302 to the same path on localhost, leaving /api and /_next/static alone (src/lib/next-server.ts)
- [x] T002 [US1] [api] The session cookie name carries the hub's port, the unported name is still read and is cleared on sign out (src/lib/hub.ts), and runHubForeground passes the port (src/commands/hub.ts)
- [x] T003 [US1] [ui] The sidebar shows a neutral "Checking sign-in" while the session loads (workspace/lib/session-label.ts, workspace/components/shared/app-shell.tsx), and useSession retries twice (workspace/hooks/use-api.ts)
- [x] T004 [US1] [test] One test per failure mode through createHubApp and a real hubListener: a printed link stays signed in, a second hub does not sign out the first, an upgrade keeps the old cookie, a 127.0.0.1 page redirects, the label is neutral while loading (src/lib/__tests__/hub-session-links.test.ts, src/lib/__tests__/next-server.test.ts)
