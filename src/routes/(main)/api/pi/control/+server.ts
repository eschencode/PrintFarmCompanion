import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

/**
 * POST /api/pi/control
 * Body: { printer_id: number, action: 'pause' | 'resume' | 'cancel' }
 * Looks up printer creds from printer_secrets and tells the Pi to publish the
 * corresponding MQTT command. Replaces the old cancel/pause/resume routes, which
 * read creds off the printers row (columns since moved to printer_secrets).
 */
const ACTIONS = ['pause', 'resume', 'cancel'] as const;
type Action = (typeof ACTIONS)[number];

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  const piUrl = platform?.env?.PI_TUNNEL_URL;
  const piSecret = platform?.env?.PI_SECRET ?? '';

  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });
  if (!piUrl) return json({ success: false, error: 'Pi not configured' }, { status: 503 });

  let body: { printer_id: number; action: Action };
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!ACTIONS.includes(body.action)) {
    return json({ success: false, error: 'Invalid action' }, { status: 400 });
  }

  const drizzleDb = getDb(db);
  const printer = await drizzleDb.get<{ printer_ip?: string; serial?: string; access_code?: string }>(
    sql`SELECT ps.printer_ip, ps.serial, ps.access_code
        FROM printers p
        JOIN printer_secrets ps ON p.id = ps.printer_id
        WHERE p.id = ${body.printer_id}`
  );

  if (!printer) return json({ success: false, error: 'Printer not found' }, { status: 404 });
  if (!printer.printer_ip || !printer.serial || !printer.access_code) {
    return json({ success: false, error: 'Printer missing Pi credentials' }, { status: 400 });
  }

  try {
    const piResp = await fetch(`${piUrl}/${body.action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pi-secret': piSecret },
      body: JSON.stringify({
        printer_ip: printer.printer_ip,
        printer_serial: printer.serial,
        printer_access_code: printer.access_code,
      }),
    });
    const result = await piResp.json() as { success: boolean; error?: string };

    // Stamp the active job so the incoming webhook doesn't overwrite with a generic MQTT error
    if (body.action === 'cancel' && result.success) {
      await drizzleDb.run(sql`
        UPDATE print_jobs
        SET failure_reason = 'Cancelled by user'
        WHERE printer_id = ${body.printer_id} AND status = 'printing'
      `);
    }

    return json(result);
  } catch (e) {
    return json({ success: false, error: `Pi unreachable: ${e}` }, { status: 502 });
  }
};
