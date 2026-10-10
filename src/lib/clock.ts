/**
 * The current time. CODELOOP_NOW replaces it, so a test or a demonstration can place a command on
 * a chosen day and have every event it writes carry that time. `run --now` does the same for one run.
 */
export function clock(): Date {
  const set = process.env.CODELOOP_NOW;
  if (!set) return new Date();
  const at = new Date(set);
  if (Number.isNaN(at.getTime())) throw new Error(`CODELOOP_NOW "${set}" is not a date`);
  return at;
}
