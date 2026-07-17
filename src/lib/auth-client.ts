import { createAuthClient } from "better-auth/svelte";
import { adminClient } from "better-auth/client/plugins";

// Browser-side client. baseURL defaults to the current origin, which is what we
// want (same-origin API). Use authClient.signUp / signIn / signOut / useSession.
// adminClient adds authClient.admin.* (impersonateUser, stopImpersonating, ...).
export const authClient = createAuthClient({ plugins: [adminClient()] });
