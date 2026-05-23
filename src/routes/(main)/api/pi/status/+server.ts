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
                SELECT id, name, weight, expected_time_minutes
                FROM print_modules
                WHERE LOWER(filename) LIKE ${`%${normalized}%`}
                   OR LOWER(name)     LIKE ${`%${normalized}%`}
                LIMIT 1
              `);
            }

            await closeOpenPrintJobsForPrinter(db, printer.id, matchedModule?.id ?? null);

            // print_jobs.start_time is stored as Unix seconds (schema mode: 'timestamp')
            const nowSec = Math.floor(Date.now() / 1000);
            const moduleId = matchedModule?.id ?? null;

            await drizzleDb.run(sql`
              INSERT INTO print_jobs (module_id, printer_id, start_time, status, external_task_id, created_at, updated_at)
              VALUES (${moduleId}, ${printer.id}, ${nowSec}, 'printing', ${status.task_id}, ${nowSec}, ${nowSec})
            `);

            // printers.status was removed — status is now derived from active print_jobs.

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
