import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/pi/upload
 * Streams a .gcode.3mf file from the browser to the Pi via Cloudflare Tunnel.
 * On success, the caller should include pi_file_path in the subsequent module save.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
  const piUrl = platform?.env?.PI_TUNNEL_URL;
  const piSecret = platform?.env?.PI_SECRET ?? '';

  if (!piUrl) {
    return json({ success: false, pi_available: false, error: 'Pi not configured' }, { status: 200 });
  }

  // Forward the multipart body directly to the Pi
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return json({ success: false, error: 'Expected multipart/form-data' }, { status: 400 });
  }

  try {
    const piResponse = await fetch(`${piUrl}/upload`, {
      method: 'POST',
      headers: { 'content-type': contentType, 'x-pi-secret': piSecret },
      body: request.body,
      // @ts-expect-error - Cloudflare Workers supports duplex streaming
      duplex: 'half',
    });

    if (!piResponse.ok) {
      const text = await piResponse.text();
      return json({ success: false, error: `Pi error: ${text}` }, { status: 502 });
    }

    const result = await piResponse.json() as { path: string; filename: string; size: number };
    return json({ success: true, pi_available: true, ...result });
  } catch (e) {
    console.error('[pi/upload] Failed to reach Pi:', e);
    return json({ success: false, pi_available: true, error: `Pi unreachable: ${e}` }, { status: 502 });
  }
};
