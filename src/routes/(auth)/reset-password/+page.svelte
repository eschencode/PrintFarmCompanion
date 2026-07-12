<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();
  let loading = $state(false);

  // Prefer the fresh token from the form roundtrip, else the one from load.
  const token = $derived(data.token ?? "");
  const badLink = $derived(!token || !!data.linkError);
</script>

<svelte:head><title>Set new password · Print Farm Companion</title></svelte:head>

<div class="min-h-screen bg-[#0a0a0b] text-zinc-100 flex items-center justify-center p-6">
  <div class="w-full max-w-sm">
    <div class="mb-8">
      <h1 class="text-3xl font-extralight tracking-tight text-zinc-50">New password</h1>
      <p class="text-sm text-zinc-500 mt-1.5">Choose a new password for your account.</p>
    </div>

    {#if badLink}
      <div class="rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-3 text-sm text-red-300">
        This reset link is invalid or has expired.
        <a href="/forgot-password" class="underline hover:text-red-200">Request a new one</a>.
      </div>
    {:else}
      <form
        method="POST"
        class="space-y-4"
        use:enhance={() => {
          loading = true;
          return async ({ update }) => {
            await update();
            loading = false;
          };
        }}
      >
        {#if form?.error}
          <div class="rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-2.5 text-sm text-red-300">
            {form.error}
          </div>
        {/if}

        <input type="hidden" name="token" value={token} />

        <label class="block">
          <span class="text-xs font-medium text-zinc-400">New password</span>
          <input
            name="password" type="password" autocomplete="new-password" required minlength="8"
            placeholder="••••••••"
            class="mt-1.5 w-full rounded-lg bg-[#0f0f11] border border-[#232329] px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-0 transition-colors"
          />
        </label>

        <label class="block">
          <span class="text-xs font-medium text-zinc-400">Confirm password</span>
          <input
            name="confirm" type="password" autocomplete="new-password" required minlength="8"
            placeholder="••••••••"
            class="mt-1.5 w-full rounded-lg bg-[#0f0f11] border border-[#232329] px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-0 transition-colors"
          />
        </label>

        <button
          type="submit" disabled={loading}
          class="w-full rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium py-2.5 hover:bg-white disabled:opacity-60 disabled:cursor-default transition-colors"
        >
          {loading ? "Saving…" : "Set new password"}
        </button>
      </form>
    {/if}

    <p class="mt-6 text-sm text-zinc-500 text-center">
      <a href="/login" class="text-zinc-300 hover:text-zinc-100 transition-colors">Back to sign in</a>
    </p>
  </div>
</div>
