import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  try {
    const result = await db.prepare(`
      SELECT id, name, description FROM printer_models ORDER BY name
    `).all();

    return json({ success: true, data: result.results ?? [] });
  } catch (e) {
    console.error('Failed to fetch printer models:', e);
    return json({ success: false, error: 'Failed to fetch printer models' }, { status: 500 });
  }
};
