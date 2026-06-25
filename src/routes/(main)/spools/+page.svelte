<script lang="ts">
  import type { SpoolPreset, QueueSpoolDemand } from '$lib/types';
  import type { SpoolUsageStat } from '$lib/server/spools';
  import { enhance } from '$app/forms';
  import { computeDepletion, STATUS_DOT, type SpoolStatus } from '$lib/spool-status';
  import BackToDashboard from '$lib/components/BackToDashboard.svelte';

  interface PageData {
    spoolPresets: SpoolPreset[];
    usageStats: SpoolUsageStat[];
    spoolDemand: QueueSpoolDemand[];
  }

  let { data }: { data: PageData } = $props();

  let showAddPresetModal = $state(false);
  let editingPresetId = $state<number | null>(null);
  let editCount = $state(0);
  let quickAddPresetId = $state<number | null>(null);
  let quickAddQuantity = $state(1);

  let newPreset = $state({
    brand: '',
    material: 'PLA',
    color: '',
    colorHex: '',
    defaultWeight: 1000,
    cost: '',
    initialStock: 0
  });

  function resetNewPreset() {
    newPreset = {
      brand: '',
      material: 'PLA',
      color: '',
      colorHex: '',
      defaultWeight: 1000,
      cost: '',
      initialStock: 0
    };
  }

  function startEdit(presetId: number, currentCount: number) {
    editingPresetId = presetId;
    editCount = currentCount;
  }

  function cancelEdit() {
    editingPresetId = null;
    editCount = 0;
  }

  const STATUS_LABEL: Record<SpoolStatus, string> = {
    empty: 'Out of stock',
    low: 'Running low',
    ok: 'In stock'
  };

  function presetName(p: SpoolPreset): string {
    return [p.brand, p.color].filter(Boolean).join(' ') || p.material;
  }

  // Tailwind swatch fallback when no hex is stored.
  function colorClass(color: string | null): string {
    if (!color) return 'bg-zinc-300';
    const colorMap: Record<string, string> = {
      black: 'bg-zinc-900', white: 'bg-white border border-zinc-300',
      red: 'bg-red-500', blue: 'bg-blue-500', green: 'bg-green-500',
      yellow: 'bg-yellow-400', orange: 'bg-orange-500', purple: 'bg-purple-500',
      pink: 'bg-pink-400', gray: 'bg-zinc-400', grey: 'bg-zinc-400',
      silver: 'bg-zinc-300', gold: 'bg-amber-400', clear: 'bg-zinc-200',
      transparent: 'bg-zinc-200'
    };
    return colorMap[color.toLowerCase()] || 'bg-zinc-300';
  }

  // preset_id -> usage stat
  const usageById = $derived(
    new Map((data.usageStats || []).map((u) => [Number(u.preset_id), u]))
  );

  interface EnrichedPreset {
    preset: SpoolPreset;
    used7d: number;
    used30d: number;
    status: SpoolStatus;
    daysLeft: number;
  }

  const STATUS_RANK: Record<SpoolStatus, number> = { empty: 0, low: 1, ok: 2 };

  const enriched = $derived<EnrichedPreset[]>(
    (data.spoolPresets || [])
      .map((preset) => {
        const u = usageById.get(Number(preset.id));
        const used7d = u?.used_7d ?? 0;
        const used30d = u?.used_30d ?? 0;
        const { status, daysLeft } = computeDepletion(preset.in_storage ?? 0, used30d);
        return { preset, used7d, used30d, status, daysLeft };
      })
      .sort((a, b) => {
        // Empty preset with no usage is dead weight — push to bottom.
        const aActive = (a.preset.in_storage ?? 0) > 0 || a.used30d > 0;
        const bActive = (b.preset.in_storage ?? 0) > 0 || b.used30d > 0;
        if (aActive !== bActive) return aActive ? -1 : 1;
        // Then by urgency (empty/low first), then by name.
        if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
          return STATUS_RANK[a.status] - STATUS_RANK[b.status];
        }
        return presetName(a.preset).localeCompare(presetName(b.preset));
      })
  );

  const totalSpools = $derived(
    (data.spoolPresets || []).reduce((sum, p) => sum + (p.in_storage || 0), 0)
  );
  const presetsInStock = $derived(
    (data.spoolPresets || []).filter((p) => (p.in_storage || 0) > 0).length
  );
  const lowOrEmpty = $derived(
    enriched.filter((e) => e.status !== 'ok' && ((e.preset.in_storage ?? 0) > 0 || e.used30d > 0)).length
  );

  // Order plan: at the current 30-day usage rate, projected demand over the next
  // 30 days equals used30d. Order enough to cover that minus what's in storage.
  interface OrderItem {
    preset: SpoolPreset;
    needed: number;
    used30d: number;
  }
  const orderPlan = $derived<OrderItem[]>(
    enriched
      .map((e) => ({
        preset: e.preset,
        used30d: e.used30d,
        needed: Math.max(0, Math.ceil(e.used30d - (e.preset.in_storage ?? 0))),
      }))
      .filter((o) => o.needed > 0)
      .sort((a, b) => b.needed - a.needed)
  );
  const totalToOrder = $derived(orderPlan.reduce((sum, o) => sum + o.needed, 0));

  // Deficits against the actual print queue backlog — sharper than the 30-day
  // usage extrapolation above (it reflects what's literally queued to print).
  const queueDeficits = $derived(
    (data.spoolDemand || []).filter((d) => d.grams_deficit > 0)
  );

  function daysLeftLabel(e: EnrichedPreset): string {
    if ((e.preset.in_storage ?? 0) === 0) return 'empty';
    if (!isFinite(e.daysLeft)) return 'no recent usage';
    return `~${Math.round(e.daysLeft)}d left`;
  }
</script>

<svelte:head>
  <title>Spools | Print Farm Companion</title>
</svelte:head>

<div class="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 p-6 sm:p-8">
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-medium text-zinc-900 dark:text-zinc-50">Spools</h1>
        <p class="text-zinc-500 text-sm mt-1">
          {totalSpools} in storage · {presetsInStock} types
          {#if lowOrEmpty > 0}
            · <span class="text-amber-600 dark:text-amber-500">{lowOrEmpty} need restock</span>
          {/if}
        </p>
      </div>
      <div class="flex items-center gap-4">
        <BackToDashboard />
        <button
          onclick={() => showAddPresetModal = true}
          class="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-white rounded-md transition-colors flex items-center gap-2 text-sm"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
          </svg>
          New Spool
        </button>
      </div>
    </div>

    <!-- Quick Add Section -->
    <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-4 mb-6">
      <h2 class="text-sm font-medium text-zinc-500 mb-3">Quick Add Stock</h2>
      <form
        method="POST"
        action="?/addStock"
        use:enhance={() => {
          return async ({ update }) => {
            await update();
            quickAddQuantity = 1;
          };
        }}
        class="flex flex-wrap items-end gap-3"
      >
        <div class="flex-1 min-w-[200px]">
          <label for="storage-preset-id" class="block text-xs text-zinc-500 mb-1">Spool</label>
          <select
            id="storage-preset-id"
            name="presetId"
            bind:value={quickAddPresetId}
            class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 text-sm"
          >
            <option value={null}>Select a spool...</option>
            {#each enriched as { preset }}
              <option value={preset.id}>
                {presetName(preset)} ({preset.material}) - {preset.in_storage || 0} in stock
              </option>
            {/each}
          </select>
        </div>
        <div class="w-24">
          <label for="storage-qty" class="block text-xs text-zinc-500 mb-1">Quantity</label>
          <input
            id="storage-qty"
            type="number"
            name="quantity"
            bind:value={quickAddQuantity}
            min="1"
            class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={!quickAddPresetId}
          class="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white rounded-md transition-colors text-sm"
        >
          Add
        </button>
      </form>
    </div>

    <!-- Order Plan -->
    <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-4 mb-6">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h2 class="text-sm font-medium text-zinc-500">Order plan · next 30 days</h2>
          <p class="text-[11px] text-zinc-400 dark:text-zinc-600 mt-0.5">Based on the last 30 days of usage</p>
        </div>
        {#if totalToOrder > 0}
          <span class="text-xs font-medium text-amber-600 dark:text-amber-500 tabular-nums shrink-0">{totalToOrder} to order</span>
        {/if}
      </div>

      {#if orderPlan.length === 0}
        <p class="text-sm text-zinc-400 dark:text-zinc-500">You're stocked for the next 30 days at the current usage rate.</p>
      {:else}
        <div class="space-y-1.5">
          {#each orderPlan as o (o.preset.id)}
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="flex items-center gap-2 min-w-0">
                {#if o.preset.color_hex}
                  <span class="w-3 h-3 rounded-full border border-black/10 shrink-0" style="background-color: {o.preset.color_hex}"></span>
                {:else}
                  <span class="w-3 h-3 rounded-full shrink-0 {colorClass(o.preset.color)}"></span>
                {/if}
                <span class="truncate text-zinc-700 dark:text-zinc-300">{presetName(o.preset)}</span>
                <span class="text-xs text-zinc-400 dark:text-zinc-600 shrink-0">{o.preset.material}</span>
              </span>
              <span class="tabular-nums font-medium text-zinc-900 dark:text-zinc-50 shrink-0">+{o.needed}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Queue-driven deficits -->
    {#if queueDeficits.length > 0}
      <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-4 mb-6">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h2 class="text-sm font-medium text-zinc-500">Needed for the print queue</h2>
            <p class="text-[11px] text-zinc-400 dark:text-zinc-600 mt-0.5">Filament the current backlog requires that isn't on hand</p>
          </div>
        </div>
        <div class="space-y-1.5">
          {#each queueDeficits as d (d.preset_id)}
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="flex items-center gap-2 min-w-0">
                {#if d.color_hex}
                  <span class="w-3 h-3 rounded-full border border-black/10 shrink-0" style="background-color: {d.color_hex}"></span>
                {/if}
                <span class="truncate text-zinc-700 dark:text-zinc-300">{d.preset_label}</span>
              </span>
              <span class="tabular-nums font-medium text-red-600 dark:text-red-500 shrink-0">
                -{d.grams_deficit}g · buy {d.spools_to_buy}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Spool List -->
    <div class="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg overflow-hidden">
      <div class="px-4 py-3 border-b border-zinc-200 dark:border-[#262626] flex items-center justify-between">
        <h2 class="text-sm font-medium text-zinc-500">Inventory</h2>
        <span class="text-xs text-zinc-400 dark:text-zinc-500">used 7d / 30d</span>
      </div>

      {#if enriched.length === 0}
        <div class="p-8 text-center text-zinc-400 dark:text-zinc-500">
          <p>No spools yet. Add one to start tracking your inventory.</p>
        </div>
      {:else}
        <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
          {#each enriched as e (e.preset.id)}
            {@const preset = e.preset}
            <div class="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors {(preset.in_storage || 0) === 0 ? 'opacity-50' : ''}">
              <!-- Status dot (depletion) over color swatch -->
              <div class="relative shrink-0">
                {#if preset.color_hex}
                  <div class="w-3.5 h-3.5 rounded-full border border-black/10" style="background-color: {preset.color_hex}"></div>
                {:else}
                  <div class="w-3.5 h-3.5 rounded-full {colorClass(preset.color)}"></div>
                {/if}
                <span
                  class="absolute -top-1 -right-1 w-2 h-2 rounded-full ring-1 ring-white dark:ring-[#111111] {STATUS_DOT[e.status]}"
                  title="{STATUS_LABEL[e.status]} · {daysLeftLabel(e)}"
                ></span>
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-zinc-900 dark:text-zinc-50 truncate text-sm">{presetName(preset)}</span>
                  <span class="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-sm">{preset.material}</span>
                </div>
                <div class="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                  {#if preset.cost}
                    ${preset.cost.toFixed(2)} ·
                  {/if}
                  {preset.default_weight}g
                  · <span class="{e.status === 'empty' ? 'text-red-500' : e.status === 'low' ? 'text-amber-600 dark:text-amber-500' : ''}">{daysLeftLabel(e)}</span>
                </div>
              </div>

              <!-- Usage counts -->
              <div class="text-right shrink-0 tabular-nums">
                <div class="text-sm text-zinc-700 dark:text-zinc-300">{e.used7d} / {e.used30d}</div>
                <div class="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wide">used</div>
              </div>

              <!-- Stock count / Edit -->
              {#if editingPresetId === preset.id}
                <form
                  method="POST"
                  action="?/setStock"
                  use:enhance={() => {
                    return async ({ update }) => {
                      await update();
                      cancelEdit();
                    };
                  }}
                  class="flex items-center gap-2"
                >
                  <input type="hidden" name="presetId" value={preset.id} />
                  <input
                    type="number"
                    name="count"
                    bind:value={editCount}
                    min="0"
                    class="w-16 bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-sm px-2 py-1 text-center text-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 text-sm"
                  />
                  <button type="submit" aria-label="Save" class="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </button>
                  <button type="button" aria-label="Cancel" onclick={cancelEdit} class="p-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </form>
              {:else}
                <div class="flex items-center gap-1">
                  <!-- Decrement -->
                  <form method="POST" action="?/removeStock" use:enhance>
                    <input type="hidden" name="presetId" value={preset.id} />
                    <input type="hidden" name="quantity" value="1" />
                    <button
                      type="submit"
                      disabled={(preset.in_storage || 0) === 0}
                      class="w-7 h-7 flex items-center justify-center rounded-sm bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      −
                    </button>
                  </form>

                  <!-- Count (clickable to edit) -->
                  <button
                    onclick={() => startEdit(preset.id, preset.in_storage || 0)}
                    class="w-10 h-7 flex items-center justify-center rounded-sm bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-sm font-medium {(preset.in_storage || 0) === 0 ? 'text-zinc-300' : (preset.in_storage || 0) <= 2 ? 'text-amber-600' : 'text-zinc-900 dark:text-zinc-50'} transition-colors"
                  >
                    {preset.in_storage || 0}
                  </button>

                  <!-- Increment -->
                  <form method="POST" action="?/addStock" use:enhance>
                    <input type="hidden" name="presetId" value={preset.id} />
                    <input type="hidden" name="quantity" value="1" />
                    <button
                      type="submit"
                      class="w-7 h-7 flex items-center justify-center rounded-sm bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors text-sm"
                    >
                      +
                    </button>
                  </form>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

  </div>
</div>

<!-- Add Preset Modal -->
{#if showAddPresetModal}
  <div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
    <div class="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg w-full max-w-md">
      <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-[#262626]">
        <h2 class="text-base font-medium text-zinc-900 dark:text-zinc-50">New Spool</h2>
        <button
          aria-label="Close"
          onclick={() => { showAddPresetModal = false; resetNewPreset(); }}
          class="p-1 text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <form
        method="POST"
        action="?/createPreset"
        use:enhance={() => {
          return async ({ result, update }) => {
            if (result.type === 'success') {
              showAddPresetModal = false;
              resetNewPreset();
            }
            await update();
          };
        }}
        class="p-5 space-y-4"
      >
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="new-preset-brand" class="block text-sm text-zinc-500 mb-1">Brand *</label>
            <input
              id="new-preset-brand"
              type="text"
              name="brand"
              bind:value={newPreset.brand}
              placeholder="e.g. Bambu Lab"
              required
              class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 text-sm"
            />
          </div>
          <div>
            <label for="new-preset-material" class="block text-sm text-zinc-500 mb-1">Material *</label>
            <select
              id="new-preset-material"
              name="material"
              bind:value={newPreset.material}
              class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 text-sm"
            >
              <option value="PLA">PLA</option>
              <option value="PETG">PETG</option>
              <option value="ABS">ABS</option>
              <option value="TPU">TPU</option>
              <option value="ASA">ASA</option>
              <option value="Nylon">Nylon</option>
              <option value="PC">PC</option>
              <option value="PLA+">PLA+</option>
              <option value="PLA Silk">PLA Silk</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="new-preset-color" class="block text-sm text-zinc-500 mb-1">Color</label>
            <input
              id="new-preset-color"
              type="text"
              name="color"
              bind:value={newPreset.color}
              placeholder="e.g. Black"
              class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 text-sm"
            />
          </div>
          <div>
            <label for="new-preset-hex" class="block text-sm text-zinc-500 mb-1">Swatch</label>
            <input
              id="new-preset-hex"
              type="color"
              name="colorHex"
              bind:value={newPreset.colorHex}
              class="w-full h-[42px] bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-1 py-1 cursor-pointer"
            />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div>
            <label for="new-preset-weight" class="block text-sm text-zinc-500 mb-1">Weight (g)</label>
            <input
              id="new-preset-weight"
              type="number"
              name="defaultWeight"
              bind:value={newPreset.defaultWeight}
              min="1"
              class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 text-sm"
            />
          </div>
          <div>
            <label for="new-preset-cost" class="block text-sm text-zinc-500 mb-1">Cost ($)</label>
            <input
              id="new-preset-cost"
              type="number"
              name="cost"
              bind:value={newPreset.cost}
              min="0"
              step="0.01"
              placeholder="Optional"
              class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 text-sm"
            />
          </div>
          <div>
            <label for="new-preset-stock" class="block text-sm text-zinc-500 mb-1">Stock</label>
            <input
              id="new-preset-stock"
              type="number"
              name="initialStock"
              bind:value={newPreset.initialStock}
              min="0"
              class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 text-sm"
            />
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <button
            type="button"
            onclick={() => { showAddPresetModal = false; resetNewPreset(); }}
            class="flex-1 px-4 py-2 bg-transparent border border-zinc-200 dark:border-[#262626] hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="flex-1 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-white rounded-md transition-colors text-sm"
          >
            Create Spool
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
