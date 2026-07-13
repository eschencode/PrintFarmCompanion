import type { PageServerLoad, Actions } from "./$types";
import { redirect } from "@sveltejs/kit";
import * as db from "$lib/server";
import { requireCtx } from "$lib/server/context";

export const load: PageServerLoad = async ({ locals }) => {
  const ctx = requireCtx(locals);
  const [printers, printerPresets] = await Promise.all([
    db.getAllPrintersFull(ctx),
    db.getAllPrinterPresets(ctx),
  ]);
  return { printers, printerPresets };
};

export const actions: Actions = {
  // Same shape as settings/printers addPrinter — this page is just the guided path.
  addPrinter: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();

    const name = String(formData.get("name") ?? "").trim();
    let presetId = Number(formData.get("printerPresetId")) || 0;

    // Inline "my model isn't listed" path: create the preset first.
    const newModel = String(formData.get("newModel") ?? "").trim();
    if (!presetId && newModel) {
      const res = await db.createPrinterPreset(ctx, {
        model: newModel,
        brand: String(formData.get("newBrand") ?? "").trim(),
        dimensionX: Number(formData.get("buildVolumeX")) || null,
        dimensionY: Number(formData.get("buildVolumeY")) || null,
        dimensionZ: Number(formData.get("buildVolumeZ")) || null,
        deviceFilePath: "/",
      });
      if (!res.success) return res;
      presetId = Number((res.data as { id: number }).id);
    }

    if (!name) return { success: false, error: "Give your printer a name." };
    if (!presetId) return { success: false, error: "Pick a model or add a new one." };

    const slotCount = Math.max(1, Number(formData.get("slotCount")) || 1);

    return db.createPrinter(
      ctx,
      { name, printerPresetId: presetId, slotCount },
      {
        printerIp: (formData.get("printerIp") as string) || null,
        serial: (formData.get("printerSerial") as string) || null,
        accessCode: (formData.get("printerAccessCode") as string) || null,
      },
    );
  },

  // Places created printers onto the dashboard grid and removes the setup cell
  // (zero printers → the cell just clears). Then on to the next step.
  finish: async ({ locals }) => {
    const ctx = requireCtx(locals);
    const result = await db.completeSetupStep(ctx, "printers");
    if (!result.success) return result;
    throw redirect(303, "/setup/spools");
  },
};
