<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/stores";
  let { form } = $props();
  let loading = $state(false);
  let showPw = $state(false);
  const justReset = $derived($page.url.searchParams.get("reset") === "1");
  const redirectTo = $derived($page.url.searchParams.get("redirectTo"));
  const signupHref = $derived(
    redirectTo ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}` : "/signup",
  );
</script>

<svelte:head><title>Log in · Print Farm Companion</title></svelte:head>

<div class="min-h-screen bg-white dark:bg-[#0a0a0b] text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-6">
  <div class="w-full max-w-sm">
    <!-- Brand -->
    <div class="mb-8">
      <a href="/landing" class="text-3xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50">Print Farm</a>
      <p class="text-sm text-zinc-500 mt-1.5">Sign in to your workspace.</p>
    </div>

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
      {#if justReset}
        <div class="rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
          Password updated. Sign in with your new password.
        </div>
      {/if}

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

      <label class="block">
        <span class="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Password
          <a href="/forgot-password" class="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-normal transition-colors">Forgot?</a>
        </span>
        <div class="relative mt-1.5">
          <input
            name="password" type={showPw ? "text" : "password"} autocomplete="current-password" required
            placeholder="••••••••"
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
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>

    <p class="mt-6 text-sm text-zinc-500 text-center">
      No account yet?
      <a href={signupHref} class="text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Create one</a>
    </p>
  </div>
</div>
