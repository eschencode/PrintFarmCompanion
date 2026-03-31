import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/pi/webhook
 * Called by the Pi when a printer's MQTT status changes.
 * Updates the corresponding print_jobs record in D1.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  const secret = platform?.env?.PI_WEBHOOK_SECRET;

  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  // Validate shared secret
  if (secret) {
    const incoming = request.headers.get('x-webhook-secret');
    if (incoming !== secret) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
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

  const { task_id, status, error_code } = body;
  if (!task_id || !status) {
    return json({ success: false, error: 'task_id and status required' }, { status: 400 });
  }

  // Map to our status values
  const validStatuses = ['printing', 'success', 'failed', 'paused'];
  const safeStatus = validStatuses.includes(status) ? status : 'printing';

  const now = Math.floor(Date.now() / 1000);
  const isTerminal = safeStatus === 'success' || safeStatus === 'failed';

  await db
    .prepare(
      `UPDATE print_jobs SET
         status = ?,
         failure_reason = ?,
         end_time = ?
       WHERE pi_task_id = ?`
    )
    .bind(
      safeStatus,
      safeStatus === 'failed' ? `Error code: ${error_code ?? 'unknown'}` : null,
      isTerminal ? now : null,
      task_id
    )
    .run();

  return json({ success: true });
};
