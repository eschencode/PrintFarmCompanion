import type { Actions, PageServerLoad } from "./$types";
import { fail } from "@sveltejs/kit";
import { getAuth } from "$lib/auth";
import { renameWorkspace } from "$lib/server/workspaces";

export const load: PageServerLoad = async ({ locals }) => {
  return {
    email: locals.user?.email ?? "",
    emailVerified: !!locals.user?.emailVerified,
    workspaceName: locals.workspace?.name ?? "",
  };
};

export const actions: Actions = {
  // Re-send the verification email for the signed-in user.
  resendVerification: async ({ request, platform, locals }) => {
    const email = locals.user?.email;
    if (!email) return fail(401, { resendError: "Not signed in." });

    try {
      const auth = getAuth(platform);
      await auth.api.sendVerificationEmail({
        body: { email },
        headers: request.headers,
      });
    } catch (e) {
      console.error("Resend verification failed:", e);
      return fail(500, { resendError: "Couldn't send. Try again in a moment." });
    }
    return { resent: true };
  },

  // Rename the workspace from the guided-setup intro.
  renameWorkspace: async ({ request, locals, platform }) => {
    const workspaceId = locals.workspace?.id;
    if (!workspaceId) return fail(401, { renameError: "No workspace." });

    const form = await request.formData();
    const name = String(form.get("workspaceName") ?? "").trim();
    if (!name) return fail(400, { renameError: "Enter a name." });

    try {
      await renameWorkspace(platform!.env!.DB, workspaceId, name);
    } catch (e) {
      console.error("Workspace rename failed:", e);
      return fail(500, { renameError: "Couldn't save. Try again." });
    }
    return { renamed: true, workspaceName: name };
  },
};
