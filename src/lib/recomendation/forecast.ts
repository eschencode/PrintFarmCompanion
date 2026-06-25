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

import type { InventoryPriority } from '../types';

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

const RISK_TIER_ORDER: InventoryPriority[] = ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Cap on how high a *risk-derived* tier can climb given forecast confidence.
// A low-data SKU shouldn't scream CRITICAL on a noisy bootstrap spike — but the
// hard min_threshold floor below still overrides this regardless of confidence.
const CONFIDENCE_MAX_RISK_TIER: Record<Confidence, InventoryPriority> = {
  high: 'CRITICAL',
  medium: 'HIGH',
  low: 'MEDIUM'
};

/** Bucket a single SKU from its stock, floor, stockout risk, and forecast confidence. */
export function bucketPriority(item: {
  in_stock: number;
  min_threshold: number;
  stockout_risk: number;
  confidence?: Confidence;
}): InventoryPriority {
  // Hard inventory floor — independent of forecast quality.
  if (item.in_stock <= item.min_threshold) return 'CRITICAL';

  let tier: InventoryPriority;
  if (item.stockout_risk >= RISK_THRESHOLDS.CRITICAL) tier = 'CRITICAL';
  else if (item.stockout_risk >= RISK_THRESHOLDS.HIGH) tier = 'HIGH';
  else if (item.stockout_risk >= RISK_THRESHOLDS.MEDIUM) tier = 'MEDIUM';
  else if (item.stockout_risk >= RISK_THRESHOLDS.LOW) tier = 'LOW';
  else tier = 'VERY_LOW';

  if (item.confidence) {
    const cap = CONFIDENCE_MAX_RISK_TIER[item.confidence];
    if (RISK_TIER_ORDER.indexOf(tier) > RISK_TIER_ORDER.indexOf(cap)) tier = cap;
  }
  return tier;
}

// Deterministic PRNG so risk estimates are reproducible across requests.
// An unseeded Math.random bootstrap made buckets flicker between page loads.
function mulberry32(seed: number): () => number {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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
    const rng = mulberry32(hashSeed(slug));
    for (let t = 0; t < this.trials; t++) {
      let total = 0;
      for (let d = 0; d < this.horizonDays; d++) {
        total += dailySales[(rng() * n) | 0];
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

  /** p-quantile of cumulative horizon-day demand (p in [0,1]). */
  quantile(slug: string, p: number): number {
    const sorted = this.samples.get(slug);
    if (!sorted || sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
    return sorted[idx];
  }

  hasData(slug: string): boolean {
    return this.samples.has(slug);
  }
}
