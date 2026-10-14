#!/usr/bin/env node
// The story page as a journey, checked against a live server (codeloop serve, or next dev behind
// scripts/dev-proxy.mjs):
//   1. pager: the board drawer opened on one story and moved to another shows the second story's
//      current-step panel, never the first's (the panel is keyed by card id).
//   2. live: with --live, an activity line appended by `codeloop guard bash` in the project shows in
//      the open story's feed without a reload.
//   3. shots: with --shots <dir>, the story page at 1440 and 900 wide for each --cards id.
// Exits 1 when a check fails.
//
//   CODELOOP_URL=http://127.0.0.1:4762 CODELOOP_TOKEN=… node scripts/journey-check.mjs \
//     --from c-048 --to c-047 [--neighbour c-010] [--login user:password] [--live c-047 --project <dir> --session <id>] [--shots dir --cards c-045,c-048,c-047]
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
      await page.locator(`[data-testid="current-step-panel"][data-card="${args.neighbour}"]`).waitFor({ timeout: 10000 });
      const carried = await page.locator('[data-testid="work-myself-box"]').count();
      ok(`${args.from}'s open box does not carry over to ${args.neighbour}`, carried === 0, `${carried} box(es) on ${args.neighbour}`);
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
