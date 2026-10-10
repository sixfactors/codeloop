import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveSpecDir } from './spec.js';

// `- source: <url or path> — <note>`. A spaced hyphen is accepted in place of the dash. Exported so
// the shape workflow's brief check (src/lib/shape.ts) counts sources the same way research.md does.
export const SOURCE = /^- source: (https?:\/\/\S+) (?:—|–|-) \S.*$/;
// A file in this repo, optionally with a line number, counts when it exists: most evidence for a
// story lives in the codebase and its docs, and a repo with no remote has no URL for them.
const PATH_SOURCE = /^- source: ((?!https?:\/\/)[^\s:]+(?::\d+)?) (?:—|–|-) \S.*$/;

export function sourceOf(projectDir: string, line: string): string | undefined {
  const url = SOURCE.exec(line)?.[1];
  if (url) return url;
  const path = PATH_SOURCE.exec(line)?.[1];
  if (!path) return undefined;
  return existsSync(join(projectDir, path.replace(/:\d+$/, ''))) ? path : undefined;
}
const VERDICT = /^verdict:\s*\S/m;
const ONLINE_TIMEOUT_MS = 10_000;

/** `ref` is a card id or number. The research file is the one in the card's spec folder. */
export function checkResearch(projectDir: string, ref: string, minSources: number): { file: string; errors: string[]; urls: string[] } {
  const file = `${resolveSpecDir(projectDir, ref)}/research.md`;
  if (!existsSync(join(projectDir, file))) return { file, errors: [`missing file: ${file}`], urls: [] };
  const text = readFileSync(join(projectDir, file), 'utf-8');
  const sources = text.split('\n').map(l => sourceOf(projectDir, l.trim())).filter((u): u is string => !!u);
  const urls = sources.filter(s => /^https?:\/\//.test(s));
  const errors: string[] = [];
  if (!VERDICT.test(text)) errors.push(`${file} has no line starting with "verdict:"`);
  if (sources.length < minSources) errors.push(`${file} cites ${sources.length} ${sources.length === 1 ? 'source' : 'sources'}, needs ${minSources} (\`- source: <url or path> — <note>\`)`);
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

/** The lines of a research file worth keeping after the card is gone: the exists call, the pain, the options and the verdict. */
export function researchSummary(text: string): { verdict: string; exists?: string; pain?: string; options: string } | null {
  const verdict = /^verdict:\s*(\S.*)$/m.exec(text)?.[1]?.trim();
  if (!verdict) return null;
  const exists = /^exists:\s*(\S.*)$/m.exec(text)?.[1]?.trim();
  const pain = /^pain:\s*(\S.*)$/m.exec(text)?.[1]?.trim();
  const options = (/^## Options\s*\n([\s\S]*?)(?=\n## |\s*$)/m.exec(text)?.[1] ?? '').trim();
  return { verdict, ...(exists ? { exists } : {}), ...(pain ? { pain } : {}), options };
}
