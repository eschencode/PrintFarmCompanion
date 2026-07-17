import type { PageServerLoad } from "./$types";
import { requireAdmin, getPlatformMetrics } from "$lib/server/admin";

export const load: PageServerLoad = async ({ locals }) => {
  const admin = requireAdmin(locals);
  return { metrics: await getPlatformMetrics(admin) };
};
