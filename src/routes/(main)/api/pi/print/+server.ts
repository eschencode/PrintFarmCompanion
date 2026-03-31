import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/pi/print
 * Body: { module_id: number, printer_id: number, options?: object }
 *
 * 1. Fetches module + printer credentials from D1
 * 2. Validates both have Pi data
 * 3. Tells Pi to FTPS-upload + MQTT-command the printer
 * 4. Creates a print_jobs record with pi_task_id
 */
export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  const piUrl = platform?.env?.PI_TUNNEL_URL;

  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });
  if (!piUrl) return json({ success: false, error: 'Pi not configured (PI_TUNNEL_URL missing)' }, { status: 503 });

  let body: { module_id: number; printer_id: number; options?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { module_id, printer_id, options } = body;
  if (!module_id || !printer_id) {
    return json({ success: false, error: 'module_id and printer_id required' }, { status: 400 });
  }

  // Fetch module
  const module = await db
    .prepare('SELECT * FROM print_modules WHERE id = ?')
    .bind(module_id)
    .first() as Record<string, unknown> | null;

  if (!module) return json({ success: false, error: 'Module not found' }, { status: 404 });
  if (!module.pi_file_path) return json({ success: false, error: 'Module not stored on Pi' }, { status: 400 });

  // Fetch printer with Pi credentials
  const printer = await db
    .prepare('SELECT * FROM printers WHERE id = ?')
    .bind(printer_id)
    .first() as Record<string, unknown> | null;

  if (!printer) return json({ success: false, error: 'Printer not found' }, { status: 404 });
  if (!printer.printer_ip || !printer.printer_serial || !printer.printer_access_code) {
    return json({ success: false, error: 'Printer missing Pi credentials (IP/serial/access code)' }, { status: 400 });
  }

  // Tell Pi to start the print
  let piResult: { success: boolean; task_id?: string; error?: string };
  try {
    const piResp = await fetch(`${piUrl}/print`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        file_path: module.pi_file_path,
        printer_ip: printer.printer_ip,
        printer_serial: printer.printer_serial,
        printer_access_code: printer.printer_access_code,
        options: options ?? {},
      }),
    });
    piResult = await piResp.json() as typeof piResult;
  } catch (e) {
    return json({ success: false, error: `Pi unreachable: ${e}` }, { status: 502 });
  }

  if (!piResult.success) {
    return json({ success: false, error: piResult.error ?? 'Pi print failed' }, { status: 502 });
  }

  // Create print_jobs record
  const now = Math.floor(Date.now() / 1000);
  const jobName = `${module.name} — ${printer.name}`;
  const result = await db
    .prepare(
      `INSERT INTO print_jobs (name, module_id, printer_id, start_time, status, planned_weight, pi_task_id)
       VALUES (?, ?, ?, ?, 'printing', ?, ?)`
    )
    .bind(jobName, module_id, printer_id, now, module.expected_weight ?? 0, piResult.task_id ?? null)
    .run();

  return json({
    success: true,
    job_id: result.meta.last_row_id,
    task_id: piResult.task_id,
  });
};
