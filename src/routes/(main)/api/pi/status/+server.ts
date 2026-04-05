import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/pi/status?serial=SERIALNUMBER
 * Proxies to the Pi's /status/{serial} endpoint.
 * Used for live polling from the modules/dashboard page.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
  const piUrl = platform?.env?.PI_TUNNEL_URL;
  const piSecret = platform?.env?.PI_SECRET ?? '';

  if (!piUrl) {
    return json({ pi_available: false, connected: false, status: null });
  }

  const serial = url.searchParams.get('serial');
  if (!serial || !/^[A-Z0-9]{5,20}$/.test(serial)) {
    return json({ error: 'invalid serial' }, { status: 400 });
  }

  try {
    const piResp = await fetch(`${piUrl}/status/${serial}`, {
      headers: { 'x-pi-secret': piSecret },
    });
    const data = await piResp.json() as Record<string, unknown>;
    return json({ pi_available: true, ...data });
  } catch (e) {
    return json({ pi_available: true, connected: false, status: null, error: `${e}` });
  }
};
