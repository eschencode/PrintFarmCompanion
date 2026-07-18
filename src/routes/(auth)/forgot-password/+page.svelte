<script lang="ts">
  import { enhance } from "$app/forms";
  let { form } = $props();
  let loading = $state(false);
</script>

<svelte:head><title>Reset password · Print Farm Companion</title></svelte:head>

<div class="min-h-screen bg-white dark:bg-[#0a0a0b] text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-6">
  <div class="w-full max-w-sm">
    <div class="mb-8">
      <a href="/landing" class="text-3xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50">Reset password</a>
      <p class="text-sm text-zinc-500 mt-1.5">We'll email you a link to set a new one.</p>
    </div>

    {#if form?.sent}
      <div class="rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-3 text-sm text-emerald-700 dark:text-emerald-300">
        If an account exists for <span class="font-medium">{form.email}</span>, a reset link is on its way. Check your inbox.
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

        <label class="block">
          <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Email</span>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            name="email" type="email" autocomplete="email" required autofocus
            value={form?.email ?? ""} placeholder="you@example.com"
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
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
    {/if}

    <p class="mt-6 text-sm text-zinc-500 text-center">
      <a href="/login" class="text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Back to sign in</a>
    </p>
  </div>
</div>
