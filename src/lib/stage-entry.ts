/**
 * When a card entered its current stage, from its events. No node imports: the workspace's client
 * bundle reads it through `@protoboxai/codeloop/sdk` as well as the server.
 */

/** Actions that bring a card into the stage they name: a placement, promotion, unpark, return, move or reopen. */
export const ENTERS: ReadonlySet<string> = new Set(['place', 'promote', 'unpark', 'returned', 'move', 'reopen']);

/** Index of the event that brought the card into `stage` last (an advance into it, or a placement, promotion, return or move to it); -1 when it has been there since it was made. */
export function stageEntryIndex(events: { action: string; stage?: string; note?: string }[] = [], stage: string): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.action === 'advance' && /^to (\S+)/.exec(e.note ?? '')?.[1] === stage) return i;
    if (ENTERS.has(e.action) && e.stage === stage) return i;
  }
  return -1;
}
