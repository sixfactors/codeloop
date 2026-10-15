/**
 * Whether a stage's output was never written: the file is missing, is still the template
 * `spec new` wrote, or has none of the lines the stage's check looks for. The doctor starts the
 * stage skill once on a stuck story in that state (`doctor.scaffold_starts`), since three failed
 * checks on a file no agent touched say nothing about the work.
 */
import { existsSync, readFileSync, statSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Card } from './cards.js';
import { parseQuestions } from './interview.js';
import { substitute, type Stage } from './lane.js';
import { specPath } from './project-root.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The lines each stage's check reads, by stage id; a file with none of them was never worked.
const MARKERS: Record<string, { has: (text: string) => boolean; what: string }> = {
  research: { has: t => /^verdict:\s*\S/m.test(t), what: 'no `verdict:` line' },
  interview: { has: t => parseQuestions(t).length > 0, what: 'no questions' },
  spec: { has: t => /^- \[( |x)\] T\d{3}\b/m.test(t), what: 'no tasks' },
};

/** Why the card's stage output counts as the scaffold, or undefined when someone wrote it. */
export function stageScaffold(projectDir: string, card: Card, stage: Stage): string | undefined {
  if (!stage.output) return undefined;
  const path = substitute(stage.output, card, { projectDir });
  const file = specPath(projectDir, path);
  if (!existsSync(file) || !statSync(file).isFile()) return `${path} is missing`;
  const text = readFileSync(file, 'utf-8');
  const template = join(PACKAGE_ROOT, 'templates/spec', basename(path));
  if (existsSync(template) && text === readFileSync(template, 'utf-8').replaceAll('{{id}}', card.id).replaceAll('{{title}}', card.title)) return `${path} is the template`;
  const marker = MARKERS[stage.id];
  return marker && !marker.has(text) ? `${path} has ${marker.what}` : undefined;
}
