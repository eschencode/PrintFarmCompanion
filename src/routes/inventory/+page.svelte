<script lang="ts">
  import type { InventoryItem, InventoryLog } from '$lib/types';
  import { enhance } from '$app/forms';

  interface PageData {
    items: InventoryItem[];
    logs: (InventoryLog & { item_name: string })[];
  }

  let { data }: { data: PageData } = $props();

  // Edit state
  let editingItemId = $state<number | null>(null);
  let editCount = $state(0);
  let editReason = $state('');

  // Filter/search
  let searchQuery = $state('');
  let showLowStockOnly = $state(false);

  // Start editing an item's stock
  function startEdit(item: InventoryItem) {
    editingItemId = item.id;
    editCount = item.stock_count;
    editReason = '';
  }

  function cancelEdit() {
    editingItemId = null;
    editCount = 0;
    editReason = '';
  }

  // Filtered items
  const filteredItems = $derived(() => {
    let items = data.items || [];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.slug?.toLowerCase().includes(query) ||
        item.sku?.toLowerCase().includes(query)
      );
    }
    
    // Low stock filter
    if (showLowStockOnly) {
      items = items.filter(item => item.stock_count < item.min_threshold);
    }
    
    return items;
  });

  // Summary stats
  const totalItems = $derived((data.items || []).length);
  const totalStock = $derived((data.items || []).reduce((sum, i) => sum + i.stock_count, 0));
  const lowStockCount = $derived((data.items || []).filter(i => i.stock_count < i.min_threshold).length);
  const outOfStockCount = $derived((data.items || []).filter(i => i.stock_count === 0).length);

  // Stock level indicator
  function getStockLevel(item: InventoryItem): 'ok' | 'low' | 'out' {
    if (item.stock_count === 0) return 'out';
    if (item.stock_count < item.min_threshold) return 'low';
    return 'ok';
  }

  function getStockColor(level: 'ok' | 'low' | 'out'): string {
    switch (level) {
      case 'out': return 'text-red-400 bg-red-500/10';
      case 'low': return 'text-amber-400 bg-amber-500/10';
      case 'ok': return 'text-emerald-400 bg-emerald-500/10';
    }
  }

  // Format timestamp
  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;
    
    // Less than 1 hour ago
    if (diff < 60 * 60 * 1000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    }
    // Less than 24 hours ago
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }
    // Otherwise show date
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }

  // Change type labels
  function getChangeTypeLabel(type: string): { label: string; color: string } {
    switch (type) {
      case 'add': return { label: '+', color: 'text-emerald-400' };
      case 'remove': return { label: '−', color: 'text-red-400' };
      case 'sold_b2c': return { label: 'B2C', color: 'text-blue-400' };
      case 'sold_b2b': return { label: 'B2B', color: 'text-purple-400' };
      case 'count_adjust': return { label: '✓', color: 'text-amber-400' };
      case 'defect': return { label: '✗', color: 'text-red-400' };
      default: return { label: '?', color: 'text-slate-400' };
    }
  }
</script>

<svelte:head>
  <title>Inventory | Print Farm Companion</title>
</svelte:head>

<div class="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-100">📦 Inventory</h1>
        <p class="text-slate-400 text-sm mt-1">Finished goods ready for sale</p>
      </div>
      <a href="/" class="text-slate-400 hover:text-slate-300 text-sm">← Dashboard</a>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <div class="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <p class="text-slate-500 text-xs uppercase tracking-wide">Total Items</p>
        <p class="text-2xl font-bold text-slate-100">{totalItems}</p>
      </div>
      <div class="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <p class="text-slate-500 text-xs uppercase tracking-wide">Total Stock</p>
        <p class="text-2xl font-bold text-emerald-400">{totalStock}</p>
      </div>
      <div class="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <p class="text-slate-500 text-xs uppercase tracking-wide">Low Stock</p>
        <p class="text-2xl font-bold text-amber-400">{lowStockCount}</p>
      </div>
      <div class="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <p class="text-slate-500 text-xs uppercase tracking-wide">Out of Stock</p>
        <p class="text-2xl font-bold text-red-400">{outOfStockCount}</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <div class="flex-1 min-w-[200px]">
        <input
          type="text"
          placeholder="Search items..."
          bind:value={searchQuery}
          class="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        />
      </div>
      <label class="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={showLowStockOnly}
          class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/50"
        />
        Low stock only
      </label>
    </div>

    <!-- Main Content Grid -->
    <div class="grid lg:grid-cols-3 gap-6">
      <!-- Inventory List (2/3 width) -->
      <div class="lg:col-span-2">
        <div class="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h2 class="text-sm font-medium text-slate-400">Stock Levels</h2>
            <span class="text-xs text-slate-500">{filteredItems().length} items</span>
          </div>

          {#if filteredItems().length === 0}
            <div class="p-8 text-center text-slate-500">
              {#if searchQuery || showLowStockOnly}
                <p>No items match your filters</p>
              {:else}
                <p>No inventory items yet</p>
              {/if}
            </div>
          {:else}
            <div class="divide-y divide-slate-800/50">
              {#each filteredItems() as item}
                {@const stockLevel = getStockLevel(item)}
                <div class="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors">
                  <!-- Stock indicator dot -->
                  <div class="w-2 h-2 rounded-full shrink-0 {stockLevel === 'out' ? 'bg-red-500' : stockLevel === 'low' ? 'bg-amber-500' : 'bg-emerald-500'}"></div>
                  
                  <!-- Item info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-slate-100 truncate">{item.name}</span>
                    </div>
                    <div class="text-xs text-slate-500 truncate">
                      {item.sku || item.slug}
                      {#if item.min_threshold}
                        • min: {item.min_threshold}
                      {/if}
                    </div>
                  </div>

                  <!-- Stock count / Edit -->
                  {#if editingItemId === item.id}
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
                      <input type="hidden" name="id" value={item.id} />
                      <input 
                        type="number" 
                        name="count" 
                        bind:value={editCount}
                        min="0"
                        class="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-center text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input type="hidden" name="reason" value={editReason || 'Manual count'} />
                      <button type="submit" class="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded" title="Save">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </button>
                      <button type="button" onclick={cancelEdit} class="p-1.5 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded" title="Cancel">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                    </form>
                  {:else}
                    <div class="flex items-center gap-1">
                      <!-- Quick decrement -->
                      <form method="POST" action="?/removeStock" use:enhance>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="quantity" value="1" />
                        <input type="hidden" name="reason" value="Quick remove" />
                        <button 
                          type="submit"
                          disabled={item.stock_count === 0}
                          class="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Remove 1"
                        >
                          −
                        </button>
                      </form>
                      
                      <!-- Stock count (click to edit) -->
                      <button 
                        onclick={() => startEdit(item)}
                        class="min-w-[4rem] px-3 py-1.5 rounded-lg text-lg font-bold transition-colors {getStockColor(stockLevel)}"
                        title="Click to edit"
                      >
                        {item.stock_count}
                      </button>
                      
                      <!-- Quick increment -->
                      <form method="POST" action="?/addStock" use:enhance>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="quantity" value="1" />
                        <input type="hidden" name="reason" value="Quick add" />
                        <button 
                          type="submit"
                          class="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          title="Add 1"
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

      <!-- Activity Log (1/3 width) -->
      <div class="lg:col-span-1">
        <div class="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-800">
            <h2 class="text-sm font-medium text-slate-400">Recent Activity</h2>
          </div>

          {#if (data.logs || []).length === 0}
            <div class="p-6 text-center text-slate-500 text-sm">
              <p>No activity yet</p>
            </div>
          {:else}
            <div class="divide-y divide-slate-800/30 max-h-[600px] overflow-y-auto">
              {#each data.logs as log}
                {@const changeType = getChangeTypeLabel(log.change_type)}
                <div class="px-4 py-2.5 hover:bg-slate-800/20">
                  <div class="flex items-start gap-2">
                    <!-- Change type badge -->
                    <span class="w-8 text-center text-xs font-medium {changeType.color}">
                      {changeType.label}
                    </span>
                    
                    <!-- Log details -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm text-slate-200 truncate">{log.item_name}</span>
                        <span class="text-sm font-medium {log.quantity >= 0 ? 'text-emerald-400' : 'text-red-400'}">
                          {log.quantity >= 0 ? '+' : ''}{log.quantity}
                        </span>
                      </div>
                      {#if log.reason}
                        <p class="text-xs text-slate-500 truncate">{log.reason}</p>
                      {/if}
                    </div>
                    
                    <!-- Time -->
                    <span class="text-xs text-slate-600 shrink-0">
                      {formatTime(log.created_at)}
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
