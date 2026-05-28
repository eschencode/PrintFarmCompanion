import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { linkExternalTaskToOpenJob } from '$lib/server';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

/**
 * GET /api/pi/status?serial=SERIALNUMBER
 * Proxies to the Pi's /status/{serial} endpoint.
 * Passes printer credentials as headers so Pi can auto-register after restart.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB;
  const piUrl = platform?.env?.PI_TUNNEL_URL;
  const piSecret = platform?.env?.PI_SECRET ?? '';

  if (!piUrl) {
    return json({ pi_available: false, connected: false, status: null });
  }

  const serial = url.searchParams.get('serial');
  if (!serial || !/^[A-Z0-9]{5,20}$/.test(serial)) {
    return json({ error: 'invalid serial' }, { status: 400 });
  }

  // Look up credentials so Pi can auto-register + pushall after a restart.
  // ip / access_code now live on printer_secrets (joined by printer_id).
  let printerIp = '';
  let printerCode = '';
  let printerName = '';
  if (db) {
    const drizzleDb = getDb(db);
    const printer = await drizzleDb.get<{ printer_ip?: string; access_code?: string; name?: string }>(
      sql`SELECT ps.printer_ip, ps.access_code, p.name
          FROM printers p
          JOIN printer_secrets ps ON p.id = ps.printer_id
          WHERE ps.serial = ${serial}`
    );
    printerIp = printer?.printer_ip ?? '';
    printerCode = printer?.access_code ?? '';
    printerName = printer?.name ?? '';
  }

  try {
    const headers: Record<string, string> = { 'x-pi-secret': piSecret };
    if (printerIp) headers['x-printer-ip'] = printerIp;
    if (printerCode) headers['x-printer-code'] = printerCode;
    if (printerName) headers['x-printer-name'] = printerName;

    const piResp = await fetch(`${piUrl}/status/${serial}`, { headers });
    const data = await piResp.json() as Record<string, any>;

    // ── External-print detection (read-only; never marks anything failed).
    // If the Pi reports a task we aren't tracking, first try to adopt an open
    // UI-started job (backfill its task_id). If there's no open job, surface it
    // as `detected_external` so the UI can ask the user whether to add it.
    const status = data.status;
    if (db && status?.task_id && ['RUNNING', 'PREPARE', 'PAUSE'].includes(status.gcode_state)) {
      try {
        const drizzleDb = getDb(db);
        const tracked = await drizzleDb.get(
          sql`SELECT id FROM print_jobs WHERE external_task_id = ${status.task_id} LIMIT 1`
        );

        if (!tracked) {
          const printer = await drizzleDb.get<{ id: number }>(
            sql`SELECT p.id FROM printers p JOIN printer_secrets ps ON p.id = ps.printer_id WHERE ps.serial = ${serial}`
          );

          if (printer) {
            const linked = await linkExternalTaskToOpenJob(db, printer.id, status.task_id);

            if (!linked) {
              const filename = (status.gcode_file ?? status.subtask_name ?? '').toString();
              const normalized = filename.split('/').pop()?.replace(/\.gcode\.3mf$/i, '').toLowerCase() ?? '';

              let matchedModule: { id: number; name: string } | null = null;
              if (normalized) {
                matchedModule = await drizzleDb.get(sql`
                  SELECT id, name FROM print_modules
                  WHERE LOWER(filename) LIKE ${`%${normalized}%`}
                     OR LOWER(name)     LIKE ${`%${normalized}%`}
                  LIMIT 1
                `) ?? null;
              }

              data.detected_external = {
                printer_id: printer.id,
                task_id: status.task_id,
                gcode_file: filename || null,
                suggested_module_id: matchedModule?.id ?? null,
                suggested_module_name: matchedModule?.name ?? null,
              };
            }
          }
        }
      } catch (e) {
        console.error('[pi/status] external detection failed:', e);
      }
    }

    return json({ pi_available: true, ...data });
  } catch (e) {
    return json({ pi_available: true, connected: false, status: null, error: `${e}` });
  }
};
