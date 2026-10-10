import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export const ACTIVE_CARD_PATH = '.codeloop/state/active-card';

/** The card `codeloop start`, `codeloop card activate` or a Cursor/Claude hook last set in this repo. */
export function getActiveCard(projectDir: string): string | undefined {
  // A headless run (`codeloop run --agent`) names its card in the environment; the hooks the host
  // fires inside that run must see it as active, or the UserPromptSubmit guard blocks the agent's
  // first turn and the stage does nothing.
  const fromRun = process.env.CODELOOP_CARD?.trim();
  if (fromRun) return fromRun;
  const file = join(projectDir, ACTIVE_CARD_PATH);
  if (!existsSync(file)) return undefined;
  const id = readFileSync(file, 'utf-8').trim();
  return id || undefined;
}

export function setActiveCard(projectDir: string, id: string): void {
  const file = join(projectDir, ACTIVE_CARD_PATH);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${id}\n`);
}

export function clearActiveCard(projectDir: string): void {
  const file = join(projectDir, ACTIVE_CARD_PATH);
  if (existsSync(file)) unlinkSync(file);
}
