<script lang="ts">
  // Rendered inside the bare root layout (which doesn't load Tailwind), so pull
  // the global stylesheet in here — same trick as the (auth) layout.
  import "./layout.css";
  import { page } from "$app/state";

  const titles: Record<number, string> = {
    404: "Page not found",
    401: "Not signed in",
    403: "No access",
    500: "Something went wrong",
  };

  let status = $derived(page.status);
  let title = $derived(titles[status] ?? "Something went wrong");
  let detail = $derived(
    status === 404
      ? "The page you're looking for doesn't exist or may have moved."
      : (page.error?.message ?? "An unexpected error occurred."),
  );
  let user = $derived(page.data?.user ?? null);
</script>

<svelte:head><title>{status} · Print Farm Companion</title></svelte:head>

<div class="min-h-screen bg-[#0a0a0b] text-zinc-100 flex items-center justify-center p-6">
  <div class="w-full max-w-sm text-center">
    <!-- Brand -->
    <div class="mb-10 flex items-center justify-center gap-2.5">
      <span class="w-2.5 h-2.5 rounded bg-gradient-to-br from-blue-500 to-violet-500"></span>
      <span class="text-sm font-medium text-zinc-300">Print Farm Companion</span>
    </div>

    <p class="text-7xl font-extralight tracking-tight text-zinc-50">{status}</p>
    <h1 class="mt-4 text-lg font-medium text-zinc-200">{title}</h1>
    <p class="mt-2 text-sm text-zinc-500 leading-relaxed">{detail}</p>

    <div class="mt-8 flex flex-col gap-3">
      {#if user}
        <a
          href="/"
          class="w-full rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium py-2.5 hover:bg-white transition-colors"
        >
          Back to dashboard
        </a>
      {:else}
        <a
          href="/"
          class="w-full rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium py-2.5 hover:bg-white transition-colors"
        >
          Back to home
        </a>
        <a
          href="/login"
          class="w-full rounded-lg border border-[#232329] text-zinc-300 text-sm font-medium py-2.5 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
        >
          Sign in
        </a>
      {/if}
    </div>
  </div>
</div>
