---
title: The interface is redesigned from the data up, as one initiative
scope:
  - workspace/**
  - src/lib/services.ts
freq: 1
severity: warning
cards:
  - c-118
  - c-133
updated: 2026-10-12
---

Context: the workspace app was assembled one page at a time. The board drew nine stage columns per
workflow, the inbox, initiatives, roadmap, evidence and artifacts were separate pages, and the
owner found it confusing to read and act from.

Decision: adopt the target design in `docs/artifacts/codeloop-ui-design.html` and build it bottom
up as initiative `people-and-agents-workplace`, epic `ui-rebuild`: API fields and one call per
screen first, then the SDK, the CLI, a design system the project owns, then the screens. Stories
c-108 to c-112 from the earlier board split are dropped as superseded by c-120, c-122, c-123,
c-136 and c-137.

Consequences: until the screens land, the current pages stay as they are; no new work goes into
them. Feature folding into epic (c-126) waits for the owner's yes.
