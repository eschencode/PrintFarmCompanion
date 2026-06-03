import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

/**
 * POST /api/pi/webhook
 * Called by the Pi when a printer's MQTT status changes.
 *
 * The printer firmware reports FINISH whenever the gcode program ends — it
 * can't tell a good print from spaghetti. So we never auto-complete: on a
 * terminal state we move the job to `print_finished` ("awaiting confirmation")
 * and the user confirms success/failure from the dashboard, which deducts spool
 * weight and updates inventory. `failure_reason` is pre-filled when the printer
 * itself aborted (gcode_state FAILED) as a hint for the confirmation UI.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  const secret = platform?.env?.PI_WEBHOOK_SECRET;

  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  const drizzleDb = getDb(db);
  if (!secret) return json({ success: false, error: 'Webhook secret not configured' }, { status: 500 });
  const incoming = request.headers.get('x-webhook-secret');
  if (incoming !== secret) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    task_id: string;
    printer_serial: string;
    status: string;
    progress?: number;
    layer_num?: number;
    total_layer_num?: number;
    error_code?: number;
    gcode_state?: string;
  };

  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { task_id, status, error_code, gcode_state } = body;
  if (!task_id || !status) {
    return json({ success: false, error: 'task_id and status required' }, { status: 400 });
  }

  const validStatuses = ['printing', 'success', 'failed', 'paused'];
  const safeStatus = validStatuses.includes(status) ? status : 'printing';

  // Progress/layer data was previously persisted on print_jobs — those columns
  // were removed in the schema cleanup. Live state is now read directly from
  // Pi polling (piStatusBySerial in the dashboard), so we only persist start/end
  // milestones here.

  if (safeStatus === 'success' || safeStatus === 'failed') {
    const now = Math.floor(Date.now() / 1000);
    // Don't overwrite a job the user has already confirmed (successful /
    // failed_confirmed) — only an in-flight printing job moves to awaiting.
    const failureHint =
      safeStatus === 'failed'
        ? `Pi reported: ${gcode_state ?? 'FAILED'} (error ${error_code ?? 'unknown'})`
        : null;
    await drizzleDb.run(sql`
      UPDATE print_jobs
      SET status = 'print_finished',
          failure_reason = COALESCE(${failureHint}, failure_reason),
          updated_at = ${now}
      WHERE external_task_id = ${task_id} AND status = 'printing'
    `);
  }

  return json({ success: true });
};
