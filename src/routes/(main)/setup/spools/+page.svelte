<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();
  let submitting = $state(false);

  interface CatalogItem {
    id: number;
    brand: string;
    material: string;
    color: string | null;
    color_hex: string | null;
    weight: number | null;
    vendor: string;
  }

  // Add flow mirrors the main spools modal: pick from the affiliate catalog
  // (stores catalog_item_id for exact buy links) or fall back to a custom spool.
  // See docs/affiliate-monetization.md (Phase 2).
  let step = $state<"picker" | "catalog" | "custom">("picker");
  let catalogSearch = $state("");
  let picked = $state<CatalogItem | null>(null);
  let colorHex = $state("#22c55e");

  const inputClass =
    "mt-1.5 w-full rounded-lg bg-white dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329] px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-0 transition-colors";

  const filteredCatalog = $derived(
    ((data.catalogItems as CatalogItem[]) || []).filter((c) => {
      const q = catalogSearch.trim().toLowerCase();
      if (!q) return true;
      return [c.brand, c.material, c.color]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    }),
  );

  function pickCatalogItem(c: CatalogItem) {
    picked = c;
    step = "catalog";
  }

  function resetToPicker() {
    step = "picker";
    picked = null;
    catalogSearch = "";
  }
</script>

<svelte:head><title>Set up filament · Print Farm Companion</title></svelte:head>

<div class="mb-6">
  <h1 class="text-3xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50">Your filament</h1>
  <p class="text-sm text-zinc-500 mt-2 leading-relaxed">
    Pick the spools you print with from the catalog — brand, material and color
    fill in automatically. Add more any time in Settings → Materials.
  </p>
</div>

<!-- What filament is used for -->
<div class="mb-6 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 p-4 text-xs leading-relaxed text-amber-800 dark:text-amber-200/80 space-y-1.5">
  <p><span class="font-medium">Loaded spools</span> — when you load one into a printer you pick from these presets, and every job records the filament it used.</p>
  <p><span class="font-medium">Module matching</span> — a module declares the filament it needs, so the queue only sends a job to a printer with the right material loaded.</p>
  <p><span class="font-medium">Material inventory</span> — the <span class="font-medium">in&nbsp;storage</span> count tracks unopened spools so you know when to reorder.</p>
</div>

{#if data.spoolPresets.length > 0}
  <div class="mb-6 space-y-2">
    {#each data.spoolPresets as preset}
      <div class="flex items-center gap-3 bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl px-4 py-3">
        <div
          class="w-3.5 h-3.5 rounded-full border border-zinc-200 dark:border-zinc-700"
          style="background-color: {preset.color_hex || '#9ca3af'}"
        ></div>
        <div class="flex-1">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {preset.brand} {preset.material}
            {#if preset.color}<span class="text-zinc-400">· {preset.color}</span>{/if}
          </p>
        </div>
        <!-- Storage +/- -->
        <div class="flex items-center gap-1.5">
          <form method="POST" action="?/adjustStock" use:enhance>
            <input type="hidden" name="presetId" value={preset.id} />
            <input type="hidden" name="current" value={preset.in_storage} />
            <input type="hidden" name="delta" value="-1" />
            <button
              type="submit"
              disabled={preset.in_storage <= 0}
              aria-label="Remove one spool from storage"
              class="w-7 h-7 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30 transition-colors flex items-center justify-center"
            >−</button>
          </form>
          <span class="min-w-[3.5rem] text-center text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            {preset.in_storage} <span class="text-zinc-400 dark:text-zinc-600">in&nbsp;storage</span>
          </span>
          <form method="POST" action="?/adjustStock" use:enhance>
            <input type="hidden" name="presetId" value={preset.id} />
            <input type="hidden" name="current" value={preset.in_storage} />
            <input type="hidden" name="delta" value="1" />
            <button
              type="submit"
              aria-label="Add one spool to storage"
              class="w-7 h-7 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex items-center justify-center"
            >+</button>
          </form>
        </div>
      </div>
    {/each}
  </div>
{/if}

<div class="bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl p-5 mb-6">
  <p class="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-4">
    {data.spoolPresets.length === 0 ? "Add your first filament" : "Add another filament"}
  </p>

  {#if form?.error}
    <div class="mb-4 rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-2.5 text-sm text-red-500 dark:text-red-300">
      {form.error}
    </div>
  {/if}

  {#if step === "picker"}
    <!-- Step 1: pick from the affiliate catalog -->
    <input
      type="text"
      bind:value={catalogSearch}
      placeholder="Search catalog — brand, material, color…"
      class={inputClass.replace("mt-1.5 ", "")}
    />
    <div class="mt-3 max-h-72 overflow-y-auto divide-y divide-zinc-100 dark:divide-[#1a1a22] rounded-lg border border-zinc-200/80 dark:border-[#1a1a22]">
      {#each filteredCatalog as c (c.id)}
        <button
          type="button"
          onclick={() => pickCatalogItem(c)}
          class="w-full flex items-center gap-3 py-2.5 px-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-left transition-colors"
        >
          <span
            class="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0"
            style="background-color: {c.color_hex || '#d4d4d8'}"
          ></span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
              {[c.brand, c.color].filter(Boolean).join(" ")}
            </span>
            <span class="block text-xs text-zinc-400">
              {c.material}{c.weight ? ` · ${c.weight}g` : ""}
            </span>
          </span>
          <span class="text-[10px] uppercase tracking-wide text-zinc-400 shrink-0">{c.vendor}</span>
        </button>
      {:else}
        <p class="py-6 text-center text-sm text-zinc-400">No catalog matches.</p>
      {/each}
    </div>
    <button
      type="button"
      onclick={() => (step = "custom")}
      class="mt-3 w-full px-4 py-2.5 border border-dashed border-zinc-300 dark:border-[#333] hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-300 rounded-lg transition-colors text-sm"
    >
      Can't find yours? Enter it manually →
    </button>
  {:else if step === "catalog" && picked}
    <!-- Step 2a: confirm a catalog pick (identity fixed, carried in hidden inputs) -->
    <form
      method="POST"
      action="?/addPreset"
      class="space-y-4"
      use:enhance={() => {
        submitting = true;
        return async ({ result, update }) => {
          await update({ reset: true });
          if (result.type === "success") resetToPicker();
          submitting = false;
        };
      }}
    >
      <div class="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329]">
        <span
          class="w-4 h-4 rounded-full border border-black/10 shrink-0"
          style="background-color: {picked.color_hex || '#d4d4d8'}"
        ></span>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
            {[picked.brand, picked.color].filter(Boolean).join(" ")}
          </p>
          <p class="text-xs text-zinc-400">
            {picked.material} · {picked.weight ?? 1000}g · from catalog
          </p>
        </div>
        <button
          type="button"
          onclick={resetToPicker}
          class="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 shrink-0"
        >
          Change
        </button>
      </div>

      <input type="hidden" name="catalogItemId" value={picked.id} />
      <input type="hidden" name="brand" value={picked.brand} />
      <input type="hidden" name="material" value={picked.material} />
      <input type="hidden" name="color" value={picked.color ?? ""} />
      <input type="hidden" name="colorHex" value={picked.color_hex ?? ""} />
      <input type="hidden" name="defaultWeight" value={picked.weight ?? 1000} />

      <label class="block">
        <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Spools in storage</span>
        <input name="initialStock" type="number" value="0" min="0" class={inputClass} />
      </label>

      <button
        type="submit"
        disabled={submitting}
        class="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium py-2.5 hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {submitting ? "Adding…" : "Add filament"}
      </button>
    </form>
  {:else}
    <!-- Step 2b: fully custom preset -->
    <form
      method="POST"
      action="?/addPreset"
      class="space-y-4"
      use:enhance={() => {
        submitting = true;
        return async ({ result, update }) => {
          await update({ reset: true });
          if (result.type === "success") resetToPicker();
          submitting = false;
        };
      }}
    >
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Brand</span>
          <input name="brand" required placeholder="e.g. Bambu, Prusament" class={inputClass} />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Material</span>
          <input name="material" required placeholder="e.g. PLA, PETG" class={inputClass} />
        </label>
      </div>

      <div class="grid grid-cols-[1fr_auto] gap-3 items-end">
        <label class="block">
          <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Color name</span>
          <input name="color" placeholder="e.g. Galaxy Black" class={inputClass} />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Color</span>
          <input
            name="colorHex"
            type="color"
            bind:value={colorHex}
            class="mt-1.5 h-[42px] w-14 rounded-lg bg-white dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329] cursor-pointer"
          />
        </label>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Spool weight (g)</span>
          <input name="defaultWeight" type="number" value="1000" min="1" class={inputClass} />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Spools in storage</span>
          <input name="initialStock" type="number" value="0" min="0" class={inputClass} />
        </label>
      </div>

      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={resetToPicker}
          class="shrink-0 rounded-lg border border-zinc-300 dark:border-[#232329] px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-[#15151a] transition-colors"
        >
          ← Catalog
        </button>
        <button
          type="submit"
          disabled={submitting}
          class="flex-1 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium py-2.5 hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {submitting ? "Adding…" : "Add filament"}
        </button>
      </div>
    </form>
  {/if}
</div>

<form method="POST" action="?/finish" use:enhance>
  {#if data.spoolPresets.length > 0}
    <button
      type="submit"
      class="w-full rounded-lg border border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 text-sm font-medium py-2.5 hover:bg-zinc-900 hover:text-white dark:hover:bg-zinc-100 dark:hover:text-zinc-900 transition-colors"
    >
      Done with filament & continue →
    </button>
  {:else}
    <button
      type="submit"
      class="w-full text-center text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 py-2.5 transition-colors"
    >
      Skip filament for now →
    </button>
  {/if}
</form>
