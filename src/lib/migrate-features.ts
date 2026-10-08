/**
 * `card migrate-features`: a one-off that reads a mapping of card id to feature slug and writes
 * `feature:` and the feature's `initiative` onto each card. The mapping is a YAML map in
 * `.codeloop/migrations/features.yaml` by default. An unknown feature slug refuses the whole run,
 * so a typo never leaves a card pointing at a page that does not exist.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { findCardOrNone, readCards, RefusalError, writeCards } from './cards.js';
import { listFeatures } from './features.js';

export const FEATURES_MIGRATION = '.codeloop/migrations/features.yaml';

export function migrateFeatures(projectDir: string, mappingFile: string = FEATURES_MIGRATION): { changed: string[]; mapping: string } {
  const file = join(projectDir, mappingFile);
  if (!existsSync(file)) throw new RefusalError(`${mappingFile} not found; it maps card ids to feature slugs, one \`c-NNN: <feature>\` per line`);
  const raw = parseYaml(readFileSync(file, 'utf-8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RefusalError(`${mappingFile} must be a map of card id to feature slug`);
  const mapping = raw as Record<string, unknown>;
  const features = new Map(listFeatures(projectDir).map(f => [f.id, f]));
  const cards = readCards(projectDir);
  const problems: string[] = [];
  const changed: string[] = [];
  const next = cards.cards.map(card => ({ ...card }));
  for (const [ref, slug] of Object.entries(mapping)) {
    const feature = typeof slug === 'string' ? features.get(slug) : undefined;
    if (!feature) {
      problems.push(`${ref}: feature "${String(slug)}" has no page under .codeloop/wiki/features/`);
      continue;
    }
    const card = findCardOrNone(next, ref);
    if (!card) {
      problems.push(`${ref}: no such card`);
      continue;
    }
    if (card.feature === feature.id && card.initiative === feature.initiative) continue;
    card.feature = feature.id;
    card.initiative = feature.initiative;
    changed.push(card.id);
  }
  if (problems.length) throw new RefusalError(`${mappingFile} refused, nothing written: ${problems.join('; ')}`);
  if (changed.length) writeCards(projectDir, cards, next);
  return { changed, mapping: mappingFile };
}
