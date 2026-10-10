import chalk from 'chalk';
import { ConflictError } from '../lib/cards.js';
import { CloudConflictError } from '../lib/cloud.js';
import { RefusalError } from '../lib/engine.js';

/** A refusal raised by a command's own argument check, exiting 2 like the engine's. */
export const refuse = (message: string) => new RefusalError(message);

/** Exit codes: 2 = a check, gate or permission refused; 3 = cards.json version conflict. */
export function guard<A extends unknown[]>(fn: (...args: A) => void | Promise<void>) {
  return async (...args: A): Promise<void> => {
    try {
      await fn(...args);
    } catch (e) {
      const message = (e as Error).message;
      if (e instanceof RefusalError) {
        console.error(chalk.red(`refused: ${message}`));
        process.exit(2);
      }
      if (e instanceof ConflictError || e instanceof CloudConflictError) {
        console.error(chalk.red(`conflict: ${message}`));
        process.exit(3);
      }
      console.error(chalk.red(message));
      process.exit(1);
    }
  };
}
