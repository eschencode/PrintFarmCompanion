<script lang="ts">
  import { page } from "$app/stores";
  let { children } = $props();

  const steps = [
    { key: "printers", label: "Printers", href: "/setup/printers" },
    { key: "spools", label: "Filament", href: "/setup/spools" },
    { key: "modules", label: "Modules", href: "/setup/modules" },
    { key: "inventory", label: "Inventory", href: "/setup/inventory" },
    { key: "dashboard", label: "Dashboard", href: "/setup/dashboard" },
    { key: "stats", label: "Stats", href: "/setup/stats" },
  ];
  const activeIdx = $derived(
    steps.findIndex((s) => $page.url.pathname.startsWith(s.href)),
  );
</script>

<div class="min-h-screen bg-white dark:bg-[#0a0a0b] text-zinc-900 dark:text-zinc-100">
  <div class="max-w-xl mx-auto px-6 pt-10 pb-16">
    <!-- Step indicator -->
    <div class="flex items-center justify-between mb-10">
      <div class="flex items-center gap-2">
        {#each steps as step, i}
          <a
            href={step.href}
            class="flex items-center gap-2 text-xs {i === activeIdx
              ? 'text-zinc-900 dark:text-zinc-100 font-medium'
              : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400'} transition-colors"
          >
            <span
              class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold {i === activeIdx
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'border border-zinc-300 dark:border-zinc-700'}"
            >
              {i + 1}
            </span>
            {#if i === activeIdx}{step.label}{/if}
          </a>
          {#if i < steps.length - 1}
            <div class="w-3 h-px bg-zinc-200 dark:bg-zinc-800"></div>
          {/if}
        {/each}
      </div>
      <a
        href="/"
        class="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
      >
        Continue later →
      </a>
    </div>

    {@render children()}
  </div>
</div>
