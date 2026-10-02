const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// One field: a comma list of `*`, `*/n`, `a`, `a-b` or `a-b/n`. Day names are accepted for day-of-week.
function parseField(field: string, min: number, max: number, names?: string[]): Set<number> | null {
  if (field === '*') return null;
  const unsupported = () => new Error(`unsupported cron field "${field}" (use *, */n, a, a-b, a-b/n or a comma list${names ? '; MON..SUN allowed' : ''}; values ${min}-${max})`);
  const value = (text: string): number => {
    const named = names ? names.indexOf(text.toUpperCase()) : -1;
    const n = named >= 0 ? named : /^\d+$/.test(text) ? parseInt(text, 10) : NaN;
    if (Number.isNaN(n) || n < min || n > max) throw unsupported();
    return n;
  };
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const [range, stepText, extra] = part.split('/');
    if (extra !== undefined || range === '') throw unsupported();
    const step = stepText === undefined ? 1 : /^\d+$/.test(stepText) ? parseInt(stepText, 10) : 0;
    if (step < 1) throw unsupported();
    const bounds = range === '*' ? [min, max] : range.split('-').map(value);
    if (bounds.length > 2) throw unsupported();
    const from = bounds[0];
    // `5/10` means "from 5 to the end, every 10", as in cron.
    const to = bounds.length === 2 ? bounds[1] : stepText === undefined ? from : max;
    if (from > to) throw unsupported();
    for (let n = from; n <= to; n += step) out.add(n);
  }
  return out;
}

function parseCron(expr: string) {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron "${expr}" must have 5 fields`);
  const dow = parseField(f[4], 0, 7, DOW);
  if (dow?.has(7)) dow.add(0);
  return {
    minute: parseField(f[0], 0, 59),
    hour: parseField(f[1], 0, 23),
    dom: parseField(f[2], 1, 31),
    month: parseField(f[3], 1, 12),
    dow,
  };
}

export function cronError(expr: string): string | null {
  try {
    parseCron(expr);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Matches in local time, as cron does. */
export function cronMatches(expr: string, date: Date): boolean {
  const c = parseCron(expr);
  const ok = (set: Set<number> | null, v: number) => set === null || set.has(v);
  if (!ok(c.minute, date.getMinutes()) || !ok(c.hour, date.getHours()) || !ok(c.month, date.getMonth() + 1)) {
    return false;
  }
  // Standard cron: when both day fields are restricted, either one matching is enough.
  if (c.dom && c.dow) return c.dom.has(date.getDate()) || c.dow.has(date.getDay());
  return ok(c.dom, date.getDate()) && ok(c.dow, date.getDay());
}

/** The latest minute in (after, now] that the expression matches, or null. */
export function lastDueSlot(expr: string, after: Date, now: Date): Date | null {
  const slot = new Date(now);
  slot.setSeconds(0, 0);
  while (slot.getTime() > after.getTime()) {
    if (cronMatches(expr, slot)) return slot;
    slot.setMinutes(slot.getMinutes() - 1);
  }
  return null;
}
