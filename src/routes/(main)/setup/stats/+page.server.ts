import type { Actions } from "./$types";
import { redirect } from "@sveltejs/kit";
import * as db from "$lib/server";
import { requireCtx } from "$lib/server/context";

export const actions: Actions = {
  // Stats needs no setup — this just surfaces the stats cell and ends onboarding.
  finish: async ({ locals }) => {
    const ctx = requireCtx(locals);
    const result = await db.completeSetupStep(ctx, "stats");
    if (!result.success) return result;
    throw redirect(303, "/");
  },
};
