<script lang="ts">
  import type { SpoolPreset } from '$lib/types';
  import { enhance } from '$app/forms';

  interface PageData {
    spoolPresets: SpoolPreset[];
  }

  let { data }: { data: PageData } = $props();

  let showAddPresetModal = $state(false);
  let editingPresetId = $state<number | null>(null);
  let editCount = $state(0);
  let quickAddPresetId = $state<number | null>(null);
  let quickAddQuantity = $state(1);

  // Form fields for new preset
  let newPreset = $state({
    name: '',
    brand: '',
    material: 'PLA',
    color: '',
    defaultWeight: 1000,
    cost: '',
    initialStock: 0
  });

  function resetNewPreset() {
    newPreset = {
      name: '',
      brand: '',
      material: 'PLA',
      color: '',
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

  // Color helper
  function getColorStyle(color: string | null): string {
    if (!color) return 'bg-zinc-300';

    const colorMap: Record<string, string> = {
      'black': 'bg-zinc-900',
      'white': 'bg-white border border-zinc-300',
      'red': 'bg-red-500',
      'blue': 'bg-blue-500',
      'green': 'bg-green-500',
      'yellow': 'bg-yellow-400',
      'orange': 'bg-orange-500',
      'purple': 'bg-purple-500',
      'pink': 'bg-pink-400',
      'gray': 'bg-zinc-400',
      'grey': 'bg-zinc-400',
      'silver': 'bg-zinc-300',
      'gold': 'bg-amber-400',
      'clear': 'bg-zinc-200',
      'transparent': 'bg-zinc-200',
    };

    return colorMap[color.toLowerCase()] || 'bg-zinc-300';
  }

  // Sort presets: in-stock first, then alphabetically
  const sortedPresets = $derived(
    [...(data.spoolPresets || [])].sort((a, b) => {
      // First by stock (in-stock first)
      if ((a.storage_count || 0) > 0 && (b.storage_count || 0) === 0) return -1;
      if ((a.storage_count || 0) === 0 && (b.storage_count || 0) > 0) return 1;
      // Then alphabetically by name
      return a.name.localeCompare(b.name);
    })
  );

  const totalSpools = $derived(
    (data.spoolPresets || []).reduce((sum, p) => sum + (p.storage_count || 0), 0)
  );

  const presetsInStock = $derived(
    (data.spoolPresets || []).filter(p => (p.storage_count || 0) > 0).length
  );
</script>

<svelte:head>
  <title>Filament Storage | Print Farm Companion</title>
</svelte:head>

<div class="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 p-6 sm:p-8">
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-medium text-zinc-900 dark:text-zinc-50">Filament Storage</h1>
        <p class="text-zinc-500 text-sm mt-1">
          {totalSpools} spools in stock · {presetsInStock} types available
        </p>
      </div>
      <button
        onclick={() => showAddPresetModal = true}
        class="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-white rounded-md transition-colors flex items-center gap-2 text-sm"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        New Preset
      </button>
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
          <label for="storage-preset-id" class="block text-xs text-zinc-500 mb-1">Preset</label>
          <select
            id="storage-preset-id"
            name="presetId"
            bind:value={quickAddPresetId}
            class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 text-sm"
          >
            <option value={null}>Select a preset...</option>
            {#each sortedPresets as preset}
              <option value={preset.id}>
                {preset.name} ({preset.material}) - {preset.storage_count || 0} in stock
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

    <!-- Inventory List -->
    <div class="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg overflow-hidden">
      <div class="px-4 py-3 border-b border-zinc-200 dark:border-[#262626]">
        <h2 class="text-sm font-medium text-zinc-500">Inventory</h2>
      </div>

      {#if sortedPresets.length === 0}
        <div class="p-8 text-center text-zinc-400 dark:text-zinc-500">
          <p>No presets yet. Create one to start tracking your inventory.</p>
        </div>
      {:else}
        <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
          {#each sortedPresets as preset}
            <div class="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors {(preset.storage_count || 0) === 0 ? 'opacity-40' : ''}">
              <!-- Color indicator -->
              <div class="w-3 h-3 rounded-full {getColorStyle(preset.color)} shrink-0"></div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-zinc-900 dark:text-zinc-50 truncate text-sm">{preset.name}</span>
                  <span class="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-sm">{preset.material}</span>
                </div>
                <div class="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                  {preset.brand}
                  {#if preset.cost}
                    · ${preset.cost.toFixed(2)}
                  {/if}
                  · {preset.default_weight}g
                </div>
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
                      disabled={(preset.storage_count || 0) === 0}
                      class="w-7 h-7 flex items-center justify-center rounded-sm bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      −
                    </button>
                  </form>

                  <!-- Count (clickable to edit) -->
                  <button
                    onclick={() => startEdit(preset.id, preset.storage_count || 0)}
                    class="w-10 h-7 flex items-center justify-center rounded-sm bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-sm font-medium {(preset.storage_count || 0) === 0 ? 'text-zinc-300' : (preset.storage_count || 0) <= 2 ? 'text-amber-600' : 'text-zinc-900'} transition-colors"
                  >
                    {preset.storage_count || 0}
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

    <!-- Back to Dashboard -->
    <div class="mt-8 text-center">
      <a href="/" class="text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 text-sm">← Back to Dashboard</a>
    </div>
  </div>
</div>

<!-- Add Preset Modal -->
{#if showAddPresetModal}
  <div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
    <div class="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg w-full max-w-md">
      <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-[#262626]">
        <h2 class="text-base font-medium text-zinc-900 dark:text-zinc-50">New Filament Preset</h2>
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
        <div>
          <label for="new-preset-name" class="block text-sm text-zinc-500 mb-1">Preset Name *</label>
          <input
            id="new-preset-name"
            type="text"
            name="name"
            bind:value={newPreset.name}
            placeholder="e.g. Black PLA Basic"
            required
            class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 text-sm"
          />
        </div>

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
        </div>

        <div class="grid grid-cols-2 gap-4">
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
            <label for="new-preset-stock" class="block text-sm text-zinc-500 mb-1">Initial Stock</label>
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
            Create Preset
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
