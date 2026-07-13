import type { PageServerLoad, Actions } from "./$types";
import { redirect } from "@sveltejs/kit";
import * as db from "$lib/server";
import { requireCtx } from "$lib/server/context";

export const load: PageServerLoad = async ({ locals }) => {
  const ctx = requireCtx(locals);
  const spoolPresets = await db.getAllSpoolPresets(ctx);
  return { spoolPresets };
};

export const actions: Actions = {
  // Same as the spools page's createPreset — guided path.
  addPreset: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();

    const brand = String(formData.get("brand") ?? "").trim();
    const material = String(formData.get("material") ?? "").trim();
    if (!brand || !material) {
      return { success: false, error: "Brand and material are required." };
    }

    return db.createSpoolPreset(ctx, {
      brand,
      material,
      color: String(formData.get("color") ?? "").trim(),
      colorHex: (formData.get("colorHex") as string) || null,
      defaultWeight: Number(formData.get("defaultWeight")) || 1000,
      inStorage: Number(formData.get("initialStock")) || 0,
    });
  },

  // +/- storage buttons. setStorageCount sets an absolute value, so the row
  // sends its current count and we apply the delta (floored at 0).
  adjustStock: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const presetId = Number(formData.get("presetId"));
    const current = Number(formData.get("current")) || 0;
    const delta = Number(formData.get("delta")) || 0;
    if (!presetId) return { success: false, error: "Missing preset." };
    return db.setStorageCount(ctx, presetId, Math.max(0, current + delta));
  },

  finish: async ({ locals }) => {
    const ctx = requireCtx(locals);
    const result = await db.completeSetupStep(ctx, "spools");
    if (!result.success) return result;
    throw redirect(303, "/setup/modules");
  },
};
