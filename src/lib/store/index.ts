import { loadConfig } from '../config.js';
import { RefusalError } from '../cards.js';
import type { Store } from './driver.js';
import { FileDriver } from './file.js';
import { MemoryDriver } from './memory.js';

export type { Change, Entity, KeyValue, Query, Repo, RepoName, Store } from './driver.js';
export { applyQuery, ConflictError } from './driver.js';
export * from './schema.js';
export { FileDriver, STORE_FILE } from './file.js';
export { MemoryDriver } from './memory.js';
export { MIGRATIONS, pendingMigrations, readStoreRecord, runMigrations, type Migration } from './migrations/index.js';

export type DriverFactory = (projectDir: string, options: Record<string, unknown>) => Store;

const drivers = new Map<string, DriverFactory>([
  ['file', projectDir => new FileDriver(projectDir)],
  ['memory', () => new MemoryDriver()],
]);

/** A plugin that brings its own store (protobox, sql) registers it under the name config.yaml picks it by. */
export function registerDriver(name: string, factory: DriverFactory): void {
  drivers.set(name, factory);
}

export const driverNames = () => [...drivers.keys()];

/** The store config.yaml asks for under `store.driver`, the file driver when it says nothing. */
export function openStore(projectDir: string): Store {
  const config = (loadConfig(projectDir).store ?? {}) as { driver?: string } & Record<string, unknown>;
  const { driver = 'file', ...options } = config;
  const factory = drivers.get(driver);
  if (!factory) throw new RefusalError(`store.driver "${driver}" in .codeloop/config.yaml is not registered (${driverNames().join(', ')})`);
  return factory(projectDir, options);
}
