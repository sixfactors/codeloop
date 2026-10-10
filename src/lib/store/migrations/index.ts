import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { clock } from '../../clock.js';
import type { Store } from '../driver.js';
import { STORE_FILE } from '../file.js';
import { storyFields } from './001-story-fields.js';

export interface Migration {
  /** `NNN-name`; applied in id order, once. */
  id: string;
  up(ctx: { store: Store; projectDir: string }): Promise<string | void> | string | void;
}

export interface StoreRecord {
  applied: { id: string; at: string; note?: string }[];
}

/** Every migration there is, in order. A new one is added here and nowhere else. */
export const MIGRATIONS: Migration[] = [storyFields];

export function readStoreRecord(projectDir: string): StoreRecord {
  const file = join(projectDir, STORE_FILE);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as StoreRecord) : { applied: [] };
}

export const pendingMigrations = (projectDir: string, migrations = MIGRATIONS): Migration[] => {
  const done = new Set(readStoreRecord(projectDir).applied.map(a => a.id));
  return migrations.filter(m => !done.has(m.id));
};

/** Applies what .codeloop/store.json does not list yet and records each one as it lands. */
export async function runMigrations(projectDir: string, store: Store, migrations = MIGRATIONS): Promise<{ id: string; note?: string }[]> {
  const ran: { id: string; note?: string }[] = [];
  for (const migration of pendingMigrations(projectDir, migrations)) {
    const note = (await migration.up({ store, projectDir })) || undefined;
    const record = readStoreRecord(projectDir);
    record.applied.push({ id: migration.id, at: clock().toISOString(), ...(note ? { note } : {}) });
    const file = join(projectDir, STORE_FILE);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
    ran.push({ id: migration.id, ...(note ? { note } : {}) });
  }
  return ran;
}
