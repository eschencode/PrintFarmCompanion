import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as db from '$lib/server';
import {
  buildModuleBreakdown,
  computeUtilization,
  buildFailureAnalysis,
  buildSpoolUsage
} from '$lib/utils/statsCompute';

/**
 * GET /api/stats?from=<ms>&to=<ms>
 *
 * Returns stats for an arbitrary date range — used by the custom range picker
 * in TimeRangeSelector. Runs the same computations as the page server load
 * but for the requested window only.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
  const database = platform?.env?.DB;
  if (!database) return json({ error: 'Database not available' }, { status: 500 });

  const fromMs = Number(url.searchParams.get('from'));
  const toMs   = Number(url.searchParams.get('to'));
  if (!fromMs || !toMs || fromMs >= toMs) {
    return json({ error: 'Invalid from/to parameters' }, { status: 400 });
  }

  try {
    const [printers, rawJobs, modules, spools] = await Promise.all([
      db.getAllPrinters(database),
      db.getAllPrintJobs(database),
      db.getAllPrintModules(database),
      db.getAllSpools(database),
    ]);

    const jobs = (rawJobs as any[]).filter(
      (j: any) =>
        (j.status === 'success' || j.status === 'failed') &&
        j.start_time >= fromMs &&
        j.start_time <= toMs
    );

    const moduleBreakdown  = buildModuleBreakdown(jobs, modules as any[], spools as any[]);
    const utilizationScores = computeUtilization(printers as any[], rawJobs as any[], fromMs, toMs);
    const failureAnalysis  = buildFailureAnalysis(jobs, printers as any[], spools as any[]);
    const spoolUsage       = buildSpoolUsage(jobs);

    return json({ moduleBreakdown, utilizationScores, failureAnalysis, spoolUsage });
  } catch (e) {
    console.error('Stats API error:', e);
    return json({ error: 'Failed to compute stats' }, { status: 500 });
  }
};
