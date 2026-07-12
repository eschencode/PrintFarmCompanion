import type { Actions, PageServerLoad } from "./$types";
import { fail } from "@sveltejs/kit";
import { getAuth } from "$lib/auth";

export const load: PageServerLoad = async ({ locals }) => {
  // locals.user / locals.workspace are populated by hooks.server.ts; the route
  // guard guarantees a user is present here.
  return {
    account: locals.user
      ? {
          name: locals.user.name,
          email: locals.user.email,
          emailVerified: locals.user.emailVerified,
        }
      : null,
    workspace: locals.workspace
      ? { name: locals.workspace.name, slug: locals.workspace.slug }
      : null,
  };
};

export const actions: Actions = {
  resendVerification: async ({ request, platform, locals }) => {
    const email = locals.user?.email;
    if (!email) return fail(401, { error: "Not signed in." });
    if (locals.user?.emailVerified) return { sent: true };

    const auth = getAuth(platform);
    try {
      await auth.api.sendVerificationEmail({
        body: { email, callbackURL: "/" },
        headers: request.headers,
      });
    } catch (e) {
      console.error("sendVerificationEmail failed:", e);
      return fail(500, { error: "Couldn't send the email. Try again in a moment." });
    }
    return { sent: true };
  },
};
