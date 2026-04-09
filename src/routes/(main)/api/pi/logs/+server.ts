import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform }) => {
  const piUrl = platform?.env?.PI_TUNNEL_URL;
  const piSecret = platform?.env?.PI_SECRET ?? '';

  if (!piUrl) return json({ entries: [], error: 'Pi not configured' });

  const params = new URLSearchParams();
  for (const [key, val] of url.searchParams.entries()) {
    params.set(key, val);
  }

  try {
    const resp = await fetch(`${piUrl}/logs?${params}`, {
      headers: { 'x-pi-secret': piSecret },
    });
    return json(await resp.json());
  } catch (e) {
    return json({ entries: [], error: `Pi unreachable: ${e}` });
  }
};
