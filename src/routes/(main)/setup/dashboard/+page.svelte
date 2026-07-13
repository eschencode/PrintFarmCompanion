<script lang="ts">
  import { enhance } from "$app/forms";
  import type { GridCell } from "$lib/types";
  let { data, form } = $props();

  // Types a user can place here — the dashboard cells, no onboarding 'setup' type.
  const cellTypes: GridCell["type"][] = [
    "empty", "printer", "stats", "spools", "modules", "inventory", "products", "settings",
  ];
  const cellLabel: Record<string, string> = {
    empty: "Empty", printer: "Printer", stats: "Stats", spools: "Spools",
    modules: "Modules", inventory: "Inventory", products: "Products", settings: "Settings",
  };
  // Full class strings so Tailwind JIT keeps them.
  const cellColor: Record<string, string> = {
    empty: "bg-zinc-50 dark:bg-[#161616] text-zinc-400 border-zinc-200 dark:border-[#262626]",
    printer: "bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/40",
    stats: "bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-900/40",
    spools: "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/40",
    modules: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40",
    inventory: "bg-teal-100 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/40",
    products: "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/40",
    settings: "bg-zinc-200 dark:bg-[#2a2a2a] text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-[#333]",
  };

  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

  interface Page { name: string; rows: number; cols: number; config: GridCell[] }

  /** The premade layout: every printer + one of each tool, auto-sized to a 3-wide grid. */
  function buildPremade(): Page {
    const cells: GridCell[] = [
      ...data.printers.map((p) => ({ type: "printer" as const, printerId: p.id })),
      { type: "stats" }, { type: "spools" }, { type: "modules" },
      { type: "inventory" }, { type: "products" }, { type: "settings" },
    ];
    const cols = 3;
    const rows = clamp(Math.ceil(cells.length / cols), 1, 6);
    return { name: "Default", rows, cols, config: fit(cells, rows * cols) };
  }

  /** Pad/trim a cell list to exactly `total` cells. */
  function fit(cells: GridCell[], total: number): GridCell[] {
    const out = cells.slice(0, total);
    while (out.length < total) out.push({ type: "empty" });
    return out;
  }

  let pages = $state<Page[]>([buildPremade()]);
  let active = $state(0);
  const page = $derived(pages[active]);

  function resize() {
    const p = pages[active];
    p.config = fit(p.config, p.rows * p.cols);
    pages = [...pages];
  }

  function cycleCell(i: number) {
    const p = pages[active];
    const curr = p.config[i].type;
    const next = cellTypes[(cellTypes.indexOf(curr) + 1) % cellTypes.length];
    p.config[i] = next === "printer" ? { type: "printer" } : { type: next };
    pages = [...pages];
  }

  function assignPrinter(i: number, value: string) {
    pages[active].config[i] = { type: "printer", printerId: Number(value) };
    pages = [...pages];
  }

  function addPage() {
    if (pages.length >= 3) return;
    pages = [...pages, { name: `Page ${pages.length + 1}`, rows: 3, cols: 3, config: fit([], 9) }];
    active = pages.length - 1;
  }

  function removePage(i: number) {
    pages = pages.filter((_, j) => j !== i);
    active = Math.max(0, active - (i <= active ? 1 : 0));
  }

  function resetPage() {
    if (active === 0) pages[0] = buildPremade();
    else pages[active] = { name: pages[active].name, rows: 3, cols: 3, config: fit([], 9) };
    pages = [...pages];
  }

  const pagesJson = $derived(JSON.stringify(pages));
</script>

<svelte:head><title>Arrange your dashboard · Print Farm Companion</title></svelte:head>

<div class="mb-6">
  <h1 class="text-3xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50">Your dashboard</h1>
  <p class="text-sm text-zinc-500 mt-2 leading-relaxed">
    We've laid out every printer and tool for you. This is just a starting point —
    click any cell to change what it shows, resize the grid, or split it into pages.
    You can always tweak it (and colors, animations) later in Settings → Dashboard.
  </p>
</div>

<!-- Page tabs -->
<div class="flex items-center gap-2 mb-4">
  {#each pages as p, i}
    <button
      type="button"
      onclick={() => (active = i)}
      class="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors {i === active
        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
        : 'bg-zinc-100 dark:bg-[#161616] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'}"
    >
      {p.name || `Page ${i + 1}`}
      {#if pages.length > 1}
        <span
          role="button"
          tabindex="0"
          aria-label="Remove page"
          onclick={(e) => { e.stopPropagation(); removePage(i); }}
          onkeydown={(e) => { if (e.key === "Enter") { e.stopPropagation(); removePage(i); } }}
          class="opacity-50 hover:opacity-100"
        >×</span>
      {/if}
    </button>
  {/each}
  {#if pages.length < 3}
    <button
      type="button"
      onclick={addPage}
      class="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 border border-dashed border-zinc-300 dark:border-zinc-700 transition-colors"
    >
      + Page
    </button>
  {/if}
</div>

<div class="bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl p-5 mb-6">
  <!-- Controls -->
  <div class="flex items-end gap-3 mb-5">
    <label class="block">
      <span class="text-[10px] text-zinc-400 block mb-1">Rows</span>
      <input
        type="number" min="1" max="6" bind:value={page.rows} onchange={resize}
        class="w-16 bg-white dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 transition-colors"
      />
    </label>
    <span class="text-zinc-400 pb-2">×</span>
    <label class="block">
      <span class="text-[10px] text-zinc-400 block mb-1">Columns</span>
      <input
        type="number" min="1" max="6" bind:value={page.cols} onchange={resize}
        class="w-16 bg-white dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 transition-colors"
      />
    </label>
    <button
      type="button" onclick={resetPage}
      class="ml-auto text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors pb-2"
    >
      {active === 0 ? "Reset to suggested" : "Clear page"}
    </button>
  </div>

  <p class="text-[11px] text-zinc-400 mb-3">Click a cell to change what it shows. Printer cells get a selector.</p>

  <div class="grid gap-2" style="grid-template-columns: repeat({page.cols}, 1fr);">
    {#each page.config as cell, i}
      <div class="rounded-lg border {cellColor[cell.type] ?? cellColor.empty} p-2 min-h-[72px] flex flex-col gap-1.5">
        <button
          type="button" onclick={() => cycleCell(i)}
          class="w-full text-left text-xs font-medium hover:opacity-70 transition-opacity"
          aria-label="Cycle type for cell {i + 1}, currently {cell.type}"
        >
          {cellLabel[cell.type] ?? cell.type}
        </button>
        {#if cell.type === "printer"}
          <select
            value={cell.printerId ?? ""}
            onchange={(e) => assignPrinter(i, e.currentTarget.value)}
            class="mt-auto w-full bg-white/50 dark:bg-black/20 rounded px-1.5 py-0.5 text-[10px] border-0 focus:outline-none focus:ring-1 focus:ring-current/30"
            aria-label="Assign printer to cell {i + 1}"
          >
            <option value="">— printer —</option>
            {#each data.printers as printer}
              <option value={printer.id}>{printer.name}</option>
            {/each}
          </select>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Legend -->
  <div class="flex flex-wrap gap-1.5 mt-4">
    {#each cellTypes as type}
      <span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full {cellColor[type]} border">
        {cellLabel[type]}
      </span>
    {/each}
  </div>
</div>

{#if form?.error}
  <div class="rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-2.5 text-sm text-red-500 dark:text-red-300 mb-4">
    {form.error}
  </div>
{/if}

<div class="flex items-center gap-3">
  <form method="POST" action="?/save" class="flex-1" use:enhance>
    <input type="hidden" name="pages" value={pagesJson} />
    <button
      type="submit"
      class="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium py-2.5 hover:opacity-90 transition-opacity"
    >
      Save layout & continue →
    </button>
  </form>
  <form method="POST" action="?/skip" use:enhance>
    <button
      type="submit"
      class="px-5 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
    >
      Keep default
    </button>
  </form>
</div>
