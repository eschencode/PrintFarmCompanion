import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { closeOpenPrintJobsForPrinter } from '$lib/server';
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

  // Look up credentials so Pi can auto-register + pushall after a restart
  let printerIp = '';
  let printerCode = '';
  let printerName = '';
  if (db) {
    const drizzleDb = getDb(db);
    const printer = await drizzleDb.get<{ printer_ip?: string; printer_access_code?: string; name?: string }>(
      sql`SELECT printer_ip, printer_access_code, name FROM printers WHERE printer_serial = ${serial}`
    );
    printerIp = printer?.printer_ip ?? '';
    printerCode = printer?.printer_access_code ?? '';
    printerName = printer?.name ?? '';
  }

  try {
    const headers: Record<string, string> = { 'x-pi-secret': piSecret };
    if (printerIp) headers['x-printer-ip'] = printerIp;
    if (printerCode) headers['x-printer-code'] = printerCode;
    if (printerName) headers['x-printer-name'] = printerName;

    const piResp = await fetch(`${piUrl}/status/${serial}`, { headers });
    const data = await piResp.json() as Record<string, any>;

    // ── Reconciliation: if Pi reports the printer actively printing but we
    // have no matching print_jobs row, create one (idempotent on pi_task_id).
    // This covers: externally started prints, in-flight Pi API failures that
    // left no DB record, and manual SD card / touchscreen starts.
    const status = data.status;
    if (db && status && status.task_id && ['RUNNING', 'PREPARE', 'PAUSE'].includes(status.gcode_state)) {
      try {
        const drizzleDb = getDb(db);
        const existing = await drizzleDb.get(
          sql`SELECT id FROM print_jobs WHERE external_task_id = ${status.task_id} LIMIT 1`
        );

        if (!existing) {
          const printer = await drizzleDb.get<{ id: number }>(
            sql`SELECT p.id FROM printers p JOIN printer_secrets ps ON p.id = ps.printer_id WHERE ps.serial = ${serial}`
          );

          if (printer) {
            const filename = (status.gcode_file ?? status.subtask_name ?? '').toString();
            const normalized = filename.split('/').pop()?.replace(/\.gcode\.3mf$/i, '').toLowerCase() ?? '';

            let matchedModule: any = null;
            if (normalized) {
              matchedModule = await drizzleDb.get(sql`
                SELECT id, name, expected_weight, expected_time
                FROM print_modules
                WHERE LOWER(pi_file_path) LIKE ${`%${normalized}%`}
                   OR LOWER(file_name) LIKE ${`%${normalized}%`}
                   OR LOWER(name) LIKE ${`%${normalized}%`}
                LIMIT 1
              `);
            }

            await closeOpenPrintJobsForPrinter(db, printer.id, matchedModule?.id ?? null);

            const now = Date.now();
            const jobName = matchedModule
              ? `${matchedModule.name} — reconciled`
              : (normalized || 'External print');
            const plannedWeight = matchedModule?.expected_weight ?? 0;
            const moduleId = matchedModule?.id ?? null;

            await drizzleDb.run(sql`
              INSERT INTO print_jobs (module_id, printer_id, start_time, status, external_task_id, created_at, updated_at)
              VALUES (${moduleId}, ${printer.id}, ${now}, 'printing', ${status.task_id}, ${now}, ${now})
            `);

            await drizzleDb.run(sql`UPDATE printers SET status = 'printing' WHERE id = ${printer.id}`);

            data.reconciled = {
              module_id: moduleId,
              module_name: matchedModule?.name ?? null,
              matched: !!matchedModule,
            };
          }
        }
      } catch (e) {
        console.error('[pi/status] reconciliation failed:', e);
      }
    }

    return json({ pi_available: true, ...data });
  } catch (e) {
    return json({ pi_available: true, connected: false, status: null, error: `${e}` });
  }
};
