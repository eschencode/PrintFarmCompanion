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
    filament_type, filament_color,
    estimated_time, plate_type, nozzle_diameter,
    expected_weight, default_spool_preset_id,
    objects_per_print, inventory_slug, printer_model,
    local_file_handler_path,
    pi_file_path, file_stored_on_pi,
  } = body;

  if (!name || !file_name) {
    return json({ success: false, error: 'name and file_name are required' }, { status: 400 });
  }

  try {
    const result = await drizzleDb.run(sql`
      INSERT INTO print_modules
        (name, file_name, thumbnail, filament_type, filament_color, expected_time, plate_type,
         nozzle_diameter, expected_weight, default_spool_preset_id, objects_per_print,
         inventory_slug, printer_model, local_file_handler_path, pi_file_path, file_stored_on_pi,
         path)
      VALUES (${name}, ${file_name}, ${thumbnail ?? null}, ${filament_type ?? null}, ${filament_color ?? null}, ${estimated_time ?? null}, ${plate_type ?? null}, ${nozzle_diameter ?? null}, ${expected_weight ?? 0}, ${default_spool_preset_id ?? null}, ${objects_per_print ?? 1}, ${inventory_slug ?? null}, ${printer_model ?? null}, ${local_file_handler_path ?? null}, ${pi_file_path ?? null}, ${file_stored_on_pi ?? 0}, ${local_file_handler_path ?? ''})
    `);

    return json({ success: true, data: { id: result.meta.last_row_id, name } });
  } catch (e) {
    console.error('Failed to insert print module:', e);
    return json({ success: false, error: 'Failed to save module' }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ platform, url }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Database not available' }, { status: 500 });

  const drizzleDb = getDb(db);
  // Check if this is a request for spool presets
  const getPresets = url.searchParams.get('presets');
  
  if (getPresets === 'true') {
    try {
      const result = await drizzleDb.all(sql`
        SELECT * FROM spool_presets ORDER BY name
      `);
      return json({ success: true, data: result ?? [] });
    } catch (e) {
      console.error('Failed to fetch spool presets:', e);
      return json({ success: false, error: 'Failed to fetch presets' }, { status: 500 });
    }
  }

  try {
    const result = await drizzleDb.all(sql`
      SELECT pm.*, pmod.name as printer_model_name, sp.name as spool_preset_name, sp.material as spool_preset_material, sp.color as spool_preset_color, sp.brand as spool_preset_brand
      FROM print_modules pm
      LEFT JOIN printer_models pmod ON pm.printer_model_id = pmod.id
      LEFT JOIN spool_presets sp ON pm.default_spool_preset_id = sp.id
      ORDER BY pm.rowid DESC
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

  // Active toggle — lightweight action, doesn't require other fields
  if ('active' in body) {
    await drizzleDb.run(sql`UPDATE print_modules SET active = ${body.active ? 1 : 0} WHERE id = ${id}`);
    return json({ success: true });
  }

  const {
    name,
    estimated_time, plate_type, nozzle_diameter,
    expected_weight, default_spool_preset_id,
    local_file_handler_path, objects_per_print,
    inventory_slug, printer_model,
  } = body;

  if (!name) return json({ success: false, error: 'name is required' }, { status: 400 });

  try {
    await drizzleDb.run(sql`
      UPDATE print_modules SET
        name = ${name},
        expected_time = ${estimated_time ?? null},
        plate_type = ${plate_type ?? null},
        nozzle_diameter = ${nozzle_diameter ?? null},
        expected_weight = ${expected_weight ?? null},
        default_spool_preset_id = ${default_spool_preset_id ?? null},
        local_file_handler_path = ${local_file_handler_path ?? null},
        objects_per_print = ${objects_per_print ?? 1},
        inventory_slug = ${inventory_slug ?? null},
        printer_model = ${printer_model ?? null}
      WHERE id = ${id}
    `);

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
    // Fetch file paths before deleting so we can clean them up
    const module = await drizzleDb.get<{ pi_file_path: string | null; local_file_handler_path: string | null }>(
      sql`SELECT pi_file_path, local_file_handler_path FROM print_modules WHERE id = ${id}`
    );

    // Delete file from Pi if it exists — non-fatal if Pi is unreachable
    const piUrl = platform?.env?.PI_TUNNEL_URL;
    const piSecret = (platform?.env?.PI_SECRET as string | undefined) ?? '';
    if (module?.pi_file_path && piUrl) {
      try {
        await fetch(`${piUrl}/file`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json', 'x-pi-secret': piSecret },
          body: JSON.stringify({ file_path: module.pi_file_path }),
        });
      } catch (e) {
        console.warn('[pi/delete-file] Pi unreachable, skipping file cleanup:', e);
      }
    }

    await drizzleDb.run(sql`UPDATE print_jobs SET module_id = NULL WHERE module_id = ${id}`);
    await drizzleDb.run(sql`DELETE FROM print_modules WHERE id = ${id}`);

    // Return file paths so the client can clean up the local file via the file handler
    return json({
      success: true,
      local_file_handler_path: module?.local_file_handler_path ?? null,
    });
  } catch (e) {
    console.error('Failed to delete print module:', e);
    return json({ success: false, error: 'Failed to delete module' }, { status: 500 });
  }
};
