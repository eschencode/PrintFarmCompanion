import type { LayoutServerLoad } from "./$types";

// Root layout data: expose the session's user (populated by hooks.server.ts) so
// the root +error.svelte can branch its CTA — dashboard for signed-in users,
// home for visitors. Kept minimal on purpose; page-specific data stays in the
// route groups.
export const load: LayoutServerLoad = ({ locals }) => {
  return {
    user: locals.user ? { name: locals.user.name } : null,
  };
};
