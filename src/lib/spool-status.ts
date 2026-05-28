export type SpoolStatus = 'empty' | 'low' | 'ok';

/** Predicted-empty threshold: amber when stock runs out within this many days. */
export const LOW_STOCK_DAYS = 10;

export interface SpoolDepletion {
  status: SpoolStatus;
  /** Spools consumed per day, averaged over the 30d window. */
  ratePerDay: number;
  /** Days until storage hits 0 at the current rate. Infinity if no usage. */
  daysLeft: number;
}

/**
 * Classify a preset's stock health from its current storage count and how many
 * spools were opened in the last 30 days. Green = healthy, amber = predicted to
 * run out within LOW_STOCK_DAYS, red = already empty.
 */
export function computeDepletion(inStorage: number, used30d: number): SpoolDepletion {
  const ratePerDay = used30d / 30;
  const daysLeft = ratePerDay > 0 ? inStorage / ratePerDay : Infinity;

  let status: SpoolStatus;
  if (inStorage <= 0) status = 'empty';
  else if (daysLeft <= LOW_STOCK_DAYS) status = 'low';
  else status = 'ok';

  return { status, ratePerDay, daysLeft };
}

/** Most severe status wins: empty > low > ok. */
export function worstStatus(statuses: SpoolStatus[]): SpoolStatus {
  if (statuses.includes('empty')) return 'empty';
  if (statuses.includes('low')) return 'low';
  return 'ok';
}

export const STATUS_DOT: Record<SpoolStatus, string> = {
  empty: 'bg-red-500',
  low: 'bg-amber-500',
  ok: 'bg-green-500',
};
