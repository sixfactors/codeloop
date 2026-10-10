# Codeloop workspace

The multi-screen board for one codeloop project: board, inbox, roadmap, wiki, artifacts, card,
evidence, stats, settings. Next 15 app router, static export, Tailwind 4, shadcn/ui (Base UI
style), TanStack Query, SSE from `/api/events`. Design: `chanl-platform/docs/plans/codeloop/2026-10-07-workspace-app.md`.

## Run it

```sh
# 1. the API (serves the old ui, the API and the mocks)
cd .. && CODELOOP_SERVE_TOKEN=devtoken node dist/index.js serve --owner --port 4043

# 2. this app in dev, two terminals
npm run dev          # next dev on :4044, rewrites /api and /mocks to :4043 (reads only)
npm run dev:proxy    # :4046 in front of both — needed for writes, see scripts/dev-proxy.mjs

open http://localhost:4046/?token=devtoken
```

`npm run build` writes the static export to `out/`. It expects to be served by `codeloop serve`
next to the API (same origin); set `NEXT_PUBLIC_CODELOOP_API` to point elsewhere.

## Dynamic routes in the export

`/cards/[id]`, `/wiki/[...slug]` and `/evidence/[nnn]` are client-rendered from the URL. The
export pre-renders every id when `CODELOOP_BUILD_API=http://127.0.0.1:4043` is set at build time;
otherwise one placeholder page per route is built (`cards/_/`, `wiki/_/`, `evidence/_/`) and the
server that hosts `out/` has to serve that file for any path under the route, or the page accepts
`?id=` / `?n=`.

## Layout

| Path | What |
|---|---|
| `lib/api.ts` | One client. Base URL, `?token=` → `x-codeloop-token` on writes, 404 for routes the server does not have yet. |
| `lib/types.ts` | API shapes; everything past id/title/lane/stage optional. |
| `hooks/use-api.ts` | TanStack queries + mutations, query keys. |
| `hooks/use-events.ts` | SSE → invalidate. |
| `components/ui/*` | shadcn registry files, unmodified. |
| `components/shared/*` | App components composed from them: shell (sidebar-07), board, card detail + drawer, questions, wiki browser, filter bar, command palette. |
| `app/*` | Routes. |
