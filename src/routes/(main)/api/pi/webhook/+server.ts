import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  completePrintJob,
  updatePrinterStatus,
  getSpoolById,
  updateSpoolWeight,
  updatePrinterHours,
  markSuggestedQueueItemDone,
} from '$lib/server';

/**
 * POST /api/pi/webhook
 * Called by the Pi when a printer's MQTT status changes.
 * - Stores progress/layer data on every update
 * - On "success": auto-completes the job (spool deduction, inventory, printer reset)
 * - On "failed": auto-fails the job (printer reset, failure reason recorded)
 * Manual "Print Successful" / "Print Failed" buttons still work as overrides.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  const secret = platform?.env?.PI_WEBHOOK_SECRET;

  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  // Validate shared secret — must be configured
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

  const { task_id, status, progress, layer_num, total_layer_num, error_code, gcode_state } = body;
  if (!task_id || !status) {
    return json({ success: false, error: 'task_id and status required' }, { status: 400 });
  }

  const validStatuses = ['printing', 'success', 'failed', 'paused'];
  const safeStatus = validStatuses.includes(status) ? status : 'printing';

  // Always store latest progress/layer data
  await db
    .prepare(
      `UPDATE print_jobs SET
         progress = COALESCE(?, progress),
         layer_num = COALESCE(?, layer_num),
         total_layer_num = COALESCE(?, total_layer_num)
       WHERE pi_task_id = ?`
    )
    .bind(progress ?? null, layer_num ?? null, total_layer_num ?? null, task_id)
    .run();

  if (safeStatus === 'success' || safeStatus === 'failed') {
    // Look up the full job record by pi_task_id
    const job = await db
      .prepare(
        `SELECT pj.id, pj.printer_id, pj.module_id, pj.planned_weight, pj.start_time,
                pj.failure_reason,
                pm.expected_time,
                p.loaded_spool_id as printer_loaded_spool_id
         FROM print_jobs pj
         LEFT JOIN printers p ON pj.printer_id = p.id
         LEFT JOIN print_modules pm ON pj.module_id = pm.id
         WHERE pj.pi_task_id = ?`
      )
      .bind(task_id)
      .first() as {
        id: number;
        printer_id: number;
        module_id: number;
        planned_weight: number;
        start_time: number;
        failure_reason: string | null;
        expected_time: number | null;
        printer_loaded_spool_id: number | null;
      } | null;

    if (job) {
      const now = Date.now();
      const isSuccess = safeStatus === 'success';
      // Preserve a reason already set (e.g. 'Cancelled by user') — don't overwrite with generic MQTT message
      const failureReason = isSuccess
        ? null
        : (job.failure_reason ?? `Pi reported: ${gcode_state ?? 'FAILED'} (error ${error_code ?? 'unknown'})`);
      const actualWeight = isSuccess ? (job.planned_weight ?? 0) : 0;

      // Complete the print job record (handles inventory auto-add on success)
      await completePrintJob(db, job.id, now, isSuccess, actualWeight, failureReason);

      // Reset printer to idle
      if (job.printer_id) {
        await updatePrinterStatus(db, job.printer_id, 'IDLE');
      }

      // Deduct spool weight on success
      if (isSuccess && actualWeight > 0 && job.printer_loaded_spool_id) {
        const spool = await getSpoolById(db, job.printer_loaded_spool_id);
        if (spool) {
          await updateSpoolWeight(db, job.printer_loaded_spool_id, spool.remaining_weight - actualWeight);
        }
      }

      // Update printer hours on success
      if (isSuccess && job.printer_id && job.expected_time) {
        await updatePrinterHours(db, job.printer_id, job.expected_time / 60);
      }

      // Mark suggested queue item done on success
      if (isSuccess && job.printer_id && job.module_id) {
        await markSuggestedQueueItemDone(db, job.printer_id, { module_id: job.module_id });
      }
    }
  }

  return json({ success: true });
};
