import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { closeOpenPrintJobsForPrinter, getLoadedSpools } from '$lib/server';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

/**
 * POST /api/pi/print
 * Body: { module_id: number, printer_id: number, options?: object }
 *
 * 1. Fetches module + printer secrets from D1
 * 2. Validates Pi credentials exist
 * 3. Tells Pi to FTPS-upload + MQTT-command the printer
 * 4. Creates a print_jobs record with external_task_id
 */
export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  const piUrl = platform?.env?.PI_TUNNEL_URL;
  const piSecret = platform?.env?.PI_SECRET ?? '';

  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });
  if (!piUrl) return json({ success: false, error: 'Pi not configured (PI_TUNNEL_URL missing)' }, { status: 503 });

  const drizzleDb = getDb(db);
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

  const module = await drizzleDb.get(
    sql`SELECT * FROM print_modules WHERE id = ${module_id}`
  ) as Record<string, unknown> | null;

  if (!module) return json({ success: false, error: 'Module not found' }, { status: 404 });
  if (!module.filename) return json({ success: false, error: 'Module has no filename stored' }, { status: 400 });

  // Fetch printer + secrets
  const printerRow = await drizzleDb.get(sql`
    SELECT p.id, p.name, p.printer_preset_id,
           ps.printer_ip, ps.serial, ps.access_code
    FROM printers p
    LEFT JOIN printer_secrets ps ON p.id = ps.printer_id
    WHERE p.id = ${printer_id}
  `) as Record<string, unknown> | null;

  if (!printerRow) return json({ success: false, error: 'Printer not found' }, { status: 404 });
  if (!printerRow.printer_ip || !printerRow.serial || !printerRow.access_code) {
    return json({ success: false, error: 'Printer missing Pi credentials (IP/serial/access code)' }, { status: 400 });
  }

  let piResult: { success: boolean; task_id?: string; error?: string };
  try {
    const piResp = await fetch(`${piUrl}/print`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pi-secret': piSecret },
      body: JSON.stringify({
        file_path: module.filename,
        printer_ip: printerRow.printer_ip,
        printer_serial: printerRow.serial,
        printer_access_code: printerRow.access_code,
        printer_name: printerRow.name,
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

  await closeOpenPrintJobsForPrinter(db, printer_id, module_id);

  const now = Math.floor(Date.now() / 1000);
  const result = await drizzleDb.run(sql`
    INSERT INTO print_jobs (module_id, printer_id, start_time, status, external_task_id, created_at, updated_at)
    VALUES (${module_id}, ${printer_id}, ${now}, 'printing', ${piResult.task_id ?? null}, ${now}, ${now})
  `);
  const jobId = result.meta.last_row_id as number;

  // Snapshot loaded spools → print_job_spools (one row per slot) so completion
  // can deduct used weight from the physical spools. Mirrors startPrintJob.
  const loadedSlots = await getLoadedSpools(db, printer_id);
  for (const slot of loadedSlots) {
    const s = slot as unknown as { slot_index: number; spool_id: number | null };
    await drizzleDb.run(sql`
      INSERT INTO print_job_spools (print_job_id, slot_index, spool_id, used_weight)
      VALUES (${jobId}, ${s.slot_index}, ${s.spool_id ?? null}, NULL)
    `);
  }

  return json({
    success: true,
    job_id: jobId,
    task_id: piResult.task_id,
  });
};
