<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();
  let loading = $state(false);
  let showPw = $state(false);

  // Prefer the fresh token from the form roundtrip, else the one from load.
  const token = $derived(data.token ?? "");
  const badLink = $derived(!token || !!data.linkError);
</script>

<svelte:head><title>Set new password · Print Farm Companion</title></svelte:head>

<div class="min-h-screen bg-white dark:bg-[#0a0a0b] text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-6">
  <div class="w-full max-w-sm">
    <div class="mb-8">
      <a href="/landing" class="text-3xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50">New password</a>
      <p class="text-sm text-zinc-500 mt-1.5">Choose a new password for your account.</p>
    </div>

    {#if badLink}
      <div class="rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-3 text-sm text-red-700 dark:text-red-300">
        This reset link is invalid or has expired.
        <a href="/forgot-password" class="underline hover:no-underline">Request a new one</a>.
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
          <div class="rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300">
            {form.error}
          </div>
        {/if}

        <input type="hidden" name="token" value={token} />

        <label class="block">
          <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">New password</span>
          <div class="relative mt-1.5">
            <!-- svelte-ignore a11y_autofocus -->
            <input
              name="password" type={showPw ? "text" : "password"} autocomplete="new-password" required minlength="8" autofocus
              placeholder="At least 8 characters"
              class="w-full rounded-lg bg-zinc-50 dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329] pl-3.5 pr-14 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none focus:ring-0 transition-colors"
            />
            <button
              type="button" tabindex="-1" onclick={() => (showPw = !showPw)}
              class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <label class="block">
          <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Confirm password</span>
          <input
            name="confirm" type={showPw ? "text" : "password"} autocomplete="new-password" required minlength="8"
            placeholder="••••••••"
            class="mt-1.5 w-full rounded-lg bg-zinc-50 dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329] px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none focus:ring-0 transition-colors"
          />
        </label>

        <button
          type="submit" disabled={loading}
          class="w-full flex items-center justify-center gap-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium py-2.5 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-60 disabled:cursor-default transition-colors"
        >
          {#if loading}
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
            </svg>
          {/if}
          {loading ? "Saving…" : "Set new password"}
        </button>
      </form>
    {/if}

    <p class="mt-6 text-sm text-zinc-500 text-center">
      <a href="/login" class="text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Back to sign in</a>
    </p>
  </div>
</div>
