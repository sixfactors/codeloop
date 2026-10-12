import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { cardKey, findCardOrNone, readCards } from './cards.js';
import { cardNumber } from './lane.js';
import { loadConfig } from './config.js';

/**
 * The live walk: the story's feature driven as a person would, in a browser, on the repo's normal
 * dev stack, with the network calls that answered. Use cases run against harnesses that wire their
 * own URLs and fakes, so a story could pass every use case while the page a person opens still ran
 * on a browser mock. The walk is the evidence that the real services answered.
 *
 * It lives in evidence/<nnn>/verify.md as a `## Live walk` section, outside verify's marked block:
 *
 *   ## Live walk
 *   stack: make up
 *   url: http://localhost:3016/tools
 *   steps:
 *   - opened Tools and saw the three seeded tools
 *   - imported an OpenAPI file and saw the new tool in the list
 *   network:
 *   - GET http://localhost:8410/tools 200
 *   - POST https://httpbin.org/post 200
 *   external: https://httpbin.org/post        (or `external: none: <why the feature calls nothing outside>`)
 */
export const LIVE_WALK_HEADING = /^##\s+live walk\s*$/im;

/** Words that mean something other than the real service answered. */
const NOT_REAL = /\b(mock(?:ed|s)?|stub(?:bed|s)?|fake[sd]?|canned|msw|harness|fixture|in-process|placeholder)\b/i;
const NETWORK_LINE = /^-\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s+(\d{3})\b/i;
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|::1|[\w-]+\.localhost|[\w-]+\.test|[\w-]+\.local)$/i;

/** On unless `.codeloop/config.yaml` sets `verify: { live_walk: false }`. */
export function liveWalkRequired(projectDir: string): boolean {
  return (loadConfig(projectDir).verify as { live_walk?: unknown } | undefined)?.live_walk !== false;
}

function section(text: string): string | undefined {
  const m = LIVE_WALK_HEADING.exec(text);
  if (!m) return undefined;
  const rest = text.slice(m.index + m[0].length);
  const next = /^#{1,2}\s/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function field(body: string, name: string): string | undefined {
  return new RegExp(`^${name}:[ \\t]*(.*)$`, 'im').exec(body)?.[1]?.trim();
}

function items(body: string, name: string): string[] {
  const lines = body.split('\n');
  const at = lines.findIndex(l => new RegExp(`^${name}:\\s*$`, 'i').test(l.trim()));
  if (at < 0) return [];
  const out: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (/^\s*-\s+/.test(line)) out.push(line.trim());
    else if (line.trim() === '') continue;
    else break;
  }
  return out;
}

function host(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/** What is wrong with the card's live walk; empty when it is complete. */
export function checkLiveWalk(projectDir: string, ref: string): string[] {
  const card = findCardOrNone(readCards(projectDir).cards, ref);
  const nnn = card ? cardKey(card) : cardNumber(ref);
  const path = `evidence/${nnn}/verify.md`;
  const file = join(projectDir, path);
  const howTo = 'drive the feature as a user in the browser on the normal dev stack and record it (see the verify skill)';
  if (!existsSync(file)) return [`${path} is missing; ${howTo}`];
  const body = section(readFileSync(file, 'utf-8'));
  if (body === undefined) return [`${path} has no \`## Live walk\` section; ${howTo}`];

  const errors: string[] = [];
  const stack = field(body, 'stack');
  if (!stack) errors.push('live walk: `stack:` is empty; name how the normal dev stack was started (for example `make up`)');
  else if (NOT_REAL.test(stack)) errors.push(`live walk: the stack "${stack}" is a harness or mock; walk the repo's normal dev stack`);

  const url = field(body, 'url');
  if (!url || !/^https?:\/\//i.test(url)) errors.push('live walk: `url:` must be the page a person opens (http or https)');

  const steps = items(body, 'steps');
  if (steps.length < 2) errors.push('live walk: `steps:` needs at least two lines, each what was done and what was seen');

  const network = items(body, 'network');
  const calls = network.map(l => NETWORK_LINE.exec(l)).filter((m): m is RegExpExecArray => Boolean(m));
  if (!calls.length) errors.push('live walk: `network:` needs the calls observed, one per line as `- GET <url> <status>`');
  else if (!calls.some(m => Number(m[3]) >= 200 && Number(m[3]) < 400)) errors.push('live walk: no call under `network:` succeeded (2xx or 3xx)');
  const unreal = network.filter(l => NOT_REAL.test(l));
  if (unreal.length) errors.push(`live walk: these calls name a mock or stub, so a real service did not answer: ${unreal.join('; ')}`);
  if (calls.length && calls.every(m => NOT_REAL.test(m[2]))) errors.push('live walk: every call went to a mock');

  const external = field(body, 'external');
  if (!external) {
    errors.push('live walk: `external:` is missing; give the real call to a public test host, or `external: none: <why>`');
  } else if (/^none\b/i.test(external)) {
    if (external.replace(/^none\s*[:\-]?\s*/i, '').length < 10) errors.push('live walk: `external: none` needs the reason the feature calls nothing outside');
  } else {
    const h = host(external);
    const observed = calls.some(m => host(m[2]) === h && Number(m[3]) < 400);
    if (!h || LOCAL_HOST.test(h)) errors.push(`live walk: \`external: ${external}\` is not a public host`);
    else if (!observed) errors.push(`live walk: the external call to ${h} is not among the successful calls under \`network:\``);
  }
  return errors;
}
