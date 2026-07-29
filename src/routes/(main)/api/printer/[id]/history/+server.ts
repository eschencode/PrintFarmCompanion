import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPrintJobsForPrinter, getPrinterEvents } from '$lib/server';
import { requireCtx } from '$lib/server/context';

/** GET /api/printer/:id/history?limit=50&before=<unix seconds>
 *  Past prints + event timeline for the printer history modal.
 *  `before` keysets on job created_at; events are fetched down to the oldest
 *  returned job so both lists cover the same time window.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
  const ctx = requireCtx(locals);

  const id = Number(params.id);
  if (!id) return json({ success: false, error: 'Invalid printer id' }, { status: 400 });

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
  const beforeParam = Number(url.searchParams.get('before'));
  const before = beforeParam > 0 ? beforeParam : undefined;

  const jobs = await getPrintJobsForPrinter(ctx, id, limit, before);

  // Cover the jobs' window; if fewer jobs than limit came back we're at the
  // start of history, so take events all the way down (within the row cap).
  const oldestJobTime = jobs.length === limit ? jobs[jobs.length - 1].created_at : undefined;
  let events = await getPrinterEvents(ctx, id, 500, before);
  if (oldestJobTime !== undefined) {
    events = events.filter((e) => e.created_at >= oldestJobTime);
  }

  return json({
    success: true,
    jobs,
    events,
    hasMore: jobs.length === limit,
  });
};
