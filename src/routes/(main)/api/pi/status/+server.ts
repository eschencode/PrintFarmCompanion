import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { closeOpenPrintJobsForPrinter } from '$lib/server';

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
    const printer = await db
      .prepare('SELECT printer_ip, printer_access_code, name FROM printers WHERE printer_serial = ?')
      .bind(serial)
      .first() as { printer_ip?: string; printer_access_code?: string; name?: string } | null;
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
        const existing = await db
          .prepare('SELECT id FROM print_jobs WHERE pi_task_id = ? LIMIT 1')
          .bind(status.task_id)
          .first();

        if (!existing) {
          const printer = await db
            .prepare('SELECT id FROM printers WHERE printer_serial = ?')
            .bind(serial)
            .first() as { id: number } | null;

          if (printer) {
            const filename = (status.gcode_file ?? status.subtask_name ?? '').toString();
            const normalized = filename.split('/').pop()?.replace(/\.gcode\.3mf$/i, '').toLowerCase() ?? '';

            let matchedModule: any = null;
            if (normalized) {
              matchedModule = await db
                .prepare(
                  `SELECT id, name, expected_weight, expected_time
                   FROM print_modules
                   WHERE LOWER(pi_file_path) LIKE ?
                      OR LOWER(file_name) LIKE ?
                      OR LOWER(name) LIKE ?
                   LIMIT 1`
                )
                .bind(`%${normalized}%`, `%${normalized}%`, `%${normalized}%`)
                .first();
            }

            await closeOpenPrintJobsForPrinter(db, printer.id, matchedModule?.id ?? null);

            const now = Date.now();
            const jobName = matchedModule
              ? `${matchedModule.name} — reconciled`
              : (normalized || 'External print');
            const plannedWeight = matchedModule?.expected_weight ?? 0;
            const moduleId = matchedModule?.id ?? null;

            await db
              .prepare(
                `INSERT INTO print_jobs (name, module_id, printer_id, start_time, status, planned_weight, pi_task_id, progress, layer_num, total_layer_num)
                 VALUES (?, ?, ?, ?, 'printing', ?, ?, ?, ?, ?)`
              )
              .bind(
                jobName,
                moduleId,
                printer.id,
                now,
                plannedWeight,
                status.task_id,
                status.progress ?? 0,
                status.layer_num ?? 0,
                status.total_layer_num ?? 0
              )
              .run();

            await db
              .prepare('UPDATE printers SET status = ? WHERE id = ?')
              .bind('printing', printer.id)
              .run();

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
