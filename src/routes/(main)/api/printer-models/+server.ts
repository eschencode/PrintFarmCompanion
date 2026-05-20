import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

export const GET: RequestHandler = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  try {
    const drizzleDb = getDb(db);
    const rows = await drizzleDb.all(sql`
      SELECT id, brand || ' ' || model as name, brand, model, dimension_x, dimension_y, dimension_z
      FROM printer_presets ORDER BY brand, model
    `);

    return json({ success: true, data: rows ?? [] });
  } catch (e) {
    console.error('Failed to fetch printer models:', e);
    return json({ success: false, error: 'Failed to fetch printer models' }, { status: 500 });
  }
};
