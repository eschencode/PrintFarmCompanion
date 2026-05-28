/**
 * Stockout forecast via empirical bootstrap.
 *
 * For each SKU, we hold a sorted vector of M simulated cumulative-demand
 * realisations over the next `horizonDays` days. Drawing days with replacement
 * from the SKU's recent daily-sales history captures variance, burstiness, and
 * intermittent demand without assuming a parametric shape.
 *
 * stockout_risk = P(cumulative demand over horizon >= current stock).
 */

export const FORECAST_LOOKBACK_DAYS = 90;
export const FORECAST_HORIZON_DAYS = 7;
export const FORECAST_TRIALS = 500;

export const RISK_THRESHOLDS = {
  CRITICAL: 0.60,
  HIGH: 0.30,
  MEDIUM: 0.10,
  LOW: 0.03,
} as const;

export type Confidence = 'high' | 'medium' | 'low';

export function confidenceFromDaysWithSales(daysWithSales: number): Confidence {
  if (daysWithSales >= 30) return 'high';
  if (daysWithSales >= 10) return 'medium';
  return 'low';
}

export class StockoutForecast {
  private samples = new Map<string, Float32Array>();
  readonly horizonDays: number;
  readonly trials: number;

  constructor(horizonDays = FORECAST_HORIZON_DAYS, trials = FORECAST_TRIALS) {
    this.horizonDays = horizonDays;
    this.trials = trials;
  }

  fit(slug: string, dailySales: number[]): void {
    const n = dailySales.length;
    const out = new Float32Array(this.trials);
    if (n === 0) {
      this.samples.set(slug, out);
      return;
    }
    for (let t = 0; t < this.trials; t++) {
      let total = 0;
      for (let d = 0; d < this.horizonDays; d++) {
        total += dailySales[(Math.random() * n) | 0];
      }
      out[t] = total;
    }
    out.sort();
    this.samples.set(slug, out);
  }

  /** P(cumulative horizon-day demand >= stock). */
  riskAtStock(slug: string, stock: number): number {
    const sorted = this.samples.get(slug);
    if (!sorted || sorted.length === 0) return 0;
    if (stock <= 0) return 1;
    const M = sorted.length;
    // First index where sorted[i] >= stock.
    let lo = 0;
    let hi = M;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] < stock) lo = mid + 1;
      else hi = mid;
    }
    return (M - lo) / M;
  }

  hasData(slug: string): boolean {
    return this.samples.has(slug);
  }
}
