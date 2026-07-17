<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { authClient } from "$lib/auth-client";

  let { data, form } = $props();

  let impersonating = $state<string | null>(null);
  let deleteTarget = $state<{ userId: string; email: string } | null>(null);
  let confirmEmail = $state("");
  let banTarget = $state<{ userId: string; email: string } | null>(null);
  let banReason = $state("");

  async function impersonate(userId: string) {
    impersonating = userId;
    try {
      // Client-side on purpose: the endpoint swaps the session cookie on the
      // browser response. Full navigation so hooks re-resolve to the target's
      // workspace.
      await authClient.admin.impersonateUser({ userId });
      window.location.href = "/";
    } catch (e) {
      console.error("Impersonation failed:", e);
      impersonating = null;
    }
  }

  const fmtDate = (unix: number | null) =>
    unix ? new Date(unix * 1000).toLocaleDateString() : "—";
</script>

<svelte:head><title>Workspaces · Admin</title></svelte:head>

<h1 class="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-1">Workspaces</h1>
<p class="text-sm text-zinc-400 mb-6">{data.workspaces.length} workspaces</p>

{#if form?.error}
  <div class="mb-4 rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-400">
    {form.error}
  </div>
{/if}

<div class="overflow-x-auto bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl">
  <table class="w-full text-sm">
    <thead>
      <tr class="text-left text-xs uppercase tracking-wide text-zinc-400 border-b border-zinc-100 dark:border-[#1e1e1e]">
        <th class="px-4 py-3 font-medium">Workspace</th>
        <th class="px-4 py-3 font-medium">Owner</th>
        <th class="px-4 py-3 font-medium">Signed up</th>
        <th class="px-4 py-3 font-medium">Last active</th>
        <th class="px-4 py-3 font-medium text-right">Printers</th>
        <th class="px-4 py-3 font-medium text-right">Jobs</th>
        <th class="px-4 py-3 font-medium text-right">Spools</th>
        <th class="px-4 py-3 font-medium text-right">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each data.workspaces as ws (ws.workspace_id)}
        <tr class="border-b border-zinc-50 dark:border-[#181818] last:border-0">
          <td class="px-4 py-3">
            <p class="text-zinc-900 dark:text-zinc-100 font-medium">{ws.workspace_name}</p>
            <p class="text-xs text-zinc-400 font-mono">{ws.slug}</p>
          </td>
          <td class="px-4 py-3">
            <p class="text-zinc-900 dark:text-zinc-100">{ws.owner_name ?? "—"}</p>
            <p class="text-xs text-zinc-400 flex items-center gap-1.5">
              {ws.owner_email ?? "—"}
              {#if ws.email_verified}
                <span class="text-emerald-500" title="Email verified">✓</span>
              {/if}
              {#if ws.banned}
                <span class="inline-flex px-1.5 rounded bg-red-500/15 text-red-500 text-[10px] font-medium uppercase">banned</span>
              {/if}
            </p>
          </td>
          <td class="px-4 py-3 text-zinc-500 dark:text-zinc-400">{fmtDate(ws.created_at)}</td>
          <td class="px-4 py-3 text-zinc-500 dark:text-zinc-400">{fmtDate(ws.last_active)}</td>
          <td class="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{ws.printer_count}</td>
          <td class="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{ws.job_count}</td>
          <td class="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{ws.spool_count}</td>
          <td class="px-4 py-3">
            {#if ws.owner_id}
              <div class="flex items-center justify-end gap-1 flex-wrap">
                <button
                  onclick={() => impersonate(ws.owner_id!)}
                  disabled={impersonating !== null}
                  class="h-7 px-2.5 rounded-md text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {impersonating === ws.owner_id ? "…" : "Impersonate"}
                </button>

                {#if !ws.email_verified}
                  <form method="POST" action="?/verifyEmail" use:enhance>
                    <input type="hidden" name="userId" value={ws.owner_id} />
                    <button class="h-7 px-2.5 rounded-md text-xs text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                      Verify email
                    </button>
                  </form>
                {/if}

                <form method="POST" action="?/sendPasswordReset" use:enhance>
                  <input type="hidden" name="email" value={ws.owner_email} />
                  <button class="h-7 px-2.5 rounded-md text-xs text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                    Reset pw
                  </button>
                </form>

                {#if ws.banned}
                  <form method="POST" action="?/unban" use:enhance>
                    <input type="hidden" name="userId" value={ws.owner_id} />
                    <button class="h-7 px-2.5 rounded-md text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 transition-colors">
                      Unban
                    </button>
                  </form>
                {:else}
                  <button
                    onclick={() => { banTarget = { userId: ws.owner_id!, email: ws.owner_email! }; banReason = ""; }}
                    class="h-7 px-2.5 rounded-md text-xs text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 transition-colors"
                  >
                    Ban
                  </button>
                {/if}

                <button
                  onclick={() => { deleteTarget = { userId: ws.owner_id!, email: ws.owner_email! }; confirmEmail = ""; }}
                  class="h-7 px-2.5 rounded-md text-xs text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
                >
                  Delete
                </button>
              </div>
            {:else}
              <p class="text-xs text-zinc-400 text-right">orphaned</p>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if form?.sent}
  <p class="mt-3 text-sm text-emerald-600 dark:text-emerald-400">Password reset email sent to {form.sent}.</p>
{/if}

<!-- Ban dialog -->
{#if banTarget}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#1e1e1e] rounded-xl p-5 w-full max-w-md">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Ban {banTarget.email}?</h2>
      <p class="text-sm text-zinc-400 mt-1">Their sessions are revoked and sign-in is blocked until unbanned.</p>
      <form
        method="POST"
        action="?/ban"
        use:enhance={() => async ({ update }) => { banTarget = null; await update(); }}
        class="mt-4 space-y-3"
      >
        <input type="hidden" name="userId" value={banTarget.userId} />
        <input
          name="banReason"
          bind:value={banReason}
          placeholder="Reason (optional)"
          class="w-full h-9 px-3 rounded-lg text-sm bg-zinc-50 dark:bg-[#181818] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
        />
        <div class="flex justify-end gap-2">
          <button type="button" onclick={() => (banTarget = null)} class="h-9 px-4 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            Cancel
          </button>
          <button type="submit" class="h-9 px-4 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors">
            Ban user
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Delete dialog -->
{#if deleteTarget}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#1e1e1e] rounded-xl p-5 w-full max-w-md">
      <h2 class="text-lg font-semibold text-red-600 dark:text-red-400">Delete {deleteTarget.email}?</h2>
      <p class="text-sm text-zinc-400 mt-1">
        Permanently deletes the account, their workspace and <strong>all</strong> data in it. This cannot be undone.
      </p>
      <form
        method="POST"
        action="?/deleteUser"
        use:enhance={() => async ({ update }) => { deleteTarget = null; await update(); await invalidateAll(); }}
        class="mt-4 space-y-3"
      >
        <input type="hidden" name="userId" value={deleteTarget.userId} />
        <input type="hidden" name="email" value={deleteTarget.email} />
        <label class="block text-xs text-zinc-400">
          Type <span class="font-mono text-zinc-600 dark:text-zinc-300">{deleteTarget.email}</span> to confirm
          <input
            name="confirmEmail"
            bind:value={confirmEmail}
            autocomplete="off"
            class="mt-1 w-full h-9 px-3 rounded-lg text-sm bg-zinc-50 dark:bg-[#181818] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
          />
        </label>
        <div class="flex justify-end gap-2">
          <button type="button" onclick={() => (deleteTarget = null)} class="h-9 px-4 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            Cancel
          </button>
          <button
            type="submit"
            disabled={confirmEmail !== deleteTarget.email}
            class="h-9 px-4 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            Delete everything
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
