import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
  const piUrl = platform?.env?.PI_TUNNEL_URL;
  const piSecret = platform?.env?.PI_SECRET ?? '';

  if (!piUrl) return json({ printers: [] });

  try {
    const resp = await fetch(`${piUrl}/logs/printers`, {
      headers: { 'x-pi-secret': piSecret },
    });
    return json(await resp.json());
  } catch (e) {
    return json({ printers: [], error: `Pi unreachable: ${e}` });
  }
};
