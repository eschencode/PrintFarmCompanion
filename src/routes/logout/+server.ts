import type { RequestHandler } from "./$types";
import { redirect } from "@sveltejs/kit";
import { getAuth } from "$lib/auth";

// POST /logout — clears the session cookie (via the sveltekitCookies plugin) and
// sends the user to the login page.
export const POST: RequestHandler = async ({ request, platform }) => {
  const auth = getAuth(platform);
  try {
    await auth.api.signOut({ headers: request.headers });
  } catch {
    // Already signed out / no session — fall through to redirect.
  }
  throw redirect(303, "/login");
};
