import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { completePrintJob } from '$lib/server';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

/**
 * POST /api/pi/webhook
 * Called by the Pi when a printer's MQTT status changes.
 * - Stores progress/layer data on every update
 * - On "success": auto-completes the job (spool deduction, inventory, printer reset)
 * - On "failed": auto-fails the job (failure reason recorded)
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
    const job = await drizzleDb.get(sql`
      SELECT pj.id, pj.printer_id, pj.module_id, pj.failure_reason,
             pm.weight as module_weight
      FROM print_jobs pj
      LEFT JOIN print_modules pm ON pj.module_id = pm.id
      WHERE pj.external_task_id = ${task_id}
    `) as {
        id: number;
        printer_id: number;
        module_id: number;
        failure_reason: string | null;
        module_weight: number | null;
      } | null;

    if (job) {
      const isSuccess = safeStatus === 'success';
      const failureReason = isSuccess
        ? null
        : (job.failure_reason ?? `Pi reported: ${gcode_state ?? 'FAILED'} (error ${error_code ?? 'unknown'})`);
      const actualWeight = isSuccess ? (job.module_weight ?? 0) : 0;

      // completePrintJob handles spool deduction and inventory update
      await completePrintJob(db, job.id, isSuccess, isSuccess ? { 0: actualWeight } : {}, failureReason);
    }
  }

  return json({ success: true });
};
