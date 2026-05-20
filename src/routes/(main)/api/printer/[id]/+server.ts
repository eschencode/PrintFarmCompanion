import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updatePrinterTransport, setPrinterActive } from '$lib/server';
import type { TransportMode } from '$lib/types';

/** PATCH /api/printer/:id
 *  Handles three action shapes:
 *    { transport: TransportMode }        — update transport preference
 *    { action: 'broken', note?: string } — deactivate printer
 *    { action: 'repaired' }              — reactivate printer
 */
export const PATCH: RequestHandler = async ({ params, request, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  const id = Number(params.id);
  if (!id) return json({ success: false, error: 'Invalid printer id' }, { status: 400 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.action === 'broken') {
    await setPrinterActive(db, id, false);
    return json({ success: true });
  }
  if (body.action === 'repaired') {
    await setPrinterActive(db, id, true);
    return json({ success: true });
  }

  const { transport } = body as { transport: TransportMode };
  if (!['auto', 'direct', 'pi'].includes(transport)) {
    return json({ success: false, error: 'transport must be auto | direct | pi' }, { status: 400 });
  }

  await updatePrinterTransport(db, id, transport);
  return json({ success: true });
};
