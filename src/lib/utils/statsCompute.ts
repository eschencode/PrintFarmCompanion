/**
 * Pure stats computation functions shared between the stats page server load
 * and the /api/stats custom-range endpoint.
 * All functions take explicit data parameters (no closures over DB results).
 */

export interface SpoolUsageEntry {
  color: string;
  material: string;
  brand: string;
  printCount: number;
  weightUsed: number; // grams
}

/** Maps a module name + image path to its display category and optional subcategory. */
export function getModuleCategory(
  moduleName: string,
  imagePath: string | null
): { category: string; subcategory: string | null } {
  const lowerName = moduleName.toLowerCase();

  if (imagePath?.includes('klohalter') || imagePath?.includes('stab') || imagePath?.includes('stöpsel')) {
    return { category: 'Klorolle', subcategory: null };
  }
  if (imagePath?.includes('vase')) {
    return { category: 'Vase', subcategory: null };
  }
  if (imagePath?.includes('haken') || imagePath?.includes('hakenhalter')) {
    if (lowerName.includes('halter')) return { category: 'Haken', subcategory: 'Halter' };
    if (lowerName.includes('kleben'))  return { category: 'Haken', subcategory: 'Kleben' };
    if (lowerName.includes('schrauben')) return { category: 'Haken', subcategory: 'Schrauben' };
    return { category: 'Haken', subcategory: 'Other' };
  }
  return { category: moduleName, subcategory: null };
}

/**
 * Builds the nested module production breakdown (category → subcategory → module → color).
 * Includes cost and weight tracking for both successful and failed prints.
 */
export function buildModuleBreakdown(jobs: any[], modules: any[], spools: any[]): any {
  const breakdown: any = {};

  jobs.forEach(job => {
    if (!job.module_name) return;

    const module = modules.find((m: any) => m.id === job.module_id);
    const spool = spools.find((s: any) => s.id === job.spool_id);
    const color = spool?.color || 'Unknown';
    const objectsPerPrint = module?.objects_per_print || 1;

    const materialWeight = job.actual_weight || job.planned_weight || 0;
    const spoolCost = spool?.cost || 0;
    const spoolWeight = spool?.initial_weight || 1000;
    const costPerGram = spoolCost / spoolWeight;
    const printCost = materialWeight * costPerGram;

    const isFailed = job.status === 'failed';
    const objectsProduced = isFailed ? 0 : objectsPerPrint;

    const { category, subcategory } = getModuleCategory(job.module_name, module?.image_path || null);

    if (!breakdown[category]) {
      breakdown[category] = {
        total: 0, totalObjects: 0, totalWeight: 0, totalCost: 0,
        wastedCost: 0, wastedWeight: 0, successfulPrints: 0, failedPrints: 0,
        subcategories: {}, modules: {}, colors: {}
      };
    }

    breakdown[category].total += 1;
    breakdown[category].totalObjects += objectsProduced;
    breakdown[category].totalWeight += materialWeight;
    breakdown[category].totalCost += printCost;
    if (isFailed) {
      breakdown[category].wastedCost += printCost;
      breakdown[category].wastedWeight += materialWeight;
      breakdown[category].failedPrints += 1;
    } else {
      breakdown[category].successfulPrints += 1;
    }

    if (subcategory) {
      if (!breakdown[category].subcategories[subcategory]) {
        breakdown[category].subcategories[subcategory] = {
          total: 0, totalObjects: 0, totalWeight: 0, totalCost: 0,
          wastedCost: 0, wastedWeight: 0, successfulPrints: 0, failedPrints: 0, modules: {}
        };
      }
      const sub = breakdown[category].subcategories[subcategory];
      sub.total += 1; sub.totalObjects += objectsProduced; sub.totalWeight += materialWeight; sub.totalCost += printCost;
      if (isFailed) { sub.wastedCost += printCost; sub.wastedWeight += materialWeight; sub.failedPrints += 1; }
      else { sub.successfulPrints += 1; }

      if (!sub.modules[job.module_name]) {
        sub.modules[job.module_name] = {
          total: 0, totalObjects: 0, totalWeight: 0, totalCost: 0,
          wastedCost: 0, wastedWeight: 0, successfulPrints: 0, failedPrints: 0,
          avgCostPerPrint: 0, avgWeightPerPrint: 0, costPerObject: 0, colors: {}
        };
      }
      const mod = sub.modules[job.module_name];
      mod.total += 1; mod.totalObjects += objectsProduced; mod.totalWeight += materialWeight; mod.totalCost += printCost;
      if (isFailed) { mod.wastedCost += printCost; mod.wastedWeight += materialWeight; mod.failedPrints += 1; }
      else { mod.successfulPrints += 1; }
      mod.avgCostPerPrint = mod.totalCost / mod.total;
      mod.avgWeightPerPrint = mod.totalWeight / mod.total;
      mod.costPerObject = mod.totalObjects > 0 ? mod.totalCost / mod.totalObjects : 0;

      if (!mod.colors[color]) {
        mod.colors[color] = { count: 0, objects: 0, weight: 0, cost: 0, wastedCost: 0, wastedWeight: 0 };
      }
      mod.colors[color].count += 1; mod.colors[color].objects += objectsProduced;
      mod.colors[color].weight += materialWeight; mod.colors[color].cost += printCost;
      if (isFailed) { mod.colors[color].wastedCost += printCost; mod.colors[color].wastedWeight += materialWeight; }
    } else {
      if (!breakdown[category].modules[job.module_name]) {
        breakdown[category].modules[job.module_name] = {
          total: 0, totalObjects: 0, totalWeight: 0, totalCost: 0,
          wastedCost: 0, wastedWeight: 0, successfulPrints: 0, failedPrints: 0,
          avgCostPerPrint: 0, avgWeightPerPrint: 0, costPerObject: 0, colors: {}
        };
      }
      const mod = breakdown[category].modules[job.module_name];
      mod.total += 1; mod.totalObjects += objectsProduced; mod.totalWeight += materialWeight; mod.totalCost += printCost;
      if (isFailed) { mod.wastedCost += printCost; mod.wastedWeight += materialWeight; mod.failedPrints += 1; }
      else { mod.successfulPrints += 1; }
      mod.avgCostPerPrint = mod.totalCost / mod.total;
      mod.avgWeightPerPrint = mod.totalWeight / mod.total;
      mod.costPerObject = mod.totalObjects > 0 ? mod.totalCost / mod.totalObjects : 0;

      if (!mod.colors[color]) {
        mod.colors[color] = { count: 0, objects: 0, weight: 0, cost: 0, wastedCost: 0, wastedWeight: 0 };
      }
      mod.colors[color].count += 1; mod.colors[color].objects += objectsProduced;
      mod.colors[color].weight += materialWeight; mod.colors[color].cost += printCost;
      if (isFailed) { mod.colors[color].wastedCost += printCost; mod.colors[color].wastedWeight += materialWeight; }
    }

    if (!breakdown[category].colors[color]) {
      breakdown[category].colors[color] = { count: 0, objects: 0, cost: 0, wastedCost: 0 };
    }
    breakdown[category].colors[color].count += 1;
    breakdown[category].colors[color].objects += objectsProduced;
    breakdown[category].colors[color].cost += printCost;
    if (isFailed) breakdown[category].colors[color].wastedCost += printCost;
  });

  return breakdown;
}

/** Computes per-printer and farm-wide utilization for a given time window. */
export function computeUtilization(
  printersArr: any[],
  jobsArr: any[],
  periodStart: number,
  periodEnd: number
) {
  const periodMs = periodEnd - periodStart;
  const periodDays = periodMs / (24 * 60 * 60 * 1000);
  const jobDurationMs = (j: any) => (j.expected_time || 0) * 60 * 1000;

  const perPrinterRaw = printersArr.map((p: any) => {
    const printerJobs = jobsArr.filter((j: any) =>
      j.printer_id === p.id &&
      (j.status === 'successful' || j.status === 'failed') &&
      j.start_time >= periodStart && j.start_time < periodEnd
    );
    const successMs = printerJobs.filter((j: any) => j.status === 'successful').reduce((s: number, j: any) => s + jobDurationMs(j), 0);
    const failedMs  = printerJobs.filter((j: any) => j.status === 'failed').reduce((s: number, j: any) => s + jobDurationMs(j), 0);
    const printingMs = successMs + failedMs;
    const idleMs = Math.max(0, periodMs - printingMs);
    const utilizationPct = periodMs > 0 ? (printingMs / periodMs) * 100 : 0;
    const failedPct     = periodMs > 0 ? (failedMs   / periodMs) * 100 : 0;
    return {
      printerId: p.id, name: p.name, successMs, failedMs, printingMs, idleMs,
      successHrs: Math.round((successMs  / 3_600_000) * 10) / 10,
      failedHrs:  Math.round((failedMs   / 3_600_000) * 10) / 10,
      printingHrs:Math.round((printingMs / 3_600_000) * 10) / 10,
      idleHrs:    Math.round((idleMs     / 3_600_000) * 10) / 10,
      utilizationPct: Math.round(utilizationPct * 10) / 10,
      failedPct:      Math.round(failedPct      * 10) / 10
    };
  });

  const farmSuccessMs  = perPrinterRaw.reduce((s, p) => s + p.successMs,  0);
  const farmFailedMs   = perPrinterRaw.reduce((s, p) => s + p.failedMs,   0);
  const farmPrintingMs = farmSuccessMs + farmFailedMs;
  const farmAvailableMs = periodMs * printersArr.length;
  const farmIdleMs = Math.max(0, farmAvailableMs - farmPrintingMs);
  const farmUtilizationPct = farmAvailableMs > 0
    ? Math.round((farmPrintingMs / farmAvailableMs) * 1000) / 10 : 0;

  const periodJobs = jobsArr.filter((j: any) =>
    (j.status === 'successful' || j.status === 'failed') &&
    j.start_time >= periodStart && j.start_time < periodEnd
  );
  const avgJobDurationMs = periodJobs.length > 0
    ? periodJobs.reduce((s: number, j: any) => s + jobDurationMs(j), 0) / periodJobs.length : 0;

  const dailyPrintingMs   = farmPrintingMs  / periodDays;
  const dailyAvailableMs  = farmAvailableMs / periodDays;
  const additionalMsPerDay = Math.max(0, dailyAvailableMs * 0.8 - dailyPrintingMs);
  const additionalPrintsPerDay = avgJobDurationMs > 0
    ? Math.round((additionalMsPerDay / avgJobDurationMs) * 10) / 10 : 0;
  const additionalHrsPerDay = Math.round((additionalMsPerDay / 3_600_000) * 10) / 10;

  const perPrinter = perPrinterRaw.map(
    ({ successMs: _a, failedMs: _b, printingMs: _c, idleMs: _d, ...rest }) => rest
  );

  return {
    farmUtilizationPct,
    totalSuccessHrs:  Math.round((farmSuccessMs  / 3_600_000) * 10) / 10,
    totalFailedHrs:   Math.round((farmFailedMs   / 3_600_000) * 10) / 10,
    totalPrintingHrs: Math.round((farmPrintingMs / 3_600_000) * 10) / 10,
    totalIdleHrs:     Math.round((farmIdleMs     / 3_600_000) * 10) / 10,
    perPrinter,
    growthPotential: { targetPct: 80, additionalPrintsPerDay, additionalHrsPerDay }
  };
}

/** Builds failure analysis: rate, wasted material, breakdowns by reason / printer / module. */
export function buildFailureAnalysis(jobs: any[], printers: any[], spools: any[]) {
  const completed = jobs.filter((j: any) => j.status !== 'printing');
  const failed    = jobs.filter((j: any) => j.status === 'failed');
  const totalCompleted = completed.length;
  const totalFailed    = failed.length;
  const failureRate = totalCompleted > 0
    ? Math.round((totalFailed / totalCompleted) * 1000) / 10 : 0;

  let wastedMaterial = 0;
  let wastedCost = 0;
  failed.forEach((j: any) => {
    const w = j.actual_weight || 0;
    wastedMaterial += w;
    const spool = spools.find((s: any) => s.id === j.spool_id);
    if (spool?.cost && spool.initial_weight) {
      wastedCost += w * (spool.cost / spool.initial_weight);
    }
  });

  const reasonMap = new Map<string, number>();
  failed.forEach((j: any) => {
    const r = j.failure_reason || 'Unknown';
    reasonMap.set(r, (reasonMap.get(r) || 0) + 1);
  });
  const byReason = [...reasonMap.entries()]
    .map(([reason, count]) => ({
      reason, count,
      pct: totalFailed > 0 ? Math.round((count / totalFailed) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count);

  const printerMap = new Map<number, { name: string; total: number; failed: number; reasons: Map<string, number> }>();
  completed.forEach((j: any) => {
    if (!j.printer_id) return;
    if (!printerMap.has(j.printer_id)) {
      const p = printers.find((pr: any) => pr.id === j.printer_id);
      printerMap.set(j.printer_id, { name: p?.name || `#${j.printer_id}`, total: 0, failed: 0, reasons: new Map() });
    }
    const e = printerMap.get(j.printer_id)!;
    e.total++;
    if (j.status === 'failed') {
      e.failed++;
      const r = j.failure_reason || 'Unknown';
      e.reasons.set(r, (e.reasons.get(r) || 0) + 1);
    }
  });
  const byPrinter = [...printerMap.values()]
    .map(p => ({
      name: p.name, total: p.total, failed: p.failed,
      failureRate: p.total > 0 ? Math.round((p.failed / p.total) * 1000) / 10 : 0,
      topReason: p.reasons.size > 0
        ? [...p.reasons.entries()].sort((a, b) => b[1] - a[1])[0][0] : null
    }))
    .sort((a, b) => b.failureRate - a.failureRate);

  const moduleMap = new Map<string, { total: number; failed: number; reasons: Map<string, number> }>();
  completed.forEach((j: any) => {
    const name = j.module_name || j.name || 'Unknown';
    if (!moduleMap.has(name)) moduleMap.set(name, { total: 0, failed: 0, reasons: new Map() });
    const e = moduleMap.get(name)!;
    e.total++;
    if (j.status === 'failed') {
      e.failed++;
      const r = j.failure_reason || 'Unknown';
      e.reasons.set(r, (e.reasons.get(r) || 0) + 1);
    }
  });
  const byModule = [...moduleMap.entries()]
    .filter(([, d]) => d.total >= 2)
    .map(([name, d]) => ({
      name, total: d.total, failed: d.failed,
      failureRate: d.total > 0 ? Math.round((d.failed / d.total) * 1000) / 10 : 0,
      topReason: d.reasons.size > 0
        ? [...d.reasons.entries()].sort((a, b) => b[1] - a[1])[0][0] : null
    }))
    .sort((a, b) => b.failureRate - a.failureRate);

  return {
    totalCompleted, totalFailed, failureRate,
    wastedMaterial: Math.round(wastedMaterial),
    wastedCost: Math.round(wastedCost * 100) / 100,
    byReason, byPrinter, byModule
  };
}

/**
 * Aggregates filament consumption by color + material for the given jobs.
 * Uses the spool_color / spool_material fields joined onto print jobs.
 * Sorted by weight used descending so the most-used materials appear first in charts.
 */
export function buildSpoolUsage(jobs: any[]): SpoolUsageEntry[] {
  const map = new Map<string, SpoolUsageEntry>();

  jobs
    .filter((j: any) => j.status === 'successful' || j.status === 'failed')
    .forEach((job: any) => {
      const color    = job.spool_color    || 'Unknown';
      const material = job.spool_material || 'Unknown';
      const brand    = job.spool_brand    || '';
      const key = `${color}|||${material}`;
      const weight = job.actual_weight || job.planned_weight || 0;

      if (!map.has(key)) map.set(key, { color, material, brand, printCount: 0, weightUsed: 0 });
      const entry = map.get(key)!;
      entry.printCount++;
      entry.weightUsed += weight;
    });

  return [...map.values()]
    .map(e => ({ ...e, weightUsed: Math.round(e.weightUsed) }))
    .sort((a, b) => b.weightUsed - a.weightUsed);
}
