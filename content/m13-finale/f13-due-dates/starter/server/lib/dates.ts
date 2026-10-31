// Provided: calendar dates (not instants). A due date "2026-10-31" is stored as midnight UTC.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-31" → Date at 2026-10-31T00:00:00Z, or null if it isn't a real calendar date. */
export function parseDateOnly(value: string): Date | null {
  if (!DATE_ONLY.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  // rejects things like 2026-02-31, which Date would silently roll over to March
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

/** Date → "2026-10-31" */
export function formatDateOnly(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

/** Midnight UTC today — "overdue" means due before this. */
export function startOfTodayUTC(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
