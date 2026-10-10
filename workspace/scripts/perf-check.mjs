#!/usr/bin/env node
// Navigation budget for the workspace app, run against a live server (codeloop serve, or the
// standalone Next server behind scripts/dev-proxy.mjs):
//   zero full page loads across N wiki navigations by link, p95 navigation under 100 ms, JS heap
//   growth under 20 MB. Prints a table and exits 1 when a budget is missed.
//
//   CODELOOP_URL=http://127.0.0.1:4040 CODELOOP_TOKEN=… PLAYWRIGHT_DIR=../../chanl-v2/chanl-platform node scripts/perf-check.mjs [--n 200] [--shots dir]
//
// CODELOOP_TOKEN is the `?token=` from the URL `codeloop serve` printed; the first page load carries
// it so the tab is the owner's. Playwright is not a dependency of this package; PLAYWRIGHT_DIR
// names a project that has it.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? true] : [])).filter((x) => x.length));
const BASE = (process.env.CODELOOP_URL ?? 'http://127.0.0.1:4040').replace(/\/$/, '');
const TOKEN = process.env.CODELOOP_TOKEN ?? '';
const withToken = (path) => `${BASE}${path}${TOKEN ? `${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(TOKEN)}` : ''}`;
const N = Number(args.n ?? 200);
const SHOTS = args.shots ? resolve(String(args.shots)) : null;
const BUDGET = { fullLoads: 0, p95ms: 100, heapMb: 20 };
const require = createRequire(resolve(process.env.PLAYWRIGHT_DIR ?? '/Users/deangrover/Projects/chanl-v2/chanl-platform', 'package.json'));
const { chromium } = require('playwright');

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const mb = (b) => b / 1048576;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('HeapProfiler.enable');
const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const { metrics } = await cdp.send('Performance.getMetrics'); return metrics.find((m) => m.name === 'JSHeapUsedSize').value; };

let fullLoads = 0;
page.on('load', () => { fullLoads += 1; });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const shot = async (name) => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false }); } };

// 1. Board: first paint comes from the server. (networkidle never fires: the live stream stays open.)
const t0 = Date.now();
await page.goto(withToken('/'), { waitUntil: 'domcontentloaded' });
const boardSsr = await page.evaluate(() => Boolean(document.querySelector('[data-testid^="lane-"], [data-testid="board-backlog"]')) && !document.querySelector('[data-testid="page-skeleton"]'));
await page.waitForSelector('[data-testid^="lane-"], [data-testid="board-backlog"]');
const boardMs = Date.now() - t0;
await page.waitForTimeout(400);
await shot('board');

// A card page and the wiki home, for the screenshots and the SSR check.
const firstCard = await page.evaluate(() => document.querySelector('[data-testid^="column-"] a[href^="/cards/"], a[href^="/cards/"]')?.getAttribute('href'));
if (firstCard) { await page.goto(`${BASE}${firstCard}`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-testid="card-details"], [data-testid="page-header"]'); await page.waitForTimeout(400); await shot('card'); }
await page.goto(`${BASE}/wiki/`, { waitUntil: 'domcontentloaded' });
const wikiSsr = await page.evaluate(() => Boolean(document.querySelector('[data-testid="wiki-home"]')));
await page.waitForTimeout(400);
await shot('wiki-home');

// 2. Open every folder in the tree so page links exist, then step through them by clicking.
const loadsBefore = fullLoads;
await page.evaluate(() => { window.__codeloopPerf = 1; });
for (const f of await page.$$('[data-testid^="wiki-folder-"]')) await f.click();
await page.waitForTimeout(100);
// Each link's text is the page title the view will show, which is what the navigation waits for.
const links = await page.$$eval('[data-testid="wiki-tree"] a[href^="/wiki/"]', (as) => as.map((a) => ({ href: a.getAttribute('href'), title: a.textContent.trim() })));
const hrefs = links.map((l) => l.href);
const titleOf = Object.fromEntries(links.map((l) => [l.href, l.title]));
if (hrefs.length < 2) { console.error(`need at least two wiki pages in the tree, found ${hrefs.length}`); process.exit(2); }

const times = [];
const heap0 = await heap();
let current = '';
for (let i = 0; i < N; i += 1) {
  const target = hrefs[i % hrefs.length] === current ? hrefs[(i + 1) % hrefs.length] : hrefs[i % hrefs.length];
  let link = page.locator(`[data-testid="wiki-tree"] a[href="${target}"]`).first();
  if (!(await link.count())) {
    // The folder is closed (tree state was lost): open it, then this navigation counts like any other.
    const folder = target.split('/').slice(-2, -1)[0];
    await page.locator(`[data-testid="wiki-folder-${folder}"]`).click();
    link = page.locator(`[data-testid="wiki-tree"] a[href="${target}"]`).first();
  }
  const start = performance.now();
  await link.click();
  // Done when the title is the target page's and the body has rendered text: a paragraph, list or
  // heading inside the prose block. (An aria-busy probe would wait on the backlinks request too.)
  await page.waitForFunction(
    ({ t, title }) =>
      location.pathname === t &&
      document.querySelector('[data-testid="wiki-page-title"]')?.textContent?.trim() === title &&
      Boolean(document.querySelector('[data-testid="wiki-page"] .prose :is(p, li, h2, h3, pre, table)')),
    { t: target, title: titleOf[target] },
  );
  times.push(performance.now() - start);
  current = target;
  if (i === 0) await shot('wiki-page');
}
const stillSame = await page.evaluate(() => window.__codeloopPerf === 1);
const heap1 = await heap();

const p50 = pct(times, 0.5), p95 = pct(times, 0.95), max = Math.max(...times);
const growth = mb(heap1 - heap0);
const loads = fullLoads - loadsBefore + (stillSame ? 0 : 1);

const rows = [
  ['board first paint', `${boardMs} ms`, boardSsr ? 'data in the server HTML' : 'client fetched (no SSR data)', boardSsr ? 'ok' : 'FAIL'],
  ['wiki home', wikiSsr ? 'rendered by server' : 'client only', '', wikiSsr ? 'ok' : 'FAIL'],
  ['wiki navigations', String(N), `${hrefs.length} distinct pages`, ''],
  ['full page loads', String(loads), `budget ${BUDGET.fullLoads}`, loads <= BUDGET.fullLoads ? 'ok' : 'FAIL'],
  ['navigation p50 / p95 / max', `${p50.toFixed(0)} / ${p95.toFixed(0)} / ${max.toFixed(0)} ms`, `p95 budget ${BUDGET.p95ms} ms`, p95 <= BUDGET.p95ms ? 'ok' : 'FAIL'],
  ['heap growth', `${growth.toFixed(1)} MB`, `${mb(heap0).toFixed(1)} → ${mb(heap1).toFixed(1)} MB, budget ${BUDGET.heapMb}`, growth <= BUDGET.heapMb ? 'ok' : 'FAIL'],
  ['page errors', String(errors.length), errors.slice(0, 2).join(' | ').slice(0, 120), errors.length ? 'FAIL' : 'ok'],
];
const w = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
console.log(rows.map((r) => r.map((v, c) => v.padEnd(w[c])).join('  ')).join('\n'));
await browser.close();
process.exit(rows.some((r) => r[3] === 'FAIL') ? 1 : 0);
