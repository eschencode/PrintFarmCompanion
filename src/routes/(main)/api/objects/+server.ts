import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createObject, getAllObjects } from '$lib/inventory_handler';

export const GET: RequestHandler = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });
  const objects = await getAllObjects(db);
  return json({ success: true, data: objects });
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  let body: { name?: string; category?: string; min_threshold?: number };
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return json({ success: false, error: 'name is required' }, { status: 400 });

  const result = await createObject(db, {
    name,
    minThreshold: body.min_threshold ?? 0,
    category: body.category?.trim() || null,
  });

  if (!result.success) return json({ success: false, error: result.error }, { status: 409 });
  return json({ success: true, data: { id: (result.data as any)?.id, name } });
};
