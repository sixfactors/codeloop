#!/usr/bin/env node
// Drives the served board the way a first user would, with Playwright borrowed from another
// checkout (this repo does not depend on it). Prints one `STEP PASS|FAIL <name>` line per step
// and exits 1 when any step failed.
//
//   node browser.mjs <gate|wiki> <base url> <user:password> <ui: workspace|static> [card id]
//
// The board signs in with a username and password now, not a token in the URL; `user:password`
// is the board's sign-in credentials (the default `owner:codeloop` on a freshly `init`ed project).
// FIRST_USER_PLAYWRIGHT names the package.json whose node_modules holds playwright.
import { createRequire } from 'module';

const [flow, base, creds, ui, cardId = 'c-002'] = process.argv.slice(2);
const [signInUser, signInPassword] = (creds || 'owner:codeloop').split(':');
const from = process.env.FIRST_USER_PLAYWRIGHT || '/Users/deangrover/Projects/chanl-v2/chanl-platform/package.json';
const { chromium } = createRequire(from)('playwright');

let failed = 0;
const pass = (name) => console.log(`STEP PASS ${name}`);
const fail = (name, why) => { failed += 1; console.log(`STEP FAIL ${name}: ${why}`); };
const url = (path) => `${base}${path}`;
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

// Signs in once, from whatever page is open: the read-only banner's own button opens the same
// dialog every disabled write control would. Asserts the banner is gone afterward, proving the
// session cookie actually took (not just that the dialog closed).
async function signIn() {
  await page.locator('[data-testid="read-only-banner-sign-in"]').click();
  await page.locator('[data-testid="sign-in-user"]').fill(signInUser);
  await page.locator('[data-testid="sign-in-password"]').fill(signInPassword);
  await page.locator('[data-testid="sign-in-submit"]').click();
  const signedIn = await waitFor(async () => (await page.locator('[data-testid="read-only-banner"]').count()) === 0);
  if (!signedIn) throw new Error('read-only banner is still showing after sign-in');
}

try {
  if (flow === 'gate') {
    if (ui === 'workspace') {
      await step('board loads with the docs card c-001', async () => {
        await page.goto(url('/'), { waitUntil: 'domcontentloaded' });
        await page.locator('[data-testid="board-card-c-001"]').first().waitFor({ timeout: 20000 });
      });
      await step('sign in', signIn);
      await step(`open ${cardId}: the gate box shows gate spec`, async () => {
        await page.locator(`[data-testid="board-card-${cardId}"]`).first().click();
        const gate = page.locator('[data-testid="gate-card"]');
        await gate.waitFor({ timeout: 15000 });
        const text = await gate.innerText();
        if (!/spec/.test(text)) throw new Error(`gate box does not name the spec gate: ${text.replace(/\n/g, ' | ')}`);
      });
      await step(`approve ${cardId} from the UI: the card moves to build`, async () => {
        await page.locator('[data-testid="gate-card"] button', { hasText: 'Approve' }).click();
        const moved = await waitFor(async () => (await api(`/api/cards/${cardId}`)).card?.stage === 'build' || (await api(`/api/cards/${cardId}`)).stage === 'build');
        if (!moved) throw new Error(`${cardId} is not at build after Approve: ${JSON.stringify(await api(`/api/cards/${cardId}`)).slice(0, 300)}`);
        const gone = await waitFor(async () => (await page.locator('[data-testid="gate-card"]').count()) === 0);
        if (!gone) throw new Error('the gate box is still showing after the approval');
      });
    } else {
      await step('board loads with the docs card c-001', async () => {
        await page.goto(url('/'), { waitUntil: 'domcontentloaded' });
        await page.getByText('c-001', { exact: false }).first().waitFor({ timeout: 20000 });
      });
      await step(`open ${cardId}: the gate box shows`, async () => {
        await page.getByText(cardId, { exact: false }).first().click();
        await page.getByText('Waiting for you').first().waitFor({ timeout: 15000 });
      });
      await step(`approve ${cardId} from the UI: the card moves to build`, async () => {
        await page.getByRole('button', { name: 'Approve' }).first().click();
        const moved = await waitFor(async () => ((await api(`/api/cards/${cardId}`)).card ?? (await api(`/api/cards/${cardId}`))).stage === 'build');
        if (!moved) throw new Error(`${cardId} is not at build after Approve`);
      });
    }
  } else if (flow === 'wiki') {
    const title = 'Invoice export rollout';
    if (ui !== 'workspace') {
      fail('wiki opens', `the ${ui} board has no wiki (only the workspace app under dist/workspace does)`);
    } else {
      await step('wiki opens', async () => {
        await page.goto(url('/wiki/'), { waitUntil: 'domcontentloaded' });
        await page.locator('[data-testid="wiki"]').waitFor({ timeout: 20000 });
        await page.locator('[data-testid="wiki-new"]').waitFor({ timeout: 15000 });
      });
      await step('sign in', signIn);
      await step(`create a page "${title}" from the UI`, async () => {
        await page.locator('[data-testid="wiki-new"]').click();
        await page.locator('[data-testid="wiki-new-title"]').fill(title);
        await page.locator('[data-testid="wiki-new-create"]').click();
        await page.waitForURL(/\/wiki\/.+invoice-export-rollout/, { timeout: 15000 });
        const shown = await waitFor(async () => (await page.locator('body').innerText()).includes(title));
        if (!shown) throw new Error('the new page did not render its title');
      });
      await step('search finds the new page', async () => {
        await page.goto(url('/wiki/?q=rollout'), { waitUntil: 'domcontentloaded' });
        const hit = page.locator('[data-testid="wiki-search-hit"]', { hasText: title });
        await hit.first().waitFor({ timeout: 15000 });
      });
    }
  } else if (flow === 'question') {
    // Proof of the sign-in model end to end: a visitor cannot answer, signs in, and the same
    // Accept button that was disabled now works, and the server remembers it was answered.
    await step(`board loads with ${cardId}`, async () => {
      await page.goto(url('/'), { waitUntil: 'domcontentloaded' });
      await page.locator(`[data-testid="board-card-${cardId}"]`).first().waitFor({ timeout: 20000 });
    });
    await step('Accept is disabled before signing in', async () => {
      await page.locator(`[data-testid="board-card-${cardId}"]`).first().click();
      const accept = page.locator('[data-testid="question-accept"]').first();
      await accept.waitFor({ timeout: 15000 });
      if (!(await accept.isDisabled())) throw new Error('Accept is not disabled for a signed-out visitor');
      // Close the card drawer: the read-only banner sits behind it, same as every other page.
      await page.keyboard.press('Escape');
      await page.locator('[data-testid="question-accept"]').waitFor({ state: 'hidden', timeout: 10000 });
    });
    await step('sign in', signIn);
    await step('accept the recommended answer', async () => {
      await page.locator(`[data-testid="board-card-${cardId}"]`).first().click();
      const accept = page.locator('[data-testid="question-accept"]').first();
      await accept.waitFor({ state: 'visible', timeout: 10000 });
      if (await accept.isDisabled()) throw new Error('Accept is still disabled after signing in');
      await accept.click();
      const answered = await waitFor(async () => {
        const q = (await api(`/api/cards/${cardId}/questions`)).questions ?? (await api(`/api/cards/${cardId}/questions`));
        return Array.isArray(q) && q.some((x) => x.answer);
      });
      if (!answered) throw new Error(`question on ${cardId} is not answered after Accept`);
    });
    await step('the UI shows the question answered', async () => {
      const shown = await waitFor(async () => (await page.locator('body').innerText()).includes('answered'));
      if (!shown) throw new Error('the page does not show the question as answered');
    });
  } else {
    fail('flow', `unknown flow ${flow}`);
  }
} finally {
  await browser.close();
}
if (errors.length) fail('no page errors in the browser console', errors.join(' | ').slice(0, 300));
process.exit(failed ? 1 : 0);
