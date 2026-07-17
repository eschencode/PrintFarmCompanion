import type { Actions, PageServerLoad } from "./$types";
import { fail } from "@sveltejs/kit";
import {
  requireAdmin,
  listSystemPrinterPresets,
  listSystemPlatePresets,
  createSystemPrinterPreset,
  updateSystemPrinterPreset,
  deleteSystemPrinterPreset,
  createSystemPlatePreset,
  updateSystemPlatePreset,
  deleteSystemPlatePreset,
} from "$lib/server/admin";

export const load: PageServerLoad = async ({ locals }) => {
  const admin = requireAdmin(locals);
  return {
    printerPresets: await listSystemPrinterPresets(admin),
    platePresets: await listSystemPlatePresets(admin),
  };
};

const num = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function printerFields(form: FormData) {
  return {
    brand: String(form.get("brand") ?? "").trim(),
    model: String(form.get("model") ?? "").trim(),
    dimensionX: num(form.get("dimensionX")),
    dimensionY: num(form.get("dimensionY")),
    dimensionZ: num(form.get("dimensionZ")),
    deviceFilePath: String(form.get("deviceFilePath") ?? "").trim(),
  };
}

function plateFields(form: FormData) {
  return {
    name: String(form.get("name") ?? "").trim(),
    dimensionX: num(form.get("dimensionX")),
    dimensionY: num(form.get("dimensionY")),
  };
}

// Drizzle wraps D1 errors — the SQLite constraint text lives in the cause chain.
const errText = (e: unknown): string => {
  let out = String(e);
  let cur: unknown = e;
  while (cur instanceof Error && cur.cause) {
    cur = cur.cause;
    out += "\n" + String(cur);
  }
  return out;
};
const isUnique = (e: unknown) => errText(e).includes("UNIQUE");
const isRestrict = (e: unknown) => {
  const t = errText(e);
  return t.includes("FOREIGN KEY") || t.includes("RESTRICT");
};

export const actions: Actions = {
  createPrinterPreset: async ({ locals, request }) => {
    const admin = requireAdmin(locals);
    const p = printerFields(await request.formData());
    if (!p.brand || !p.model || !p.deviceFilePath) {
      return fail(400, { error: "Brand, model and device file path are required" });
    }
    try {
      await createSystemPrinterPreset(admin, p);
    } catch (e) {
      if (isUnique(e)) return fail(400, { error: `A system preset ${p.brand} ${p.model} already exists` });
      console.error("createSystemPrinterPreset failed:", e);
      return fail(500, { error: "Failed to create preset" });
    }
    return { ok: true };
  },

  updatePrinterPreset: async ({ locals, request }) => {
    const admin = requireAdmin(locals);
    const form = await request.formData();
    const id = Number(form.get("id"));
    const p = printerFields(form);
    if (!id || !p.brand || !p.model || !p.deviceFilePath) {
      return fail(400, { error: "Brand, model and device file path are required" });
    }
    try {
      await updateSystemPrinterPreset(admin, id, p);
    } catch (e) {
      if (isUnique(e)) return fail(400, { error: `A system preset ${p.brand} ${p.model} already exists` });
      console.error("updateSystemPrinterPreset failed:", e);
      return fail(500, { error: "Failed to update preset" });
    }
    return { ok: true };
  },

  deletePrinterPreset: async ({ locals, request }) => {
    const admin = requireAdmin(locals);
    const id = Number((await request.formData()).get("id"));
    if (!id) return fail(400, { error: "Missing id" });
    try {
      await deleteSystemPrinterPreset(admin, id);
    } catch (e) {
      if (isRestrict(e)) return fail(400, { error: "Preset is in use by existing printers" });
      console.error("deleteSystemPrinterPreset failed:", e);
      return fail(500, { error: "Failed to delete preset" });
    }
    return { ok: true };
  },

  createPlatePreset: async ({ locals, request }) => {
    const admin = requireAdmin(locals);
    const p = plateFields(await request.formData());
    if (!p.name) return fail(400, { error: "Name is required" });
    try {
      await createSystemPlatePreset(admin, p);
    } catch (e) {
      if (isUnique(e)) return fail(400, { error: `A system plate "${p.name}" already exists` });
      console.error("createSystemPlatePreset failed:", e);
      return fail(500, { error: "Failed to create plate" });
    }
    return { ok: true };
  },

  updatePlatePreset: async ({ locals, request }) => {
    const admin = requireAdmin(locals);
    const form = await request.formData();
    const id = Number(form.get("id"));
    const p = plateFields(form);
    if (!id || !p.name) return fail(400, { error: "Name is required" });
    try {
      await updateSystemPlatePreset(admin, id, p);
    } catch (e) {
      if (isUnique(e)) return fail(400, { error: `A system plate "${p.name}" already exists` });
      console.error("updateSystemPlatePreset failed:", e);
      return fail(500, { error: "Failed to update plate" });
    }
    return { ok: true };
  },

  deletePlatePreset: async ({ locals, request }) => {
    const admin = requireAdmin(locals);
    const id = Number((await request.formData()).get("id"));
    if (!id) return fail(400, { error: "Missing id" });
    try {
      await deleteSystemPlatePreset(admin, id);
    } catch (e) {
      if (isRestrict(e)) return fail(400, { error: "Plate is in use by existing printers" });
      console.error("deleteSystemPlatePreset failed:", e);
      return fail(500, { error: "Failed to delete plate" });
    }
    return { ok: true };
  },
};
