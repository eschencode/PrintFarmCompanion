import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/pi/cancel
 * Body: { printer_id: number }
 * Fetches printer credentials from D1 and tells Pi to send MQTT stop command.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  const piUrl = platform?.env?.PI_TUNNEL_URL;
  const piSecret = platform?.env?.PI_SECRET ?? '';

  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });
  if (!piUrl) return json({ success: false, error: 'Pi not configured' }, { status: 503 });

  let body: { printer_id: number };
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const printer = await db
    .prepare('SELECT * FROM printers WHERE id = ?')
    .bind(body.printer_id)
    .first() as Record<string, unknown> | null;

  if (!printer) return json({ success: false, error: 'Printer not found' }, { status: 404 });
  if (!printer.printer_ip || !printer.printer_serial || !printer.printer_access_code) {
    return json({ success: false, error: 'Printer missing Pi credentials' }, { status: 400 });
  }

  try {
    const piResp = await fetch(`${piUrl}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pi-secret': piSecret },
      body: JSON.stringify({
        printer_ip: printer.printer_ip,
        printer_serial: printer.printer_serial,
        printer_access_code: printer.printer_access_code,
      }),
    });
    const result = await piResp.json() as { success: boolean; error?: string };
    return json(result);
  } catch (e) {
    return json({ success: false, error: `Pi unreachable: ${e}` }, { status: 502 });
  }
};
