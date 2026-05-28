import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

type SlotInput = {
  slot_index: number;
  spool_preset_id: number | null;
  weight: number | null;
};

/**
 * Normalize the slot payload. Accepts either the new `slots: [{slot_index, spool_preset_id, weight}]`
 * array or the legacy single `default_spool_preset_id`. Returns null when the caller
 * sent nothing slot-related (so PATCH knows to leave slots untouched).
 */
function normalizeSlots(body: Record<string, unknown>): SlotInput[] | null {
  if (Array.isArray(body.slots)) {
    return (body.slots as any[])
      .filter((s) => s && typeof s.slot_index === 'number')
      .map((s) => ({
        slot_index: s.slot_index,
        spool_preset_id:
          s.spool_preset_id === undefined || s.spool_preset_id === null
            ? null
            : Number(s.spool_preset_id),
        weight:
          s.weight === undefined || s.weight === null || s.weight === ''
            ? null
            : Number(s.weight),
      }));
  }
  if ('default_spool_preset_id' in body) {
    const id = body.default_spool_preset_id;
    return [{
      slot_index: 0,
      spool_preset_id: id == null ? null : Number(id as number),
      weight: null,
    }];
  }
  return null;
}

async function writeSlots(
  drizzleDb: ReturnType<typeof getDb>,
  moduleId: number | string,
  slots: SlotInput[],
) {
  await drizzleDb.run(sql`DELETE FROM module_filament_slots WHERE module_id = ${moduleId}`);
  for (const s of slots) {
    await drizzleDb.run(sql`
      INSERT INTO module_filament_slots (module_id, slot_index, spool_preset_id, weight)
      VALUES (${moduleId}, ${s.slot_index}, ${s.spool_preset_id}, ${s.weight})
    `);
  }
}

/** Sum of slot weights, treating nulls as 0. */
function totalSlotWeight(slots: SlotInput[]): number {
  return slots.reduce((sum, s) => sum + (s.weight ?? 0), 0);
}

/**
 * Keep `print_modules.weight` in sync with the sum of slot weights so the
 * denormalised total stays correct for matching / stats / recommendations.
 * The UI no longer collects a separate module-level weight.
 */
async function syncModuleWeight(
  drizzleDb: ReturnType<typeof getDb>,
  moduleId: number | string,
  slots: SlotInput[],
  now: number,
) {
  await drizzleDb.run(sql`
    UPDATE print_modules
    SET weight = ${totalSlotWeight(slots)}, updated_at = ${now}
    WHERE id = ${moduleId}
  `);
}

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
    objects_per_print, object_id, printer_preset_id,
    local_file_handler_path, pi_file_path,
  } = body;

  if (!name || !file_name) {
    return json({ success: false, error: 'name and file_name are required' }, { status: 400 });
  }

  const resolvedObjectId = (object_id as number | null) ?? null;
  const resolvedPresetId = (printer_preset_id as number | null) ?? null;
  const slots = normalizeSlots(body) ?? [];
  const moduleWeight = totalSlotWeight(slots);

  const filename = (pi_file_path as string) || (local_file_handler_path as string) || (file_name as string);
  const now = Math.floor(Date.now() / 1000);

  try {
    const result = await drizzleDb.run(sql`
      INSERT INTO print_modules
        (name, filename, thumbnail, weight, expected_time_minutes, objects_per_print,
         nozzle_diameter, object_id, printer_preset_id, active, created_at, updated_at)
      VALUES (
        ${name}, ${filename}, ${thumbnail ?? null},
        ${moduleWeight}, ${estimated_time ?? 0}, ${objects_per_print ?? 1},
        ${nozzle_diameter ?? null}, ${resolvedObjectId}, ${resolvedPresetId},
        1, ${now}, ${now}
      )
    `);

    const moduleId = result.meta.last_row_id as number;

    if (slots.length > 0 && moduleId) {
      await writeSlots(drizzleDb, moduleId, slots);
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
             mfs0.spool_preset_id as default_spool_preset_id,
             sp0.material as spool_preset_material, sp0.color as spool_preset_color, sp0.brand as spool_preset_brand,
             o.id as object_id, o.name as object_name
      FROM print_modules pm
      LEFT JOIN printer_presets pp ON pm.printer_preset_id = pp.id
      LEFT JOIN module_filament_slots mfs0 ON pm.id = mfs0.module_id AND mfs0.slot_index = 0
      LEFT JOIN spool_presets sp0 ON mfs0.spool_preset_id = sp0.id
      LEFT JOIN objects o ON pm.object_id = o.id
      ORDER BY pm.id DESC
    `);

    // Fetch all slots for all modules in one query, then attach.
    const slotRows = await drizzleDb.all<{
      module_id: number;
      slot_index: number;
      spool_preset_id: number | null;
      weight: number | null;
      preset_brand: string | null;
      preset_material: string | null;
      preset_color: string | null;
    }>(sql`
      SELECT mfs.module_id, mfs.slot_index, mfs.spool_preset_id, mfs.weight,
             sp.brand as preset_brand, sp.material as preset_material, sp.color as preset_color
      FROM module_filament_slots mfs
      LEFT JOIN spool_presets sp ON mfs.spool_preset_id = sp.id
      ORDER BY mfs.module_id, mfs.slot_index
    `);

    const slotsByModule = new Map<number, any[]>();
    for (const s of slotRows ?? []) {
      const arr = slotsByModule.get(s.module_id) ?? [];
      arr.push(s);
      slotsByModule.set(s.module_id, arr);
    }

    const modules = (result ?? []).map((m: any) => ({
      ...m,
      slots: slotsByModule.get(m.id) ?? [],
    }));

    return json({ success: true, data: modules });
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
    name, estimated_time, nozzle_diameter,
    objects_per_print, object_id,
    printer_preset_id,
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
        objects_per_print = ${objects_per_print ?? 1},
        object_id = ${resolvedObjectId},
        printer_preset_id = ${resolvedPresetId},
        updated_at = ${now}
      WHERE id = ${id}
    `);

    const slots = normalizeSlots(body);
    if (slots !== null) {
      await writeSlots(drizzleDb, id, slots);
      await syncModuleWeight(drizzleDb, id, slots, now);
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
