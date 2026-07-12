import type { Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { getAuth } from "$lib/auth";

export const actions: Actions = {
  default: async ({ request, platform }) => {
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();

    if (!email) return fail(400, { email, error: "Enter your email address." });

    const auth = getAuth(platform);
    try {
      await auth.api.requestPasswordReset({
        // better-auth builds the reset link pointing back here; after it
        // verifies the token it redirects to /reset-password?token=…
        body: { email, redirectTo: "/reset-password" },
        headers: request.headers,
      });
    } catch (e) {
      // Swallow — never reveal whether an account exists (no enumeration).
      console.error("requestPasswordReset failed:", e);
    }

    // Always report the same thing regardless of whether the email exists.
    return { sent: true, email };
  },
};
