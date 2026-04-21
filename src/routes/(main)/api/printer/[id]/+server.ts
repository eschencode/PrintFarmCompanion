import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updatePrinterTransport, markPrinterBroken, markPrinterRepaired } from '$lib/server';
import type { TransportMode } from '$lib/types';

/** PATCH /api/printer/:id
 *  Handles three action shapes:
 *    { transport: TransportMode }        — update transport preference
 *    { action: 'broken', note?: string } — mark printer as broken (starts downtime event)
 *    { action: 'repaired' }              — mark printer as repaired (closes downtime event)
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

  // Broken / repaired actions
  if (body.action === 'broken') {
    await markPrinterBroken(db, id, body.note);
    return json({ success: true });
  }
  if (body.action === 'repaired') {
    await markPrinterRepaired(db, id);
    return json({ success: true });
  }

  // Transport mode update (existing behaviour)
  const { transport } = body as { transport: TransportMode };
  if (!['auto', 'direct', 'pi'].includes(transport)) {
    return json({ success: false, error: 'transport must be auto | direct | pi' }, { status: 400 });
  }

  await updatePrinterTransport(db, id, transport);
  return json({ success: true });
};
