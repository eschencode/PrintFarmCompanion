import type { Actions } from "./$types";
import { fail, redirect } from "@sveltejs/kit";
import { getAuth } from "$lib/auth";

export const actions: Actions = {
  default: async ({ request, platform, url }) => {
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !password) {
      return fail(400, { email, error: "Email and password are required." });
    }

    const auth = getAuth(platform);
    try {
      await auth.api.signInEmail({
        body: { email, password },
        headers: request.headers,
      });
    } catch {
      // Don't leak which part was wrong.
      return fail(400, { email, error: "Invalid email or password." });
    }

    // Only honor same-site relative paths (avoid open-redirect).
    const target = url.searchParams.get("redirectTo");
    throw redirect(303, target && target.startsWith("/") ? target : "/");
  },
};
