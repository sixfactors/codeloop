---
title: Codeloop v2 as a context layer
status: draft
initiative: codeloop-cloud
cards: [c-374, c-373, c-372]
updated: 2026-10-19
---
Draft for the owner, 2026-10-19. Shaping for c-374. Builds on the 10-17 cloud architecture (data model, MCP tools) and the approved six places (Today, Work, Product, Knowledge, Agents, Settings). The screens are the mock at `/mocks/374-orchestrator-workers-and-server-as-three-parts`.

## The problem

Orchestrators bypass Codeloop and keep the real board in private notes and scripts:

- **Re-typed decisions.** The production project's orchestrator re-types the owner's chat decisions into cards, which caused about 12 interview stalls in one day.
- **Unseen code.** Builders commit code the board never sees, so cards sit at research with merged code (c-232, c-258, c-128).
- **Repeated rules.** Both orchestrators type the same shared-tree and proof rules into every builder brief.

The wiki holds the information, but nobody gets it when they need it:

- Only 41 of Codeloop's 89 wiki pages were ever cited in a spec or evidence file.
- The decisions folder is the largest at 35 pages, yet already-decided questions still reach the owner, because nothing searches it before asking.
- Builders go straight to the rulebook pages and never open the index.

**Direction (owner, 2026-10-19).** Codeloop is a context layer, not control, made of three parts:

- the Codeloop server, which holds the record;
- the orchestrator agent, which decides what to do next;
- the workers, which do the work.

Agent templates and workflows are defined in the UI, and the orchestrator works from them. Content is stored as markdown or database records, so an agent reads it without parsing page markup. The board renders it.

**The test every entity passes.** Nothing on the server blocks a session:

- A flag advises, and records who dismissed it.
- A decision records its source and what it replaces.
- A template is served into a brief.
- The only refusals are the existing role checks, such as only the owner approving a gate.

## Screens against entities

The six places stay, and no seventh is added. In the table, R means the screen reads the entity and W means it writes it.

| Place, view | R | W | Change |
|---|---|---|---|
| Today, Decide | story at a gate, question, decision, flag | decision, flag (dismiss with reason) | Flags join the three decision shapes, each with a suggested command. An already-answered question shows "decided on 10-16 in chat" instead of asking again. |
| Today, Moving | agent instance, story, hand-back | none | Each row names the instance (template, host), its idle minutes, and whether a hand-back covers its last commit. |
| Work, Path, List, Timeline | story, workflow stages, hand-back, commit | story (new idea) | The column comes from the one stage function. |
| Work, A story | story, document, task, hand-back, commit, review, event, instance, decision | decision, document, question | "Proof so far" lists hand-backs with commit range and proof exit. Decisions in scope show under the plan. |
| Product | live story, release, metrics | release approval | none |
| Knowledge, Pages | wiki page, fact | wiki page | Adds state (current, needs check, archive candidate), verified at, and served and cited counts. |
| Knowledge, Decisions | decision | decision (replace, edit scope) | New. One searchable list: question, answer, by, source, date, scope, replaces. |
| Knowledge, Facts | fact | none | New. Ports, running services, installed CLI version, board location, migration heads, all from probes. |
| Agents, Templates | template, skill, pack | template (write, fork, version) | New library. |
| Agents, Live | instance, story, flag | instance (release a hold) | New "who" view: instance, template, story and stage, idle minutes, host, the orchestrator that started it. |
| Agents, Workflows | workflow, stage, template, skill | workflow (write, fork, version) | New. Per stage: template, skill, check, gate, check time limit. |
| Agents, Monitor | rule, flag | rule (enable, tune) | New. Fires, dismissals and measured precision, with noisy rules marked. |
| Settings | person, delegation | role, delegation | Delegation lists the verbs and the expiry. |

## Entities

Agent templates and agent instances are the 10-17 "Agent" (definition) and "Agent session" (running instance). They are renamed for people and gain fields; they are not new records.

| Entity | | Fields that matter |
|---|---|---|
| Workspace, Person, Project, Event, Review, Finding | same | as 10-17 |
| Story | changed | Adds workflow version, holder (an instance) and owner (a person). Stage is derived, never typed. |
| Document | changed | Adds kind `design` (the approved mock) with the decision that approved it. |
| Workflow (was Lane) | changed | Versioned and forkable ordered stages. Each stage has template, skill, check, gate, check time limit, and the documents it needs and produces. `lane` stays as the CLI word. |
| Agent template (was Agent) | changed | Adds kind (orchestrator or worker), owned paths, pinned context pages, allowed commands, skills, MCP scopes, model or host, proof rules, hand-back format, question policy, version, forked from, pack. |
| Agent instance (was Agent session) | changed | Adds template version, parent instance (the orchestrator that started it), queue, and pages served. Idle minutes are derived. |
| Skill | new | Name, body, version, source (built-in, pack, team), used by, ratings. |
| Pack | new | Templates, skills and workflows with a version, installed from the Protobox catalog or a file. |
| Question | changed | Asking searches decisions first and returns a match instead of reaching the owner. |
| Decision | new | Question, answer, by, source (a chat link or date, the board, an interview, the CLI), scope (story, feature, area, paths), replaces, state. Recorded on every owner answer and every gate approval. |
| Hand-back | new | Story, instance, commit range, proof command, exit code, output, time. Moves the story to review. |
| Commit | new | Sha, repo, story (from the trailer, or claimed by a hand-back), author instance, kind (code or docs), reviewed at. |
| Delegation | changed | Owner to an orchestrator: allowed verbs and expiry. Extends the 10-17 "on behalf of". |
| Rule | new | What it watches, threshold, enabled, fires, dismissals, precision. |
| Flag | new | Rule, subject (story, instance, commit, page), raised at, suggested command, state, by, reason. |
| Wiki page | changed | Adds kind, scope, sources, owner, verified at (a sha), state, served and cited counts. |
| Fact | new | Key, value, probe, refreshed at. Never written by an agent or a person. |

**One place decides where work is.** A story's stage is computed from its documents, the gate decisions on them, its hand-backs and its commits. The board, `card show` and the monitor all call that one function. Today three places guess separately, which is how c-232 sat at research with two code commits merged. An owner who places or moves a story by hand records a decision, and the function reads it like any other input, so a hand move cannot disagree with the board.

```mermaid
erDiagram
  WORKSPACE ||--o{ PROJECT : holds
  WORKSPACE ||--o{ WORKFLOW : shares
  WORKSPACE ||--o{ AGENT_TEMPLATE : shares
  WORKSPACE ||--o{ SKILL : library
  PACK ||--o{ AGENT_TEMPLATE : bundles
  PACK ||--o{ SKILL : bundles
  PACK ||--o{ WORKFLOW : bundles
  WORKFLOW ||--|{ STAGE : orders
  STAGE }o--|| AGENT_TEMPLATE : "done by"
  STAGE }o--o{ SKILL : uses
  AGENT_TEMPLATE }o--o{ WIKI_PAGE : pins
  AGENT_TEMPLATE ||--o{ AGENT_INSTANCE : "runs as"
  AGENT_INSTANCE }o--o| AGENT_INSTANCE : "started by"
  PERSON ||--o{ DELEGATION : grants
  DELEGATION }o--|| AGENT_INSTANCE : to
  PROJECT ||--o{ STORY : has
  STORY }o--|| WORKFLOW : follows
  STORY }o--o| AGENT_INSTANCE : "held by"
  STORY ||--o{ DOCUMENT : has
  STORY ||--o{ HANDBACK : proof
  STORY ||--o{ COMMIT : claims
  STORY ||--o{ QUESTION : asks
  HANDBACK ||--o{ COMMIT : covers
  QUESTION }o--o| DECISION : "answered by"
  DECISION }o--o| DECISION : replaces
  DOCUMENT }o--o| DECISION : "approved by"
  RULE ||--o{ FLAG : raises
  FLAG }o--o| STORY : about
  FLAG }o--o| WIKI_PAGE : about
```

## What agents dig for again and again

Both orchestrators were asked. Each item below was found in a private note, a script or a chat, never on the board.

| Fact | How often | Where today | v2 home |
|---|---|---|---|
| Who owns which files and lanes | ~30 a day | notes, messages | template owned paths, Live view |
| What the owner already decided | every question | chat, notes, interview.md | decision, searched first |
| A card's real state against its commits and QA sha | every hand-back | `card show`, `git log --grep` | hand-back and commit, through the stage function |
| Stack state: ports, migration heads, which CLI and hub are live | daily, very stale | scripts, trial and error | fact |
| Which checks gate a commit | every brief | reading scripts | stage check and template proof rules in the brief |
| The approved design for a screen | every UI card | docs paths | document of kind design |
| The review range | hourly | a tick file | commit reviewed at, as a fact |
| Seeded people and sign-in for walks | every walk | seed files | wiki runbook with verified at |
| Real-model budget and spend | per experiment | notes | template cap, spend as a fact |
| Infra names, approvals, secrets location | weekly | notes | wiki reference; approvals as decisions |
| How to build and test without breaking the live CLI | every brief | notes, after two outages | builder template pinned context |
| What each stage check needs | found by failing | check output | stage check shown when the stage starts |
| Which report is filed against which story | every report | notes | a note on the story, by MCP |
| Shared-tree rules | every brief | briefs | pinned context on every worker template |

## Wiki: served, written back, stale

The existing wiki shape stays. What changes is when pages reach agents and how they stay true.

**Served**
- A brief is assembled from five sources: the template's pinned pages, the decisions in scope, the gotchas matching the files touched, the stage check, and the facts the template names.
- Each served page is recorded on the instance, and a page quoted in a document or hand-back counts as cited.

**Written back automatically**

| When | What |
|---|---|
| The owner answers or approves, anywhere | A decision with its source and scope. A chat decision is one call. |
| A story ships | The touched service's design and overview pages, service-map edges, data-model rows, the use-case index row, access-register rows, the proof line on the capability page, and the owner of each new file. Applied with the story key and merge sha. If the page check fails, the page is marked "needs check" and its owner gets a flag. |
| The same failure appears on two stories | The gotcha count goes up and is pinned at the critical count. |
| A probe runs | Facts are refreshed. |

**Stale**
- A page whose scope files changed after its "verified at" sha is marked "needs check", and its owner is flagged.
- A scope with no design page at all is flagged once.

**Never read**
- A page not served or cited for 30 days becomes an archive candidate. Archiving takes it out of briefs and never deletes it.
- Decisions and facts are never archived by read count. Only a newer decision retires an old one.

## MCP additions

Ten grouped tools exist today. Two are added, workflows and monitor, for twelve in total.

| Tool | Added actions |
|---|---|
| decisions | `record` (source and scope), `search` |
| questions | `ask` returns a matching decision first |
| stories | `handback` with a commit range that claims untagged commits; `where` (derived stage and why) |
| agents | `version`, `diff` on templates |
| sessions | `who` |
| skills | `install` a pack, `packs` |
| wiki | `brief`, `stale`, `archive`, `facts`; each fact is also `codeloop://fact/{key}` |
| workflows (new) | list, get, write, fork, diff |
| monitor (new) | flags (list, dismiss, resolve), rules (list, write) |

**Day one** ships four things, which cover the stalls counted this week:
- `decisions.record` and search-first `questions.ask`;
- `stories.handback` and `stories.where`;
- `monitor.flags`;
- `sessions.who`.

## Monitor rules, replayed on two weeks of both boards

The replay ran over two weeks of history, against the 20 cards a person fixed by hand. The full report is in the session scratchpad.

| Rule | Fires | Hand-fixed caught | Median lead | Precision | Verdict |
|---|---|---|---|---|---|
| Code ahead of stage | 125 cards | 12 of 20 | 0.7 h | 9/10 | keep; skip trivial |
| Check killed by time limit | 19 cards | 10 of 20 | 4.5 h | 6/6 | keep |
| Idle over 3 h in build | 106 cards | 10 of 20 | 15.7 h | 8/10 | retune to 6 h, daytime |
| Stuck with no path | 29 cards | 2 of 20 | 24 h | 7/9 | keep; dedupe by cause |
| Commit with no or bad trailer | 779 commits | 0 | n/a | 5/10 | code commits only |
| Review queue over 5 | 4 | 3 | n/a | 2/4 | alert on oldest over 24 h |
| Proposal unseen over 2 h | 185 | 3 | 32 h | 2/10 | agent proposals only, over 24 h |
| Parked card shows as proposal | 49 | 8 | 0 | 10/10 | engine bug, fixed in c-368 |
| Screen card behind backend | 12 | 0 | n/a | n/a | drop; same as code ahead of stage |

What the replay found:
- **Coverage.** The rules together flag 19 of the 20 hand-fixed cards. For the 12 the owner later acted on, the median lead was 13.8 hours.
- **Built before planned.** 122 of 261 cards with code (47%) had code before they reached build.
- **Urgent known fix.** At least 66 cards ran research or interview where every answer was an accepted recommendation. That is the case the short route (c-372) is for.
- **Event history.** 42 cards have events out of time order, and four trailers name cards that do not exist.

## Open questions

1. **Decision scope.** Recommended: match by story, feature and area first, and add paths later.
2. **Template version.** Recommended: pinned at each stage start.
3. **Protobox packs.** Recommended: after v2.0. v2.0 ships one built-in pack plus team forks.
4. **The v1 slice.** Recommended: ship the four strong rules as flags in v1 under c-373. Templates and workflows stay in v2.
