/** Formats a duration in minutes as "Xh Ym" or "Ym". */
export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

/** Formats Pi-reported remaining minutes. Returns empty string when unavailable. */
export function formatRemainingTime(mins: number | null | undefined): string {
  if (mins == null || mins <= 0) return '';
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins}m`;
}

/**
 * Returns elapsed time in minutes since a print started.
 * Handles legacy DB records that stored start_time as Unix seconds
 * rather than milliseconds (values below 10_000_000_000).
 */
export function getElapsedTimeMinutes(startTime: number, now: number): number {
  const ms = startTime < 10_000_000_000 ? startTime * 1000 : startTime;
  return Math.floor((now - ms) / 1000 / 60);
}

/** Returns elapsed time formatted as a human-readable string. */
export function getElapsedTime(startTime: number, now: number): string {
  return formatTime(getElapsedTimeMinutes(startTime, now));
}

/** Returns remaining time formatted as a human-readable string. */
export function getRemainingTime(startTime: number, expectedMinutes: number, now: number): string {
  const elapsed = getElapsedTimeMinutes(startTime, now);
  const remaining = Math.max(0, expectedMinutes - elapsed);
  return formatTime(remaining);
}

/** Returns print progress as an integer 0–100. */
export function getProgress(startTime: number, expectedMinutes: number, now: number): number {
  const elapsed = getElapsedTimeMinutes(startTime, now);
  return Math.min(100, Math.round((elapsed / expectedMinutes) * 100));
}
