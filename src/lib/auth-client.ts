import { createAuthClient } from "better-auth/svelte";

// Browser-side client. baseURL defaults to the current origin, which is what we
// want (same-origin API). Use authClient.signUp / signIn / signOut / useSession.
export const authClient = createAuthClient();
