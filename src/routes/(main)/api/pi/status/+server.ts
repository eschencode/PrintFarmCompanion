import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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
  if (db) {
    const printer = await db
      .prepare('SELECT printer_ip, printer_access_code FROM printers WHERE printer_serial = ?')
      .bind(serial)
      .first() as { printer_ip?: string; printer_access_code?: string } | null;
    printerIp = printer?.printer_ip ?? '';
    printerCode = printer?.printer_access_code ?? '';
  }

  try {
    const headers: Record<string, string> = { 'x-pi-secret': piSecret };
    if (printerIp) headers['x-printer-ip'] = printerIp;
    if (printerCode) headers['x-printer-code'] = printerCode;

    const piResp = await fetch(`${piUrl}/status/${serial}`, { headers });
    const data = await piResp.json() as Record<string, unknown>;
    return json({ pi_available: true, ...data });
  } catch (e) {
    return json({ pi_available: true, connected: false, status: null, error: `${e}` });
  }
};
