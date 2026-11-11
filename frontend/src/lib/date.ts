/**
 * Local-time date helpers.
 *
 * `new Date("YYYY-MM-DD")` parses as UTC midnight, which renders as the
 * previous day in negative-offset timezones (e.g. America/Toronto). Always use
 * these helpers for booking calendar dates instead.
 */

/** Parse a YYYY-MM-DD (or ISO datetime) string as a LOCAL calendar date. */
export const parseLocalDate = (date: string): Date => {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** Format a Date as YYYY-MM-DD in local time (safe for API params). */
export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Return the first open business day on or after `from`.
 * `openDays` uses JS weekday numbers (0 = Sunday … 6 = Saturday).
 */
export const nextOpenDate = (from: Date, openDays: number[]): Date => {
  const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 7; i++) {
    if (openDays.includes(candidate.getDay())) return candidate;
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
};
