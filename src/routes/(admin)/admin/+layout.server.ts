import type { LayoutServerLoad } from "./$types";
import { requireAdmin } from "$lib/server/admin";

export const load: LayoutServerLoad = ({ locals }) => {
  requireAdmin(locals);
  return {
    admin: { name: locals.user!.name, email: locals.user!.email },
  };
};
