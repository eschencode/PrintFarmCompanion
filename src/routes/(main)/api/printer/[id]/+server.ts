import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updatePrinterTransport, setPrinterBroken, setPrinterRepaired } from '$lib/server';
import { requireCtx } from '$lib/server/context';
import type { TransportMode } from '$lib/types';

/** PATCH /api/printer/:id
 *  Handles three action shapes:
 *    { transport: TransportMode }                            — update transport preference
 *    { action: 'broken', reason?: string, hmsCode?: string } — deactivate + record why
 *    { action: 'repaired' }                                  — reactivate, clear breakage
 */
export const PATCH: RequestHandler = async ({ params, request, platform, locals }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });
  const ctx = requireCtx(locals);

  const id = Number(params.id);
  if (!id) return json({ success: false, error: 'Invalid printer id' }, { status: 400 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.action === 'broken') {
    await setPrinterBroken(ctx, id, {
      reason: typeof body.reason === 'string' ? body.reason : null,
      hmsCode: typeof body.hmsCode === 'string' ? body.hmsCode : null,
    });
    return json({ success: true });
  }
  if (body.action === 'repaired') {
    await setPrinterRepaired(ctx, id);
    return json({ success: true });
  }

  const { transport } = body as { transport: TransportMode };
  if (!['auto', 'direct', 'pi'].includes(transport)) {
    return json({ success: false, error: 'transport must be auto | direct | pi' }, { status: 400 });
  }

  await updatePrinterTransport(ctx, id, transport);
  return json({ success: true });
};
