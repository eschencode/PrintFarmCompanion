<script lang="ts">
  import { enhance } from "$app/forms";
  import BackToDashboard from "$lib/components/BackToDashboard.svelte";
  let { data, form } = $props();
  let sending = $state(false);
</script>

<svelte:head><title>Account · Settings</title></svelte:head>

<div class="min-h-screen p-6 sm:p-10">
  <div class="max-w-3xl mx-auto">

    <div class="mb-10 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-[2rem] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-none">Account</h1>
        <p class="text-zinc-400 dark:text-zinc-500 text-sm mt-2">Your login and workspace</p>
      </div>
      <BackToDashboard />
    </div>

    <div class="space-y-3">
      <!-- Account -->
      <div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">Login</p>
        <dl class="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt class="text-zinc-400">Name</dt>
          <dd class="text-zinc-900 dark:text-zinc-100">{data.account?.name ?? "—"}</dd>
          <dt class="text-zinc-400">Email</dt>
          <dd class="text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            {data.account?.email ?? "—"}
            {#if data.account?.emailVerified}
              <span class="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                Verified
              </span>
            {/if}
          </dd>
        </dl>

        {#if data.account && !data.account.emailVerified}
          <div class="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/25 px-3.5 py-3">
            {#if form?.sent}
              <p class="text-sm text-emerald-600 dark:text-emerald-400">
                Verification email sent to {data.account.email}. Check your inbox.
              </p>
            {:else}
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm font-medium text-amber-700 dark:text-amber-300">Email not verified</p>
                  <p class="text-xs text-amber-600/80 dark:text-amber-400/70 mt-0.5">
                    {form?.error ?? "Verify your email to secure your account."}
                  </p>
                </div>
                <form
                  method="POST"
                  action="?/resendVerification"
                  use:enhance={() => {
                    sending = true;
                    return async ({ update }) => {
                      await update();
                      sending = false;
                    };
                  }}
                >
                  <button
                    type="submit" disabled={sending}
                    class="shrink-0 inline-flex items-center h-9 px-4 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 transition-colors"
                  >
                    {sending ? "Sending…" : "Resend email"}
                  </button>
                </form>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Workspace -->
      <div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">Workspace</p>
        <dl class="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt class="text-zinc-400">Name</dt>
          <dd class="text-zinc-900 dark:text-zinc-100">{data.workspace?.name ?? "—"}</dd>
          <dt class="text-zinc-400">Slug</dt>
          <dd class="text-zinc-500 dark:text-zinc-400 font-mono text-xs">{data.workspace?.slug ?? "—"}</dd>
        </dl>
      </div>

      <!-- Logout -->
      <div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl p-5 flex items-center justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Log out</p>
          <p class="text-xs text-zinc-400 mt-0.5">End your session on this device.</p>
        </div>
        <form method="POST" action="/logout">
          <button
            type="submit"
            class="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            Log out
          </button>
        </form>
      </div>
    </div>
  </div>
</div>
