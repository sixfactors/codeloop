#!/usr/bin/env node
// Drives the hub the way a person switching between two projects would, with Playwright borrowed
// from another checkout (this repo does not depend on it; see scripts/first-user/browser.mjs).
// Prints one `STEP PASS|FAIL <name>` line per step and exits 1 when any step failed.
//
//   node hub-playwright.mjs <hub base url> <idA> <idB> <screenshot dir>
import { createRequire } from 'module';

const [base, idA, idB, shotDir] = process.argv.slice(2);
const from = process.env.FIRST_USER_PLAYWRIGHT || new URL('../package.json', import.meta.url).pathname;
const { chromium } = createRequire(from)('playwright');

let failed = 0;
const pass = (name) => console.log(`STEP PASS ${name}`);
const fail = (name, why) => { failed += 1; console.log(`STEP FAIL ${name}: ${why}`); };
const api = async (path) => (await fetch(`${base}${path}`)).json();

async function step(name, fn) {
  try { await fn(); pass(name); return true; } catch (e) { fail(name, (e.message || String(e)).split('\n')[0]); return false; }
}

async function waitFor(predicate, ms = 15000, every = 250) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await predicate()) return true; await new Promise(r => setTimeout(r, every)); }
  return false;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

async function signIn() {
  await page.locator('[data-testid="read-only-banner-sign-in"]').click();
  await page.locator('[data-testid="sign-in-user"]').fill('owner');
  await page.locator('[data-testid="sign-in-password"]').fill('codeloop');
  await page.locator('[data-testid="sign-in-submit"]').click();
  const signedIn = await waitFor(async () => (await page.locator('[data-testid="read-only-banner"]').count()) === 0);
  if (!signedIn) throw new Error('read-only banner is still showing after sign-in');
}

try {
  await step('project A board loads with c-001, from the hub', async () => {
    await page.goto(`${base}/p/${idA}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="board-card-c-001"]').first().waitFor({ timeout: 20000 });
  });
  await step('Accept is disabled before signing in', async () => {
    await page.locator('[data-testid="board-card-c-001"]').first().click();
    const accept = page.locator('[data-testid="question-accept"]').first();
    await accept.waitFor({ timeout: 15000 });
    if (!(await accept.isDisabled())) throw new Error('Accept is not disabled for a signed-out visitor');
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="question-accept"]').waitFor({ state: 'hidden', timeout: 10000 });
  });
  await step('sign in once, at the hub', signIn);
  await step('accept A\'s question', async () => {
    await page.locator('[data-testid="board-card-c-001"]').first().click();
    const accept = page.locator('[data-testid="question-accept"]').first();
    await accept.waitFor({ state: 'visible', timeout: 10000 });
    if (await accept.isDisabled()) throw new Error('Accept is still disabled after signing in');
    await accept.click();
    const answered = await waitFor(async () => {
      const q = (await api(`/api/p/${idA}/cards/c-001/questions`)).questions;
      return Array.isArray(q) && q.some((x) => x.answer);
    });
    if (!answered) throw new Error('question on A\'s c-001 is not answered after Accept');
    const shown = await waitFor(async () => (await page.locator('body').innerText()).includes('answered'));
    if (!shown) throw new Error('the page does not show A\'s question as answered');
  });
  await step('screenshot A, answered', async () => {
    await page.screenshot({ path: `${shotDir}/hub-project-a-answered.png` });
  });

  await step('switch to project B (no second sign-in): B\'s board loads with its own c-001', async () => {
    await page.goto(`${base}/p/${idB}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="board-card-c-001"]').first().waitFor({ timeout: 20000 });
    const stillSignedIn = (await page.locator('[data-testid="read-only-banner"]').count()) === 0;
    if (!stillSignedIn) throw new Error('the hub sign-in from project A did not carry over to project B');
  });
  await step('B\'s question is still open: Accept is enabled but unanswered, proving A\'s accept never touched B', async () => {
    await page.locator('[data-testid="board-card-c-001"]').first().click();
    const accept = page.locator('[data-testid="question-accept"]').first();
    await accept.waitFor({ state: 'visible', timeout: 10000 });
    if (await accept.isDisabled()) throw new Error('Accept is disabled in B even though we are signed in at the hub');
    const q = (await api(`/api/p/${idB}/cards/c-001/questions`)).questions;
    if (!Array.isArray(q) || q.some((x) => x.answer)) throw new Error(`B's question on c-001 is already answered: ${JSON.stringify(q)}`);
  });
  await step('screenshot B, still open', async () => {
    await page.screenshot({ path: `${shotDir}/hub-project-b-open.png` });
  });

  await step('A is still answered after visiting B (no cross-project bleed either direction)', async () => {
    const q = (await api(`/api/p/${idA}/cards/c-001/questions`)).questions;
    if (!Array.isArray(q) || !q.some((x) => x.answer)) throw new Error(`A's question reverted: ${JSON.stringify(q)}`);
  });
} finally {
  await browser.close();
}
if (errors.length) fail('no page errors in the browser console', errors.join(' | ').slice(0, 300));
process.exit(failed ? 1 : 0);
