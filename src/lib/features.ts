/**
 * Epics and features as wiki pages, and the RICE score that rolls up from them. The readers are
 * synchronous so the file driver, the inbox report and `card list` share one parser; the index
 * reads through the store and scores with the same functions.
 */
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { RefusalError, type Card } from './cards.js';
import { parseFrontmatter } from './skills.js';
import { EpicSchema, FeatureSchema, type Epic, type Feature, type Rice } from './store/schema.js';
import { WIKI_DIR } from './wiki.js';

export const EPICS_DIR = `${WIKI_DIR}/epics`;
export const FEATURES_DIR = `${WIKI_DIR}/features`;

export type Band = 'P1' | 'P2' | 'P3' | 'P4';
export const BANDS: Band[] = ['P1', 'P2', 'P3', 'P4'];

/** What scoring adds to a feature. `score` is absent when the page carries no rice. */
export interface Scored {
  score?: number;
  band: Band;
}

/** What scoring adds to a card: its band and score, and the chain of slugs its feature names. */
export type CardChain = Scored & { initiative?: string; epic?: string; feature?: string };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** reach × impact × confidence ÷ effort, one decimal. `effort` replaces the rice's own when a card overrides it. */
export function riceScore(rice: Rice, effort: number = rice.effort): number {
  return round1((rice.reach * rice.impact * rice.confidence) / effort);
}

/**
 * Quartile bands over the scores given: a score in the top quarter is P1, the bottom quarter P4.
 * Equal scores share a band; with fewer than four scores the quarters are coarse (one score is P1).
 */
export function bander(scores: number[]): (score: number | undefined) => Band {
  const n = scores.length;
  return score => {
    if (score === undefined || n === 0) return 'P4';
    const greater = scores.filter(s => s > score).length;
    return BANDS[Math.min(3, Math.floor((4 * greater) / n))];
  };
}

/** Every feature with its score and band; the band is over the features that have a score. */
export function scoreFeatures<T extends Pick<Feature, 'rice'>>(features: T[]): (T & Scored)[] {
  const scored = features.map(f => ({ ...f, score: f.rice ? riceScore(f.rice) : undefined }));
  const band = bander(scored.flatMap(f => (f.score === undefined ? [] : [f.score])));
  return scored.map(f => ({ ...f, band: band(f.score) }));
}

/** The one-decimal sum of the scores given; 0 when none has one. */
export const sumScores = (items: { score?: number }[]) => round1(items.reduce((n, i) => n + (i.score ?? 0), 0));

/**
 * The card's chain and score from the feature it names. A card without a feature, or naming one
 * that has no page, keeps its own fields and is P4; its own `effort` replaces the feature's.
 */
export function chainOf(card: Pick<Card, 'feature' | 'effort' | 'initiative' | 'epic'>, features: Map<string, Feature & Scored>): CardChain {
  const feature = card.feature ? features.get(card.feature) : undefined;
  if (!feature) return { band: 'P4', ...(card.initiative ? { initiative: card.initiative } : {}), ...(card.epic ? { epic: card.epic } : {}), ...(card.feature ? { feature: card.feature } : {}) };
  const score = feature.rice ? riceScore(feature.rice, card.effort ?? feature.rice.effort) : undefined;
  return { band: feature.band, ...(score === undefined ? {} : { score }), initiative: feature.initiative, ...(feature.epic ? { epic: feature.epic } : {}), feature: feature.id };
}

export const featureMap = (features: Feature[]): Map<string, Feature & Scored> => new Map(scoreFeatures(features).map(f => [f.id, f]));

/** Score descending, unscored last; ties by `since` ascending, so the oldest parked card comes first. */
export function byScoreThenOldest<T extends { score?: number; since?: string; createdAt?: string }>(items: T[]): T[] {
  const at = (i: T) => i.since ?? i.createdAt ?? '';
  return [...items].sort((a, b) => {
    if (a.score !== b.score) {
      if (a.score === undefined) return 1;
      if (b.score === undefined) return -1;
      return b.score - a.score;
    }
    return at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0;
  });
}

// ---- pages ----

const files = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => join(dir, f)) : []);

function loadPage<T>(file: string, what: string, parse: (data: Record<string, unknown>) => T): T {
  const text = readFileSync(file, 'utf-8');
  const { data, body } = parseFrontmatter(text);
  try {
    return parse({ ...data, id: basename(file, '.md'), body: body.trim(), version: sha1(text) });
  } catch (e) {
    throw new RefusalError(`${what} ${basename(file, '.md')}: ${issues(e)}`);
  }
}

const issues = (e: unknown) => {
  const z = e as { issues?: { path: (string | number)[]; message: string }[] };
  return z.issues ? z.issues.map(i => `${i.path.join('.') || 'page'} ${i.message}`).join('; ') : String((e as Error).message ?? e);
};

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

export const parseEpic = (data: Record<string, unknown>): Epic => EpicSchema.parse({ ...data, title: data.title ?? data.id });
export const parseFeature = (data: Record<string, unknown>): Feature => FeatureSchema.parse({ ...data, title: data.title ?? data.id });

export const loadEpic = (file: string): Epic => loadPage(file, 'epic', parseEpic);
export const loadFeature = (file: string): Feature => loadPage(file, 'feature', parseFeature);
export const listEpics = (projectDir: string): Epic[] => files(join(projectDir, EPICS_DIR)).map(loadEpic);
export const listFeatures = (projectDir: string): Feature[] => files(join(projectDir, FEATURES_DIR)).map(loadFeature);

/** Every card with its chain, band and score, from the feature pages on disk: for reads that have no index. */
export function withChain<T extends Card>(projectDir: string, cards: T[]): (T & CardChain)[] {
  const features = featureMap(listFeatures(projectDir));
  return cards.map(c => ({ ...c, ...chainOf(c, features) }));
}
