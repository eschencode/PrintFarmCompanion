import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

/**
 * POST /api/printer/:id/finished
 * Body: { status?: 'success' | 'failed' }
 *
 * Moves the printer's open `printing` job → `print_finished` (awaiting user
 * confirmation), mirroring the Pi webhook. This is the authoritative completion
 * path for desktop-direct (which has no webhook) and a frontend fallback for the
 * stuck-at-99% case. Idempotent: when the job is already finished it matches 0 rows.
 */
export const POST: RequestHandler = async ({ params, request, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  const id = Number(params.id);
  if (!id) return json({ success: false, error: 'Invalid printer id' }, { status: 400 });

  let body: { status?: 'success' | 'failed' } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine — defaults to success */
  }

  const now = Math.floor(Date.now() / 1000);
  const failureHint = body.status === 'failed' ? 'Printer reported failure' : null;

  await getDb(db).run(sql`
    UPDATE print_jobs
    SET status = 'print_finished',
        failure_reason = COALESCE(${failureHint}, failure_reason),
        updated_at = ${now}
    WHERE printer_id = ${id} AND status = 'printing'
  `);

  return json({ success: true });
};
