import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  // locals.user / locals.workspace are populated by hooks.server.ts; the route
  // guard guarantees a user is present here.
  return {
    account: locals.user
      ? { name: locals.user.name, email: locals.user.email }
      : null,
    workspace: locals.workspace
      ? { name: locals.workspace.name, slug: locals.workspace.slug }
      : null,
  };
};
