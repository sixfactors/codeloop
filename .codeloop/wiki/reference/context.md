---
title: Context
---

# System context

C4 level 1: the system as one box, the people who use it and the systems it talks to.

```mermaid
C4Context
  title codeloop in context
  Person(user, "User", "assumption: the persona is not named in any doc")
  System(sys, "codeloop", "codeloop")
  Rel(user, sys, "uses")
```

| Who or what | Role | Source |
|---|---|---|
| User | assumption: the persona is inferred, not stated | - |
| (no external systems found) | assumption: no deploy config names one | - |
