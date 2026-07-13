import type { PageServerLoad, Actions } from "./$types";
import { redirect } from "@sveltejs/kit";
import * as db from "$lib/server";
import { requireCtx } from "$lib/server/context";
import type { GridCell } from "$lib/types";

export const load: PageServerLoad = async ({ locals }) => {
  const ctx = requireCtx(locals);
  const printers = await db.getAllPrinters(ctx);
  return {
    printers: printers.map((p) => ({ id: Number(p.id), name: p.name })),
  };
};

interface PageInput {
  name: string;
  rows: number;
  cols: number;
  config: GridCell[];
}

export const actions: Actions = {
  // Replace the workspace's grids with the arranged pages. Page 0 becomes the
  // default (updates the existing default preset in place); extra pages are
  // created as additional, non-default grids.
  save: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();

    let pages: PageInput[];
    try {
      pages = JSON.parse(String(formData.get("pages") ?? "[]"));
    } catch {
      return { success: false, error: "Could not read the layout." };
    }
    if (!pages.length) return { success: false, error: "Nothing to save." };

    const existingDefault = await db.getDefaultGridPreset(ctx);

    const [first, ...rest] = pages;
    if (existingDefault) {
      await db.updateGridPreset(ctx, existingDefault.id, {
        name: first.name || "Default",
        rows: first.rows,
        cols: first.cols,
        is_default: true,
        grid_config: first.config,
      });
    } else {
      await db.createGridPreset(ctx, {
        name: first.name || "Default",
        rows: first.rows,
        cols: first.cols,
        is_default: true,
        grid_config: first.config,
      });
    }

    for (const [i, page] of rest.entries()) {
      await db.createGridPreset(ctx, {
        name: page.name || `Page ${i + 2}`,
        rows: page.rows,
        cols: page.cols,
        is_default: false,
        grid_config: page.config,
      });
    }

    throw redirect(303, "/setup/stats");
  },

  // Keep whatever the setup flow built so far.
  skip: async () => {
    throw redirect(303, "/setup/stats");
  },
};
