import { getActiveCard } from '../lib/active-card.js';
import { findCardOrNone, readCards, writeCards, type CardEvent } from '../lib/cards.js';
import { clock } from '../lib/clock.js';
import type { WatchSignal } from './signals.js';

export interface TriggerResult {
  action: string;
  details: string;
}

/**
 * Process a signal and determine what actions to take.
 * Returns a list of actions taken (for logging/reporting).
 */
export function processSignal(projectDir: string, signal: WatchSignal): TriggerResult[] {
  const results: TriggerResult[] = [];

  switch (signal.type) {
    case 'file_change':
      // File changes are primarily used to reset the idle timer.
      // No board action needed for individual file saves.
      results.push({
        action: 'file_tracked',
        details: `${signal.data.file}`,
      });
      break;

    case 'git_commit': {
      const cardId = getActiveCard(projectDir);
      if (!cardId) {
        results.push({
          action: 'commit_untracked',
          details: `${signal.data.sha}: no active card`,
        });
        break;
      }
      try {
        const file = readCards(projectDir);
        const card = findCardOrNone(file.cards, cardId);
        if (!card) {
          results.push({
            action: 'commit_untracked',
            details: `${signal.data.sha}: active card ${cardId} not on the board`,
          });
          break;
        }
        const now = clock();
        const event: CardEvent = {
          at: now.toISOString(),
          actor: 'watch',
          human: false,
          action: 'commit',
          stage: card.stage,
          note: `${signal.data.sha}${signal.data.message ? ` ${signal.data.message}` : ''}`,
        };
        const next = { ...card, events: [...card.events, event], updatedAt: now.toISOString() };
        writeCards(projectDir, file, file.cards.map(c => (c.id === card.id ? next : c)));
        results.push({
          action: 'commit_tracked',
          details: `${signal.data.sha} → card ${card.id} (${signal.data.message})`,
        });
      } catch {
        results.push({
          action: 'commit_error',
          details: `Failed to record commit ${signal.data.sha} on card ${cardId}`,
        });
      }
      break;
    }

    case 'idle':
      results.push({
        action: 'idle_timeout',
        details: `No activity for ${signal.data.idleSeconds}s`,
      });
      break;

    case 'test_result':
      results.push({
        action: 'test_tracked',
        details: `Tests: ${signal.data.passed}/${signal.data.total} passed`,
      });
      break;

    case 'build_status':
      results.push({
        action: 'build_tracked',
        details: `Build: ${signal.data.status}`,
      });
      break;
  }

  return results;
}
