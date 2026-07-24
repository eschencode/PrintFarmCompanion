import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireCtx } from '$lib/server/context';
import { getPiConfig } from '$lib/server/pi';

export const GET: RequestHandler = async ({ url, locals }) => {
  const ctx = requireCtx(locals);
  const piConfig = await getPiConfig(ctx);

  if (!piConfig) return json({ entries: [], error: 'Pi not configured for this workspace' });

  const params = new URLSearchParams();
  for (const [key, val] of url.searchParams.entries()) {
    params.set(key, val);
  }

  try {
    const resp = await fetch(`${piConfig.tunnelUrl}/logs?${params}`, {
      headers: { 'x-pi-secret': piConfig.piSecret },
    });
    return json(await resp.json());
  } catch (e) {
    return json({ entries: [], error: `Pi unreachable: ${e}` });
  }
};
