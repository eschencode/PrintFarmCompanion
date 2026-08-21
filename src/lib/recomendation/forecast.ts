/**
 * Demand helpers for the days-of-cover model.
 *
 * The suggestion/queue system is driven purely by days-till-stockout
 * (stock ÷ daily velocity). The old Monte-Carlo stockout-risk model and
 * risk-based priority bucketing were removed — priority is derived from
 * days-of-cover in printQueue.ts (`priorityFromDays`).
 */

// How far back sales are considered when estimating velocity.
export const FORECAST_LOOKBACK_DAYS = 90;

export type Confidence = 'high' | 'medium' | 'low';

/** More days with recorded sales → more trustworthy velocity estimate. */
export function confidenceFromDaysWithSales(daysWithSales: number): Confidence {
  if (daysWithSales >= 30) return 'high';
  if (daysWithSales >= 10) return 'medium';
  return 'low';
}
