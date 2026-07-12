<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/stores";
  let { form } = $props();
  let loading = $state(false);
  const justReset = $derived($page.url.searchParams.get("reset") === "1");
</script>

<svelte:head><title>Log in · Print Farm Companion</title></svelte:head>

<div class="min-h-screen bg-[#0a0a0b] text-zinc-100 flex items-center justify-center p-6">
  <div class="w-full max-w-sm">
    <!-- Brand -->
    <div class="mb-8">
      <h1 class="text-3xl font-extralight tracking-tight text-zinc-50">Print Farm</h1>
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
        <div class="rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5 text-sm text-emerald-300">
          Password updated. Sign in with your new password.
        </div>
      {/if}

      {#if form?.error}
        <div class="rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-2.5 text-sm text-red-300">
          {form.error}
        </div>
      {/if}

      <label class="block">
        <span class="text-xs font-medium text-zinc-400">Email</span>
        <input
          name="email" type="email" autocomplete="email" required
          value={form?.email ?? ""} placeholder="you@example.com"
          class="mt-1.5 w-full rounded-lg bg-[#0f0f11] border border-[#232329] px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-0 transition-colors"
        />
      </label>

      <label class="block">
        <span class="flex items-center justify-between text-xs font-medium text-zinc-400">
          Password
          <a href="/forgot-password" class="text-zinc-500 hover:text-zinc-300 font-normal transition-colors">Forgot?</a>
        </span>
        <input
          name="password" type="password" autocomplete="current-password" required
          placeholder="••••••••"
          class="mt-1.5 w-full rounded-lg bg-[#0f0f11] border border-[#232329] px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-0 transition-colors"
        />
      </label>

      <button
        type="submit" disabled={loading}
        class="w-full rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium py-2.5 hover:bg-white disabled:opacity-60 disabled:cursor-default transition-colors"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>

    <p class="mt-6 text-sm text-zinc-500 text-center">
      No account yet?
      <a href="/signup" class="text-zinc-300 hover:text-zinc-100 transition-colors">Create one</a>
    </p>
  </div>
</div>
