import type { Actions, PageServerLoad } from "./$types";
import { fail } from "@sveltejs/kit";
import { getAuth } from "$lib/auth";
import {
  requireAdmin,
  listAllWorkspaces,
  deleteUserCascade,
} from "$lib/server/admin";

export const load: PageServerLoad = async ({ locals }) => {
  const admin = requireAdmin(locals);
  return { workspaces: await listAllWorkspaces(admin) };
};

export const actions: Actions = {
  verifyEmail: async ({ locals, request }) => {
    const admin = requireAdmin(locals);
    const form = await request.formData();
    const userId = String(form.get("userId") ?? "");
    if (!userId) return fail(400, { error: "Missing userId" });
    const now = Math.floor(Date.now() / 1000);
    await admin.d1
      .prepare(`UPDATE user SET email_verified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, userId)
      .run();
    return { ok: true };
  },

  sendPasswordReset: async ({ locals, request, platform }) => {
    requireAdmin(locals);
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    if (!email) return fail(400, { error: "Missing email" });
    const auth = getAuth(platform);
    try {
      await auth.api.requestPasswordReset({
        body: { email, redirectTo: "/reset-password" },
        headers: request.headers,
      });
    } catch (e) {
      console.error("Admin requestPasswordReset failed:", e);
      return fail(500, { error: "Failed to send reset email" });
    }
    return { ok: true, sent: email };
  },

  ban: async ({ locals, request, platform }) => {
    requireAdmin(locals);
    const form = await request.formData();
    const userId = String(form.get("userId") ?? "");
    const banReason = String(form.get("banReason") ?? "").trim() || undefined;
    if (!userId) return fail(400, { error: "Missing userId" });
    if (userId === locals.user!.id) return fail(400, { error: "You can't ban yourself" });
    const auth = getAuth(platform);
    try {
      // headers required: the plugin's admin middleware authorizes off the
      // caller's session.
      await auth.api.banUser({
        body: { userId, banReason },
        headers: request.headers,
      });
    } catch (e) {
      console.error("banUser failed:", e);
      return fail(500, { error: "Failed to ban user" });
    }
    return { ok: true };
  },

  unban: async ({ locals, request, platform }) => {
    requireAdmin(locals);
    const form = await request.formData();
    const userId = String(form.get("userId") ?? "");
    if (!userId) return fail(400, { error: "Missing userId" });
    const auth = getAuth(platform);
    try {
      await auth.api.unbanUser({
        body: { userId },
        headers: request.headers,
      });
    } catch (e) {
      console.error("unbanUser failed:", e);
      return fail(500, { error: "Failed to unban user" });
    }
    return { ok: true };
  },

  deleteUser: async ({ locals, request }) => {
    const admin = requireAdmin(locals);
    const form = await request.formData();
    const userId = String(form.get("userId") ?? "");
    const email = String(form.get("email") ?? "");
    const confirmEmail = String(form.get("confirmEmail") ?? "").trim();
    if (!userId) return fail(400, { error: "Missing userId" });
    if (userId === locals.user!.id) {
      return fail(400, { error: "You can't delete your own account here" });
    }
    if (confirmEmail !== email) {
      return fail(400, { error: "Confirmation email doesn't match" });
    }
    try {
      await deleteUserCascade(admin, userId);
    } catch (e) {
      console.error("deleteUserCascade failed:", e);
      return fail(500, { error: "Failed to delete user" });
    }
    return { ok: true };
  },
};
