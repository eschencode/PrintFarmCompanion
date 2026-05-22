import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  const drizzleDb = getDb(db);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    name, file_name, thumbnail,
    estimated_time, nozzle_diameter,
    expected_weight, default_spool_preset_id,
    objects_per_print, object_id, printer_preset_id,
    local_file_handler_path, pi_file_path,
    plate_preset_id,
  } = body;

  if (!name || !file_name) {
    return json({ success: false, error: 'name and file_name are required' }, { status: 400 });
  }

  const resolvedObjectId = (object_id as number | null) ?? null;
  const resolvedPresetId = (printer_preset_id as number | null) ?? null;

  const filename = (pi_file_path as string) || (local_file_handler_path as string) || (file_name as string);
  const now = Math.floor(Date.now() / 1000);

  try {
    const result = await drizzleDb.run(sql`
      INSERT INTO print_modules
        (name, filename, thumbnail, weight, expected_time_minutes, objects_per_print,
         nozzle_diameter, object_id, printer_preset_id, active, created_at, updated_at)
      VALUES (
        ${name}, ${filename}, ${thumbnail ?? null},
        ${expected_weight ?? 0}, ${estimated_time ?? 0}, ${objects_per_print ?? 1},
        ${nozzle_diameter ?? null}, ${resolvedObjectId}, ${resolvedPresetId},
        1, ${now}, ${now}
      )
    `);

    const moduleId = result.meta.last_row_id as number;

    // Save slot 0 spool preset if provided
    if (default_spool_preset_id && moduleId) {
      await drizzleDb.run(sql`
        INSERT OR REPLACE INTO module_filament_slots (module_id, slot_index, spool_preset_id)
        VALUES (${moduleId}, 0, ${default_spool_preset_id})
      `);
    }

    return json({ success: true, data: { id: moduleId, name } });
  } catch (e) {
    console.error('Failed to insert print module:', e);
    return json({ success: false, error: 'Failed to save module' }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ platform, url }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  const drizzleDb = getDb(db);

  if (url.searchParams.get('presets') === 'true') {
    try {
      const result = await drizzleDb.all(sql`
        SELECT id, brand, material, color, default_weight, cost, in_storage
        FROM spool_presets
        ORDER BY brand, color
      `);
      return json({ success: true, data: result ?? [] });
    } catch (e) {
      console.error('Failed to fetch spool presets:', e);
      return json({ success: false, error: 'Failed to fetch presets' }, { status: 500 });
    }
  }

  try {
    const result = await drizzleDb.all(sql`
      SELECT pm.*,
             pp.brand || ' ' || pp.model as printer_model_name,
             mfs.spool_preset_id as default_spool_preset_id,
             sp.material as spool_preset_material, sp.color as spool_preset_color, sp.brand as spool_preset_brand,
             o.id as object_id, o.name as object_name
      FROM print_modules pm
      LEFT JOIN printer_presets pp ON pm.printer_preset_id = pp.id
      LEFT JOIN module_filament_slots mfs ON pm.id = mfs.module_id AND mfs.slot_index = 0
      LEFT JOIN spool_presets sp ON mfs.spool_preset_id = sp.id
      LEFT JOIN objects o ON pm.object_id = o.id
      ORDER BY pm.id DESC
    `);
    return json({ success: true, data: result ?? [] });
  } catch (e) {
    console.error('Failed to fetch print modules:', e);
    return json({ success: false, error: 'Failed to fetch modules' }, { status: 500 });
  }
};

export const PATCH: RequestHandler = async ({ url, request, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  const drizzleDb = getDb(db);
  const id = url.searchParams.get('id');
  if (!id) return json({ success: false, error: 'id is required' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if ('active' in body) {
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`UPDATE print_modules SET active = ${body.active ? 1 : 0}, updated_at = ${now} WHERE id = ${id}`);
    return json({ success: true });
  }

  const {
    name, estimated_time, nozzle_diameter, expected_weight,
    default_spool_preset_id, objects_per_print, object_id,
    printer_preset_id, plate_preset_id,
  } = body;

  if (!name) return json({ success: false, error: 'name is required' }, { status: 400 });

  const resolvedObjectId = (object_id as number | null) ?? null;
  const resolvedPresetId = (printer_preset_id as number | null) ?? null;
  const now = Math.floor(Date.now() / 1000);

  try {
    await drizzleDb.run(sql`
      UPDATE print_modules SET
        name = ${name},
        expected_time_minutes = ${estimated_time ?? null},
        nozzle_diameter = ${nozzle_diameter ?? null},
        weight = ${expected_weight ?? null},
        objects_per_print = ${objects_per_print ?? 1},
        object_id = ${resolvedObjectId},
        printer_preset_id = ${resolvedPresetId},
        updated_at = ${now}
      WHERE id = ${id}
    `);

    if (default_spool_preset_id !== undefined) {
      if (default_spool_preset_id) {
        await drizzleDb.run(sql`
          INSERT OR REPLACE INTO module_filament_slots (module_id, slot_index, spool_preset_id)
          VALUES (${id}, 0, ${default_spool_preset_id})
        `);
      } else {
        await drizzleDb.run(sql`DELETE FROM module_filament_slots WHERE module_id = ${id} AND slot_index = 0`);
      }
    }

    return json({ success: true });
  } catch (e) {
    console.error('Failed to update print module:', e);
    return json({ success: false, error: 'Failed to update module' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  const drizzleDb = getDb(db);
  const id = url.searchParams.get('id');
  if (!id) return json({ success: false, error: 'id is required' }, { status: 400 });

  try {
    const module = await drizzleDb.get<{ filename: string | null }>(
      sql`SELECT filename FROM print_modules WHERE id = ${id}`
    );

    const piUrl = platform?.env?.PI_TUNNEL_URL;
    const piSecret = (platform?.env?.PI_SECRET as string | undefined) ?? '';
    if (module?.filename && piUrl) {
      try {
        await fetch(`${piUrl}/file`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json', 'x-pi-secret': piSecret },
          body: JSON.stringify({ file_path: module.filename }),
        });
      } catch (e) {
        console.warn('[pi/delete-file] Pi unreachable, skipping file cleanup:', e);
      }
    }

    await drizzleDb.run(sql`UPDATE print_jobs SET module_id = NULL WHERE module_id = ${id}`);
    await drizzleDb.run(sql`DELETE FROM module_filament_slots WHERE module_id = ${id}`);
    await drizzleDb.run(sql`DELETE FROM print_modules WHERE id = ${id}`);

    return json({ success: true, local_file_handler_path: module?.filename ?? null });
  } catch (e) {
    console.error('Failed to delete print module:', e);
    return json({ success: false, error: 'Failed to delete module' }, { status: 500 });
  }
};
