import type { PageServerLoad, Actions } from "./$types";
import { redirect } from "@sveltejs/kit";
import * as db from "$lib/server";
import { requireCtx } from "$lib/server/context";
import { getAllObjects, createObject } from "$lib/inventory_handler";

export const load: PageServerLoad = async ({ locals }) => {
  const ctx = requireCtx(locals);
  const [objects, modules] = await Promise.all([
    getAllObjects(ctx),
    db.getAllPrintModules(ctx),
  ]);
  // Modules still missing an object — the matching worklist.
  const unmatchedModules = modules.filter((m) => m.object_id == null);
  return { objects, modules, unmatchedModules };
};

export const actions: Actions = {
  addObject: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { success: false, error: "Give the object a name." };
    return createObject(ctx, {
      name,
      minThreshold: Number(formData.get("minThreshold")) || 0,
    });
  },

  // Link a module to the object it produces — successful prints then count into
  // that object's stock (the basis for inventory + demand forecasting).
  matchModule: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const moduleId = Number(formData.get("moduleId"));
    const objectId = Number(formData.get("objectId"));
    if (!moduleId || !objectId) {
      return { success: false, error: "Pick both a module and an object." };
    }
    return db.updatePrintModule(ctx, moduleId, { objectId });
  },

  finish: async ({ locals }) => {
    const ctx = requireCtx(locals);
    const result = await db.completeSetupStep(ctx, "inventory");
    if (!result.success) return result;
    throw redirect(303, "/setup/dashboard");
  },
};
