import type { Actions, PageServerLoad } from "./$types";
import { fail, redirect } from "@sveltejs/kit";
import { getAuth } from "$lib/auth";

export const load: PageServerLoad = ({ url }) => {
  // better-auth redirects here with ?token=… after verifying the link. It sets
  // ?error=INVALID_TOKEN (etc.) if the link was bad or expired.
  return {
    token: url.searchParams.get("token"),
    linkError: url.searchParams.get("error"),
  };
};

export const actions: Actions = {
  default: async ({ request, platform, url }) => {
    const form = await request.formData();
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const token = String(form.get("token") ?? "") || url.searchParams.get("token") || "";

    if (!token) return fail(400, { error: "This reset link is invalid or has expired." });
    if (password.length < 8) return fail(400, { error: "Password must be at least 8 characters." });
    if (password !== confirm) return fail(400, { error: "Passwords don't match." });

    const auth = getAuth(platform);
    try {
      await auth.api.resetPassword({
        body: { newPassword: password, token },
        headers: request.headers,
      });
    } catch (e) {
      console.error("resetPassword failed:", e);
      return fail(400, { error: "This reset link is invalid or has expired. Request a new one." });
    }

    throw redirect(303, "/login?reset=1");
  },
};
