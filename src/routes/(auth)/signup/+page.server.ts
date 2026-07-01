import type { Actions } from "./$types";
import { fail, redirect } from "@sveltejs/kit";
import { getAuth } from "$lib/auth";
import { createWorkspaceForUser } from "$lib/server/workspaces";

export const actions: Actions = {
  default: async ({ request, platform }) => {
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const workspaceName = String(form.get("workspaceName") ?? "").trim();

    const values = { email, name, workspaceName };

    if (!email || !password) {
      return fail(400, { ...values, error: "Email and password are required." });
    }
    if (password.length < 8) {
      return fail(400, { ...values, error: "Password must be at least 8 characters." });
    }

    // better-auth requires a name; default to the email local-part if blank.
    const finalName = name || email.split("@")[0];

    const auth = getAuth(platform);

    let userId: string;
    try {
      const res = await auth.api.signUpEmail({
        body: { email, password, name: finalName },
        headers: request.headers,
      });
      userId = res.user.id;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not create your account.";
      return fail(400, { ...values, error: message });
    }

    try {
      await createWorkspaceForUser(platform!.env!.DB, {
        userId,
        userName: finalName,
        userEmail: email,
        requestedName: workspaceName || null,
      });
    } catch (e) {
      console.error("Workspace creation failed after signup:", e);
      return fail(500, {
        ...values,
        error: "Account created but workspace setup failed. Contact support.",
      });
    }

    throw redirect(303, "/");
  },
};
