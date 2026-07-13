import type { PageServerLoad, Actions } from "./$types";
import { redirect } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import * as db from "$lib/server";
import { requireCtx } from "$lib/server/context";
import { getAllObjects, createObject } from "$lib/inventory_handler";

export const load: PageServerLoad = async ({ locals }) => {
  const ctx = requireCtx(locals);
  const [modules, objects, spoolPresets, printerPresets] = await Promise.all([
    db.getAllPrintModules(ctx),
    getAllObjects(ctx),
    db.getAllSpoolPresets(ctx),
    db.getAllPrinterPresets(ctx),
  ]);
  return { modules, objects, spoolPresets, printerPresets };
};

export const actions: Actions = {
  addModule: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { success: false, error: "Give your module a name." };

    // Object: pick an existing one or create inline from the typed name.
    let objectId = Number(formData.get("objectId")) || null;
    const newObjectName = String(formData.get("newObjectName") ?? "").trim();
    if (!objectId && newObjectName) {
      const res = await createObject(ctx, { name: newObjectName });
      if (!res.success) return { success: false, error: res.error };
      objectId = Number((res.data as { id: number }).id);
    }

    // Minimal insert, same columns as POST /api/print-modules. The print file
    // itself is attached later (modules page / file handler) — filename falls
    // back to the module name so the NOT NULL column is satisfied.
    const filename = String(formData.get("filename") ?? "").trim() || `${name}.3mf`;
    const weight = Number(formData.get("weight")) || 0;
    const expectedTime = Number(formData.get("expectedTime")) || 0;
    const objectsPerPrint = Number(formData.get("objectsPerPrint")) || 1;
    const now = Math.floor(Date.now() / 1000);

    try {
      await ctx.db.run(sql`
        INSERT INTO print_modules
          (workspace_id, name, filename, weight, expected_time_minutes, objects_per_print,
           object_id, active, created_at, updated_at)
        VALUES
          (${ctx.workspaceId}, ${name}, ${filename}, ${weight}, ${expectedTime},
           ${objectsPerPrint}, ${objectId}, 1, ${now}, ${now})
      `);
      return { success: true };
    } catch (e) {
      console.error("Setup: failed to create module:", e);
      return { success: false, error: "Failed to create the module." };
    }
  },

  finish: async ({ locals }) => {
    const ctx = requireCtx(locals);
    const result = await db.completeSetupStep(ctx, "modules");
    if (!result.success) return result;
    throw redirect(303, "/setup/inventory");
  },
};
