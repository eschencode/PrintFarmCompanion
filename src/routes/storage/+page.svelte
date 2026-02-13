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
    if (!color) return 'bg-gradient-to-br from-slate-600 to-slate-700';
    
    const colorMap: Record<string, string> = {
      'black': 'bg-gray-900',
      'white': 'bg-white border border-slate-300',
      'red': 'bg-red-500',
      'blue': 'bg-blue-500',
      'green': 'bg-green-500',
      'yellow': 'bg-yellow-400',
      'orange': 'bg-orange-500',
      'purple': 'bg-purple-500',
      'pink': 'bg-pink-400',
      'gray': 'bg-gray-500',
      'grey': 'bg-gray-500',
      'silver': 'bg-slate-400',
      'gold': 'bg-amber-400',
      'clear': 'bg-gradient-to-br from-slate-200 to-slate-400',
      'transparent': 'bg-gradient-to-br from-slate-200 to-slate-400',
    };
    
    return colorMap[color.toLowerCase()] || 'bg-gradient-to-br from-slate-500 to-slate-600';
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

<div class="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-100">📦 Filament Storage</h1>
        <p class="text-slate-400 text-sm mt-1">
          {totalSpools} spools in stock • {presetsInStock} types available
        </p>
      </div>
      <button 
        onclick={() => showAddPresetModal = true}
        class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-2"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        New Preset
      </button>
    </div>

    <!-- Quick Add Section -->
    <div class="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-6">
      <h2 class="text-sm font-medium text-slate-400 mb-3">Quick Add Stock</h2>
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
          <label class="block text-xs text-slate-500 mb-1">Preset</label>
          <select 
            name="presetId" 
            bind:value={quickAddPresetId}
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
          <label class="block text-xs text-slate-500 mb-1">Quantity</label>
          <input 
            type="number" 
            name="quantity" 
            bind:value={quickAddQuantity}
            min="1"
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <button 
          type="submit"
          disabled={!quickAddPresetId}
          class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          Add
        </button>
      </form>
    </div>

    <!-- Inventory List -->
    <div class="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-800">
        <h2 class="text-sm font-medium text-slate-400">Inventory</h2>
      </div>
      
      {#if sortedPresets.length === 0}
        <div class="p-8 text-center text-slate-500">
          <p>No presets yet. Create one to start tracking your inventory.</p>
        </div>
      {:else}
        <div class="divide-y divide-slate-800/50">
          {#each sortedPresets as preset}
            <div class="flex items-center gap-4 px-4 py-3 hover:bg-slate-800/30 transition-colors {(preset.storage_count || 0) === 0 ? 'opacity-50' : ''}">
              <!-- Color indicator -->
              <div class="w-4 h-4 rounded-full {getColorStyle(preset.color)} shrink-0"></div>
              
              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-slate-100 truncate">{preset.name}</span>
                  <span class="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{preset.material}</span>
                </div>
                <div class="text-xs text-slate-500 truncate">
                  {preset.brand}
                  {#if preset.cost}
                    • ${preset.cost.toFixed(2)}
                  {/if}
                  • {preset.default_weight}g
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
                    class="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-center text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button type="submit" class="p-1 text-emerald-400 hover:text-emerald-300">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </button>
                  <button type="button" onclick={cancelEdit} class="p-1 text-slate-400 hover:text-slate-300">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      class="w-8 h-8 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      −
                    </button>
                  </form>
                  
                  <!-- Count (clickable to edit) -->
                  <button 
                    onclick={() => startEdit(preset.id, preset.storage_count || 0)}
                    class="w-12 h-8 flex items-center justify-center rounded bg-slate-800/50 hover:bg-slate-800 text-lg font-semibold {(preset.storage_count || 0) === 0 ? 'text-slate-500' : (preset.storage_count || 0) <= 2 ? 'text-amber-400' : 'text-slate-100'} transition-colors"
                  >
                    {preset.storage_count || 0}
                  </button>
                  
                  <!-- Increment -->
                  <form method="POST" action="?/addStock" use:enhance>
                    <input type="hidden" name="presetId" value={preset.id} />
                    <input type="hidden" name="quantity" value="1" />
                    <button 
                      type="submit"
                      class="w-8 h-8 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
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
    <div class="mt-6 text-center">
      <a href="/" class="text-slate-400 hover:text-slate-300 text-sm">← Back to Dashboard</a>
    </div>
  </div>
</div>

<!-- Add Preset Modal -->
{#if showAddPresetModal}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <h2 class="text-lg font-semibold text-slate-100">New Filament Preset</h2>
        <button 
          onclick={() => { showAddPresetModal = false; resetNewPreset(); }}
          class="p-1 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <label class="block text-sm text-slate-400 mb-1">Preset Name *</label>
          <input 
            type="text" 
            name="name" 
            bind:value={newPreset.name}
            placeholder="e.g. Black PLA Basic"
            required
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-slate-400 mb-1">Brand *</label>
            <input 
              type="text" 
              name="brand" 
              bind:value={newPreset.brand}
              placeholder="e.g. Bambu Lab"
              required
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-1">Material *</label>
            <select 
              name="material" 
              bind:value={newPreset.material}
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
            <label class="block text-sm text-slate-400 mb-1">Color</label>
            <input 
              type="text" 
              name="color" 
              bind:value={newPreset.color}
              placeholder="e.g. Black"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-1">Weight (g)</label>
            <input 
              type="number" 
              name="defaultWeight" 
              bind:value={newPreset.defaultWeight}
              min="1"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-slate-400 mb-1">Cost ($)</label>
            <input 
              type="number" 
              name="cost" 
              bind:value={newPreset.cost}
              min="0"
              step="0.01"
              placeholder="Optional"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-1">Initial Stock</label>
            <input 
              type="number" 
              name="initialStock" 
              bind:value={newPreset.initialStock}
              min="0"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <button 
            type="button"
            onclick={() => { showAddPresetModal = false; resetNewPreset(); }}
            class="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit"
            class="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
          >
            Create Preset
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
