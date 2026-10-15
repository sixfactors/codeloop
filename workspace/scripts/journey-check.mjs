#!/usr/bin/env node
// The story page as a journey, checked against a live server (codeloop serve, or next dev behind
// scripts/dev-proxy.mjs):
//   1. pager: the board drawer opened on one story and moved to another shows the second story's
//      current-step panel, never the first's (the panel is keyed by card id).
//   2. live: with --live, an activity line appended by `codeloop guard bash` in the project shows in
//      the open story's feed without a reload.
//   moving: with --moving <id> --in <project> against a hub, the story page's pill, tasks, commits
//      and phase time match GET /api/p/<project>/cards/<id>/full, and the board face shows the
//      phase time the board API sends. --rubric <id> --rubric-in <project> checks the gate panel's
//      rubric rows against the same payload. Read-only: nothing is posted.
//   3. shots: with --shots <dir>, the story page at 1440 and 900 wide for each --cards id.
// Exits 1 when a check fails.
//
//   CODELOOP_URL=http://127.0.0.1:4762 CODELOOP_TOKEN=… node scripts/journey-check.mjs \
//     [--board] [--orch c-001] [--person c-002] [--stuck c-048] --from c-048 --to c-047 [--neighbour next] [--login user:password] [--questions c-018] [--live c-047 --project <dir> --session <id>] [--shots dir --cards c-045,c-048,c-047]
//
// Playwright is not a dependency of this package; PLAYWRIGHT_DIR names a project that has it.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? true] : [])).filter((x) => x.length));
const BASE = (process.env.CODELOOP_URL ?? 'http://127.0.0.1:4040').replace(/\/$/, '');
const TOKEN = process.env.CODELOOP_TOKEN ?? '';
const withToken = (path) => `${BASE}${path}${TOKEN ? `${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(TOKEN)}` : ''}`;
const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(process.env.PLAYWRIGHT_DIR ?? join(HERE, '..', '..'), 'package.json'));
const { chromium } = require('playwright');

const browser = await chromium.launch();
const failures = [];
const ok = (name, pass, detail) => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!pass) failures.push(name); };
const panel = (page) => page.locator('[data-testid="card-sheet"] [data-testid="current-step-panel"], [data-testid="current-step-panel"]').first();

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // --login user:password signs the browser in as the owner, so gate and write buttons are live.
  if (args.login) {
    const [user, ...rest] = String(args.login).split(':');
    const res = await ctx.request.post(`${BASE}/api/session/login`, { data: { user, password: rest.join(':') }, headers: { origin: BASE } });
    ok('signed in as owner', res.ok(), String(res.status()));
  }

  if (args.from && args.to) {
    await page.goto(withToken('/'), { waitUntil: 'domcontentloaded' });
    // A click before hydration opens nothing, so it is retried until the drawer shows the story.
    const opened = page.locator(`[data-testid="current-step-panel"][data-card="${args.from}"]`);
    for (let i = 0; i < 10; i++) {
      await page.locator(`[data-testid="board-card-${args.from}"]`).first().click();
      if (await opened.waitFor({ timeout: 3000 }).then(() => true, () => false)) break;
    }
    const first = { card: await panel(page).getAttribute('data-card'), shape: await panel(page).getAttribute('data-shape'), text: await panel(page).innerText() };
    ok(`drawer opens ${args.from} with its own panel`, first.card === args.from, `${first.card}, ${first.shape}`);
    // Local panel state (the "Work on it myself" box) belongs to one story: a neighbour in the
    // same shape must open without it.
    if (first.shape === 'nobody' && args.neighbour) {
      await page.locator('[data-testid="work-myself"]').click();
      await page.locator('[data-testid="work-myself-box"]').waitFor({ timeout: 5000 });
      await page.locator('[data-testid="detail-sheet-next"]').click();
      // The neighbour is whichever story the pager shows next; the board's order moves with its data.
      await page.waitForFunction((from) => { const p = document.querySelector('[data-testid="current-step-panel"]'); return p && p.getAttribute('data-card') !== from; }, args.from, { timeout: 10000 });
      const neighbour = await panel(page).getAttribute('data-card');
      const carried = await page.locator('[data-testid="work-myself-box"]').count();
      ok(`${args.from}'s open box does not carry over to ${neighbour}`, carried === 0, `${carried} box(es) on ${neighbour}`);
      await page.locator('[data-testid="detail-sheet-prev"]').click();
      await page.locator(`[data-testid="current-step-panel"][data-card="${args.from}"]`).waitFor({ timeout: 10000 });
    }
    // Move with the pager buttons until the drawer shows the target, both directions, at most 60 steps.
    let reached = false;
    const target = page.locator(`[data-testid="current-step-panel"][data-card="${args.to}"]`);
    for (const button of ['detail-sheet-prev', 'detail-sheet-next']) {
      for (let i = 0; i < 60 && !reached; i++) {
        const step = page.locator(`[data-testid="${button}"]`);
        if (await step.isDisabled()) break;
        await step.click();
        reached = await target.waitFor({ timeout: 1500 }).then(() => true, () => false);
      }
      if (reached) break;
      await page.locator(`[data-testid="board-card-${args.from}"]`).first().click({ force: true }).catch(() => undefined);
    }
    ok(`pager reaches ${args.to}`, reached);
    if (reached) {
      await page.waitForFunction((to) => document.querySelector('[data-testid="current-step-panel"]')?.getAttribute('data-card') === to, args.to);
      const second = { card: await panel(page).getAttribute('data-card'), shape: await panel(page).getAttribute('data-shape'), text: await panel(page).innerText() };
      ok(`panel follows the pager to ${args.to}`, second.card === args.to, `${second.card}, ${second.shape}`);
      const stale = first.text.split('\n').find((l) => /no task list|check fail/i.test(l));
      ok(`${args.from}'s check sentence is not on ${args.to}`, !stale || !second.text.includes(stale), stale ?? 'no check line on the first panel');
    }
  }

  // --board: the phase board shows its holder rows and a collapsed empty phase, and the header,
  // the sidebar (footer and Board badge) and the drawer pager all show the board's one count.
  if (args.board) {
    if (args.shots) mkdirSync(resolve(String(args.shots)), { recursive: true });
    for (const width of [1440, 900]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(withToken('/'), { waitUntil: 'domcontentloaded' });
      await page.locator('[data-testid="board-phase-grid"]').waitFor({ timeout: 20000 });
      const rows = await page.locator('[data-testid^="board-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('board-row-', '')));
      ok(`board at ${width} shows the holder rows`, ['needs-you', 'agent', 'queued'].every((r) => rows.includes(r)), rows.join(', '));
      const collapsed = await page.locator('[data-testid^="board-phase-"][data-collapsed]').count();
      ok(`board at ${width} collapses empty phases`, collapsed > 0, `${collapsed} collapsed`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      ok(`board at ${width}: no sideways page scroll`, !overflow);
      if (args.shots) await page.screenshot({ path: join(resolve(String(args.shots)), `board-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const num = (t) => Number(/(\d+)/.exec(t ?? '')?.[1]);
    const header = num(await page.locator('[data-testid="board-total"]').innerText());
    const footer = num(await page.locator('[data-testid="sidebar-story-count"]').innerText());
    const badge = num(await page.locator('[data-testid="sidebar-nav-board"] [data-testid="sidebar-count"]').innerText().catch(() => ''));
    const first = page.locator('[data-testid="board-phase-grid"] [data-testid^="board-card-"]').first();
    let pager = NaN;
    for (let i = 0; i < 10 && Number.isNaN(pager); i++) {
      await first.click();
      pager = await page.locator('[data-testid="detail-sheet-position"]').innerText({ timeout: 3000 }).then((t) => Number(/of (\d+)/.exec(t)[1]), () => NaN);
    }
    ok('header, sidebar footer, sidebar Board badge and drawer pager show one count', header > 0 && [footer, badge, pager].every((n) => n === header), `header ${header}, footer ${footer}, badge ${badge}, pager ${pager}`);
  }

  // --orch <id>: Run with orchestrator twice on a story in the nobody shape, against a project whose
  // configured agent hands back; each turn shows as merged and the stepper moves on. With
  // --person <id>, Brief a person shows the brief path and the hand-back line to copy.
  if (args.orch) {
    const id = String(args.orch);
    if (args.shots) mkdirSync(resolve(String(args.shots)), { recursive: true });
    for (const n of [1, 2]) {
      await page.goto(withToken(`/cards/${id}/`), { waitUntil: 'domcontentloaded' });
      // A step's id and state: moving on is a new phase, or the same phase now waiting at its gate.
      const stepNow = () => page.evaluate(() => { const el = document.querySelector('[data-testid^="journey-step-"][aria-current="step"]'); return el ? `${el.getAttribute('data-testid')}:${el.getAttribute('data-state')}` : null; });
      await page.locator('[data-testid^="journey-step-"][aria-current="step"]').first().waitFor({ timeout: 20000 });
      const before = await stepNow();
      const start = page.locator('[data-testid="current-step-panel"][data-shape="nobody"] [data-testid="run-orchestrator"]');
      ok(`${id} turn ${n}: Run with orchestrator is offered`, await start.waitFor({ timeout: 20000 }).then(() => true, () => false));
      await start.click();
      const merged = await page.locator(`[data-testid="orch-turn-${n}"][data-outcome="merged"]`).waitFor({ timeout: 60000 }).then(() => true, () => false);
      ok(`${id} turn ${n} shows as merged`, merged, await page.locator(`[data-testid="orch-turn-${n}"]`).getAttribute('data-outcome').catch(() => 'no row'));
      const moved = await page.waitForFunction((b) => { const el = document.querySelector('[data-testid^="journey-step-"][aria-current="step"]'); return el && `${el.getAttribute('data-testid')}:${el.getAttribute('data-state')}` !== b; }, before, { timeout: 20000 }).then(() => true, () => false);
      const after = await stepNow();
      ok(`${id} turn ${n} moves the stepper`, moved, `${before} -> ${after}`);
    }
    await page.locator('[data-testid="orch-turn-2"] button').first().click();
    ok('a turn opens to its hand-back and gate', await page.locator('[data-testid="orch-turn-2"] [data-testid="orch-handback"]').isVisible() && await page.locator('[data-testid="orch-turn-2"] [data-testid="orch-gate"]').isVisible());
    if (args.shots) for (const width of [1440, 900]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(resolve(String(args.shots)), `${id}-two-turns-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(withToken('/home/'), { waitUntil: 'domcontentloaded' });
    const tile = page.locator(`[data-testid="home-orch-tile-${id}"]`);
    ok(`Home lists ${id} under Orchestrating`, await tile.waitFor({ timeout: 20000 }).then(() => true, () => false), await tile.innerText().catch(() => ''));
    if (args.shots) await page.screenshot({ path: join(resolve(String(args.shots)), 'home-orchestrating-1440.png'), fullPage: true });
  }
  if (args.person) {
    const id = String(args.person);
    await page.goto(withToken(`/cards/${id}/`), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="brief-person"]').click({ timeout: 20000 });
    const box = page.locator('[data-testid="person-brief-box"]');
    const shown = await box.waitFor({ timeout: 20000 }).then(() => true, () => false);
    const text = shown ? await box.innerText() : '';
    ok(`Brief a person on ${id} shows the brief and the hand-back line`, shown && text.includes('.md') && text.includes(`codeloop card handback ${id}`), text.split('\n')[0]);
  }
  if (args.stuck) {
    const id = String(args.stuck);
    await page.goto(withToken(`/cards/${id}/`), { waitUntil: 'domcontentloaded' });
    const explain = page.locator('[data-testid="gate-explain"]');
    const said = await explain.innerText({ timeout: 20000 }).catch(() => '');
    ok(`${id}'s stuck panel says what Approve does`, /unstick/i.test(said) && /keeps the stage/.test(said), said.slice(0, 80));
    if (args.shots) { mkdirSync(resolve(String(args.shots)), { recursive: true }); await page.screenshot({ path: join(resolve(String(args.shots)), `${id}-stuck-1440.png`), fullPage: true }); }
  }

  // --questions <id>: the "you" panel offers each question's options as buttons with the
  // recommended one marked, and Accept all suggested answers every open question in one click.

  // Hub mode: pages under /p/<project>/, the API under /api/p/<project>/. Every value expected here
  // comes from the API, so a screen that drops or invents a row fails.
  const hubFull = async (project, id) => { const r = await ctx.request.get(`${BASE}/api/p/${project}/cards/${id}/full`); const j = await r.json(); return j.data ?? j; };
  const hm = (m) => { const h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };
  const shoot = async (name, widths = [1440, 900]) => {
    if (!args.shots) return;
    mkdirSync(resolve(String(args.shots)), { recursive: true });
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(resolve(String(args.shots)), `${name}-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  };
  if (args.moving) {
    const id = String(args.moving);
    const project = String(args.in ?? 'ops-ai');
    const full = await hubFull(project, id);
    await page.goto(withToken(`/p/${project}/cards/${id}/`), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="tasks-commits"]').waitFor({ timeout: 90000 });
    const pill = await page.locator('[data-testid="current-step-panel"] [data-testid="pill-moving"]').count();
    ok(`${id} pill reads "· moving" exactly when the API says moving`, (pill > 0) === Boolean(full.card.display?.moving), `api moving=${full.card.display?.moving}, pills=${pill}, text=${pill ? await page.locator('[data-testid="pill-moving"]').first().innerText() : '-'}`);
    const tasks = await page.locator('[data-testid="task-row"]').count();
    const ticked = await page.locator('[data-testid="task-row"][data-done]').count();
    const apiDone = full.tasks.filter((t) => t.done).length;
    ok(`${id} lists every task with its tick`, tasks === full.tasks.length && ticked === apiDone && tasks > 0, `${ticked} of ${tasks} on screen, api ${apiDone} of ${full.tasks.length}`);
    const layers = await page.locator('[data-testid="task-layer"]').allInnerTexts();
    ok(`${id} tasks carry their layer chips`, layers.join() === full.tasks.filter((t) => t.layer).map((t) => t.layer).join(), layers.slice(0, 5).join(','));
    // A live project can land a commit while the page loads: compare against a read taken after it.
    const after = await hubFull(project, id);
    const commits = await page.locator('[data-testid="commit-row"]').count();
    const firstWhere = await page.locator('[data-testid="commit-where"]').first().innerText();
    const c0 = after.commits[0];
    const want = c0 ? (c0.merged ? 'merged' : c0.branches.length ? `on ${c0.branches.join(', ')}` : 'on no branch') : '';
    const firstSha = await page.locator('[data-testid="commit-row"]').first().innerText();
    ok(`${id} lists every commit newest first, merged or on its branch`, commits === after.commits.length && commits > 0 && firstSha.includes(c0.sha.slice(0, 7)) && firstWhere === want, `${commits} rows, first ${c0?.sha.slice(0, 7)} "${firstWhere}"`);
    const step = full.journey.steps.find((x) => x.state === 'current' || x.state === 'gate');
    const wantTime = step && step.activeMinutes !== undefined ? `in ${step.id} ${hm(step.activeMinutes + step.idleMinutes)}, working ${hm(step.activeMinutes)}` : undefined;
    const gotTime = await page.locator('[data-testid="step-time"]').innerText().catch(() => undefined);
    // Idle minutes grow while the page loads, so the wall time may run a few minutes past the API's;
    // the working minutes must match exactly.
    const mins = (t) => { const m = /^(\d+)h (\d+)m$|^(\d+)m$/.exec(t ?? ''); return m ? (m[3] !== undefined ? Number(m[3]) : Number(m[1]) * 60 + Number(m[2])) : NaN; };
    const parts = (t) => /^in (\S+) (.+), working (.+)$/.exec(t ?? '');
    const [g, w] = [parts(gotTime), parts(wantTime)];
    ok(`${id} current step shows time in phase and time working`, Boolean(g && w) && g[1] === w[1] && g[3] === w[3] && Math.abs(mins(g[2]) - mins(w[2])) <= 3, `${gotTime ?? 'none'}; api ${wantTime ?? 'none'}`);
    await shoot(`${id}-moving`);
    // The board face: the first story the board API sends with working minutes.
    const board = await (await ctx.request.get(`${BASE}/api/p/${project}/board`)).json();
    const story = (board.data ?? board).phases.flatMap((ph) => Object.values(ph.cells ?? {}).flat()).find((x) => x.activeMinutes !== undefined && x.display.state !== 'done' && x.display.state !== 'shipped');
    await page.goto(withToken(`/p/${project}/`), { waitUntil: 'domcontentloaded' });
    if (story) {
      const face = page.locator(`[data-testid="board-card-${story.id}"] [data-testid="board-card-time"]`).first();
      const got = await face.innerText({ timeout: 90000 }).catch(() => undefined);
      ok(`board face of ${story.id} shows its phase time`, got === `in ${story.stage} ${hm(story.activeMinutes + story.idleMinutes)}, working ${hm(story.activeMinutes)}`, got ?? 'none');
      await shoot('board-phase-time');
    } else ok('board API sends a story with working minutes', false);
  }
  if (args.rubric) {
    const id = String(args.rubric);
    const project = String(args['rubric-in'] ?? 'codeloop');
    const full = await hubFull(project, id);
    await page.goto(withToken(`/p/${project}/cards/${id}/`), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="rubric"]').waitFor({ timeout: 90000 });
    const rows = await page.locator('[data-testid^="rubric-row-"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-testid').slice(11)}:${e.getAttribute('data-status')}`));
    const want = full.rubric.rows.map((r) => `${r.id}:${r.status}`);
    ok(`${id} gate panel shows every rubric row with its status`, rows.join() === want.join(), rows.join(' '));
    const sameCard = await page.locator('[data-testid="panel-you"] [data-testid="rubric"] ~ div [data-testid="gate-approve"]').count();
    ok(`${id} rubric sits in the gate panel above Approve`, sameCard === 1);
    const findings = full.rubric.rows.filter((r) => r.status === 'fail' && r.finding).length;
    const shown = await page.locator('[data-testid^="rubric-row-"][data-status="fail"] p').count();
    ok(`${id} each failing row shows its finding`, shown === findings, `${shown} of ${findings}`);
    await shoot(`${id}-rubric`);
  }
  if (args.questions) {
    const id = String(args.questions);
    await page.goto(withToken(`/cards/${id}/`), { waitUntil: 'domcontentloaded' });
    const youPanel = page.locator('[data-testid="current-step-panel"][data-shape="you"]');
    ok(`${id} opens in the you shape`, await youPanel.waitFor({ timeout: 20000 }).then(() => true, () => false));
    const options = await youPanel.locator('[data-testid^="question-option-"]').count();
    const marked = await youPanel.locator('[data-testid^="question-option-"][data-recommended]').count();
    ok(`${id}'s options render as buttons, one marked recommended`, options >= 2 && marked === 1, `${options} options, ${marked} marked`);
    if (args.shots) await page.screenshot({ path: join(resolve(String(args.shots)), `${id}-questions-1440.png`), fullPage: true });
    const acceptAll = youPanel.locator('[data-testid="accept-all"]');
    ok('Accept all suggested is at the top of the questions', await acceptAll.isVisible().catch(() => false));
    await acceptAll.click();
    const cleared = await page.waitForFunction((cid) => !document.querySelector(`[data-testid="current-step-panel"][data-card="${cid}"] [data-testid="accept-all"]`), id, { timeout: 10000 }).then(() => true, () => false);
    ok('Accept all answered every open question', cleared);
  }

  if (args.live) {
    await page.goto(withToken(`/cards/${args.live}/`), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="activity-feed"]').first().waitFor({ timeout: 20000 });
    const marker = `echo journey-live-${Date.now()}`;
    const run = spawnSync(process.execPath, [resolve(HERE, '..', '..', 'dist', 'index.js'), 'guard', 'bash'], { cwd: resolve(String(args.project)), input: JSON.stringify({ session_id: args.session, tool_input: { command: marker } }), encoding: 'utf-8', env: { ...process.env, CLAUDE_CODE_SESSION_ID: '', CODELOOP_CARD: '' } });
    ok('guard bash ran', run.status === 0, run.stderr.trim());
    const seen = await page.getByText(`ran ${marker}`).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
    ok(`the appended line shows in ${args.live}'s feed without a reload`, seen, marker);
    if (args.shots) {
      mkdirSync(resolve(String(args.shots)), { recursive: true });
      await page.screenshot({ path: join(resolve(String(args.shots)), `${args.live}-live-line-1440.png`), fullPage: true });
    }
  }

  if (args.shots && args.cards) {
    const dir = resolve(String(args.shots));
    mkdirSync(dir, { recursive: true });
    for (const width of [1440, 900]) {
      await page.setViewportSize({ width, height: 900 });
      for (const id of String(args.cards).split(',')) {
        await page.goto(withToken(`/cards/${id}/`), { waitUntil: 'domcontentloaded' });
        await page.locator('[data-testid="journey-stepper"]').waitFor({ timeout: 20000 });
        await page.locator('[data-testid="current-step-panel"]').waitFor({ timeout: 20000 });
        const shape = await page.locator('[data-testid="current-step-panel"]').getAttribute('data-shape');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        ok(`${id} at ${width}: ${shape} shape, no sideways scroll`, !overflow);
        await page.screenshot({ path: join(dir, `${id}-${shape}-${width}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(withToken('/home/'), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="home-agents"]').waitFor({ timeout: 20000 });
    await page.screenshot({ path: join(dir, 'home-agents-1440.png'), fullPage: true });
  }
} finally {
  await browser.close();
}
if (failures.length) process.exit(1);
