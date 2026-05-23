import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as db from '$lib/server';
import { getAllPrintJobsForStats } from '$lib/server/jobs';
import {
  buildModuleBreakdown,
  computeUtilization,
  buildFailureAnalysis,
  buildSpoolUsage,
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
  const toMs = Number(url.searchParams.get('to'));
  if (!fromMs || !toMs || fromMs >= toMs) {
    return json({ error: 'Invalid from/to parameters' }, { status: 400 });
  }

  try {
    const [printers, allJobs] = await Promise.all([
      db.getAllPrinters(database),
      getAllPrintJobsForStats(database),
    ]);

    const windowJobs = allJobs.filter(
      (j) =>
        (j.status === 'successful' || j.status === 'failed') &&
        (j.start_time ?? 0) >= fromMs &&
        (j.start_time ?? 0) <= toMs,
    );

    return json({
      moduleBreakdown: buildModuleBreakdown(windowJobs),
      utilizationScores: computeUtilization(printers, allJobs, fromMs, toMs),
      failureAnalysis: buildFailureAnalysis(windowJobs, printers),
      spoolUsage: buildSpoolUsage(windowJobs),
    });
  } catch (e) {
    console.error('Stats API error:', e);
    return json({ error: 'Failed to compute stats' }, { status: 500 });
  }
};
