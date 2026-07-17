<script lang="ts">
  import "../../layout.css";
  import favicon from "$lib/assets/favicon.ico";
  import { page } from "$app/stores";

  let { data, children } = $props();

  const tabs = [
    { href: "/admin", label: "Workspaces" },
    { href: "/admin/presets", label: "Presets" },
    { href: "/admin/metrics", label: "Metrics" },
  ];
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-zinc-50 dark:bg-[#0a0a0a]">
  <header class="border-b border-violet-200 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/20">
    <div class="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
      <div class="flex items-center gap-6">
        <span class="text-sm font-semibold tracking-tight text-violet-700 dark:text-violet-300">
          Operator Admin
        </span>
        <nav class="flex items-center gap-1">
          {#each tabs as tab}
            <a
              href={tab.href}
              class="px-3 h-8 inline-flex items-center rounded-lg text-sm transition-colors
                {$page.url.pathname === tab.href
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-violet-100 dark:hover:bg-violet-900/30'}"
            >
              {tab.label}
            </a>
          {/each}
        </nav>
      </div>
      <div class="flex items-center gap-4 text-sm">
        <span class="text-zinc-400 hidden sm:inline">{data.admin.email}</span>
        <a href="/" class="text-violet-600 dark:text-violet-400 hover:underline">Back to app</a>
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-6 py-8">
    {@render children()}
  </main>
</div>
