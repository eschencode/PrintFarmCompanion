import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireCtx } from '$lib/server/context';
import { getPiConfig } from '$lib/server/pi';

export const GET: RequestHandler = async ({ locals }) => {
  const ctx = requireCtx(locals);
  const piConfig = await getPiConfig(ctx);

  if (!piConfig) return json({ printers: [] });

  try {
    const resp = await fetch(`${piConfig.tunnelUrl}/logs/printers`, {
      headers: { 'x-pi-secret': piConfig.piSecret },
    });
    return json(await resp.json());
  } catch (e) {
    return json({ printers: [], error: `Pi unreachable: ${e}` });
  }
};
