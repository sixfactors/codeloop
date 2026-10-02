import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveSpecDir } from './spec.js';

// `- source: <url> — <note>`. A spaced hyphen is accepted in place of the dash.
const SOURCE = /^- source: (https?:\/\/\S+) (?:—|–|-) \S.*$/;
const VERDICT = /^verdict:\s*\S/m;
const ONLINE_TIMEOUT_MS = 10_000;

/** `ref` is a card id or number. The research file is the one in the card's spec folder. */
export function checkResearch(projectDir: string, ref: string, minSources: number): { file: string; errors: string[]; urls: string[] } {
  const file = `${resolveSpecDir(projectDir, ref)}/research.md`;
  if (!existsSync(join(projectDir, file))) return { file, errors: [`missing file: ${file}`], urls: [] };
  const text = readFileSync(join(projectDir, file), 'utf-8');
  const urls = text.split('\n').map(l => SOURCE.exec(l.trim())?.[1]).filter((u): u is string => !!u);
  const errors: string[] = [];
  if (!VERDICT.test(text)) errors.push(`${file} has no line starting with "verdict:"`);
  if (urls.length < minSources) errors.push(`${file} cites ${urls.length} ${urls.length === 1 ? 'source' : 'sources'}, needs ${minSources} (\`- source: <url> — <note>\`)`);
  return { file, errors, urls };
}

async function answers(url: string): Promise<string | null> {
  const ask = (method: string) => fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(ONLINE_TIMEOUT_MS) });
  try {
    let res = await ask('HEAD');
    // Some servers refuse HEAD and serve the page to GET.
    if (res.status >= 400) res = await ask('GET');
    return res.status < 400 ? null : `${url} answered ${res.status}`;
  } catch (e) {
    return `${url} did not answer (${(e as Error).cause instanceof Error ? ((e as Error).cause as NodeJS.ErrnoException).code ?? (e as Error).message : (e as Error).message})`;
  }
}

/** One line per URL that does not answer with 2xx or 3xx. */
export async function checkOnline(urls: string[]): Promise<string[]> {
  return (await Promise.all(urls.map(answers))).filter((e): e is string => e !== null);
}
