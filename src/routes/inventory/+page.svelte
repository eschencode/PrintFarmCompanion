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

  // Filter/search
  let searchQuery = $state('');
  let showLowStockOnly = $state(false);

  // Expansion state
  let expandedCategories = $state<Record<string, boolean>>({});
  let expandedSubcategories = $state<Record<string, boolean>>({});

  // Start editing an item's stock
  function startEdit(item: InventoryItem) {
    editingItemId = item.id;
    editCount = item.stock_count;
  }

  function cancelEdit() {
    editingItemId = null;
    editCount = 0;
  }

  // Parse item name to get category structure
  function getItemCategory(item: InventoryItem): { category: string; subcategory: string | null; color: string } {
    const name = item.name.toLowerCase();
    const slug = item.slug?.toLowerCase() || '';
    
    // Extract color (last word in name usually)
    const nameParts = item.name.split(' ');
    const color = nameParts[nameParts.length - 1];
    
    // Haken products
    if (name.includes('haken kleben') || slug.includes('haken-kleben')) {
      return { category: 'Haken', subcategory: 'Kleben', color };
    }
    if (name.includes('haken schrauben') || slug.includes('haken-schrauben')) {
      return { category: 'Haken', subcategory: 'Schrauben', color };
    }
    if (name.includes('hakenhalter') || slug.includes('hakenhalter')) {
      return { category: 'Haken', subcategory: 'Halter', color };
    }
    
    // Vase products
    if (name.includes('vase fluid') || slug.includes('vase-fluid')) {
      return { category: 'Vase', subcategory: 'Fluid', color };
    }
    // Commented out - not needed yet
    // if (name.includes('vase shrunk') || slug.includes('vase-shrunk')) {
    //   return { category: 'Vase', subcategory: 'Shrunk', color };
    // }
    
    // Klorolle products
    if (name.includes('klohalter') || slug.includes('klohalter')) {
      return { category: 'Klorolle', subcategory: 'Klohalter', color };
    }
    if (name.includes('stab') || slug.includes('stab')) {
      return { category: 'Klorolle', subcategory: 'Stab', color };
    }
    if (name.includes('stöpsel') || slug.includes('stoepsel')) {
      return { category: 'Klorolle', subcategory: 'Stöpsel', color };
    }
    
    // Fallback
    return { category: 'Other', subcategory: null, color };
  }

  // Build grouped structure
  interface GroupedItem {
    item: InventoryItem;
    color: string;
  }
  
  interface SubcategoryGroup {
    items: GroupedItem[];
    totalStock: number;
    lowStockCount: number;
    outOfStockCount: number;
  }
  
  interface CategoryGroup {
    subcategories: Record<string, SubcategoryGroup>;
    items: GroupedItem[]; // Items without subcategory
    totalStock: number;
    lowStockCount: number;
    outOfStockCount: number;
  }

  const groupedInventory = $derived(() => {
    let items = data.items || [];
    
    // Filter out Vase Shrunk items for now
    items = items.filter(item => {
      const name = item.name.toLowerCase();
      const slug = item.slug?.toLowerCase() || '';
      return !(name.includes('vase shrunk') || slug.includes('vase-shrunk'));
    });
    
    // Apply filters
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.slug?.toLowerCase().includes(query) ||
        item.sku?.toLowerCase().includes(query)
      );
    }
    
    if (showLowStockOnly) {
      items = items.filter(item => item.stock_count < item.min_threshold);
    }
    
    // Group items
    const groups: Record<string, CategoryGroup> = {};
    
    items.forEach(item => {
      const { category, subcategory, color } = getItemCategory(item);
      
      if (!groups[category]) {
        groups[category] = {
          subcategories: {},
          items: [],
          totalStock: 0,
          lowStockCount: 0,
          outOfStockCount: 0
        };
      }
      
      const groupedItem = { item, color };
      const isOutOfStock = item.stock_count === 0;
      // Low stock = below threshold BUT not out of stock
      const isLowStock = item.stock_count > 0 && item.stock_count < item.min_threshold;
      
      groups[category].totalStock += item.stock_count;
      if (isLowStock) groups[category].lowStockCount++;
      if (isOutOfStock) groups[category].outOfStockCount++;
      
      if (subcategory) {
        if (!groups[category].subcategories[subcategory]) {
          groups[category].subcategories[subcategory] = {
            items: [],
            totalStock: 0,
            lowStockCount: 0,
            outOfStockCount: 0
          };
        }
        groups[category].subcategories[subcategory].items.push(groupedItem);
        groups[category].subcategories[subcategory].totalStock += item.stock_count;
        if (isLowStock) groups[category].subcategories[subcategory].lowStockCount++;
        if (isOutOfStock) groups[category].subcategories[subcategory].outOfStockCount++;
      } else {
        groups[category].items.push(groupedItem);
      }
    });
    
    return groups;
  });

  // Summary stats - also exclude Vase Shrunk and fix low stock logic
  const filteredItems = $derived(() => {
    return (data.items || []).filter(item => {
      const name = item.name.toLowerCase();
      const slug = item.slug?.toLowerCase() || '';
      return !(name.includes('vase shrunk') || slug.includes('vase-shrunk'));
    });
  });
  
  const totalItems = $derived(filteredItems().length);
  const totalStock = $derived(filteredItems().reduce((sum, i) => sum + i.stock_count, 0));
  // Low stock = below threshold but NOT zero
  const lowStockCount = $derived(filteredItems().filter(i => i.stock_count > 0 && i.stock_count < i.min_threshold).length);
  const outOfStockCount = $derived(filteredItems().filter(i => i.stock_count === 0).length);

  // Toggle functions
  function toggleCategory(categoryName: string) {
    if (expandedCategories[categoryName]) {
      const newExpanded = { ...expandedCategories };
      delete newExpanded[categoryName];
      expandedCategories = newExpanded;
      
      // Clean up children
      const newSubcategories = { ...expandedSubcategories };
      Object.keys(newSubcategories).forEach(key => {
        if (key.startsWith(`${categoryName}:`)) {
          delete newSubcategories[key];
        }
      });
      expandedSubcategories = newSubcategories;
    } else {
      expandedCategories = { ...expandedCategories, [categoryName]: true };
    }
  }

  function toggleSubcategory(categoryName: string, subcategoryName: string) {
    const key = `${categoryName}:${subcategoryName}`;
    if (expandedSubcategories[key]) {
      const newSubcategories = { ...expandedSubcategories };
      delete newSubcategories[key];
      expandedSubcategories = newSubcategories;
    } else {
      expandedSubcategories = { ...expandedSubcategories, [key]: true };
    }
  }

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
    
    if (diff < 60 * 60 * 1000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    }
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }
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
        <h1 class="text-2xl font-bold text-slate-100">Inventory</h1>
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
      <div class="flex-1 min-w-50">
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
            <span class="text-xs text-slate-500">{totalItems} items</span>
          </div>

          {#if Object.keys(groupedInventory()).length === 0}
            <div class="p-8 text-center text-slate-500">
              {#if searchQuery || showLowStockOnly}
                <p>No items match your filters</p>
              {:else}
                <p>No inventory items yet</p>
              {/if}
            </div>
          {:else}
            <div class="divide-y divide-slate-800/50">
              {#each Object.entries(groupedInventory()).sort(([,a], [,b]) => b.totalStock - a.totalStock) as [categoryName, categoryData]}
                {@const isCategoryExpanded = !!expandedCategories[categoryName]}
                {@const hasSubcategories = Object.keys(categoryData.subcategories).length > 0}
                {@const itemCount = Object.values(categoryData.subcategories).reduce((sum, sub) => sum + sub.items.length, 0) + categoryData.items.length}
                
                <!-- Level 1: Category -->
                <div class="border-b border-slate-800/30 last:border-b-0">
                  <button
                    onclick={() => toggleCategory(categoryName)}
                    class="w-full px-4 py-3 flex items-center justify-between bg-slate-800/20 hover:bg-slate-800/40 transition-colors"
                  >
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <svg 
                          class="w-5 h-5 text-blue-400 transition-transform duration-200 {isCategoryExpanded ? 'rotate-90' : ''}" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                      <div class="text-left">
                        <h3 class="text-base font-semibold text-white">{categoryName}</h3>
                        <p class="text-xs text-slate-500">{itemCount} items</p>
                      </div>
                    </div>
                    
                    <div class="flex items-center gap-4">
                      <!-- Status indicators -->
                      {#if categoryData.outOfStockCount > 0}
                        <span class="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">
                          {categoryData.outOfStockCount} out
                        </span>
                      {/if}
                      {#if categoryData.lowStockCount > 0}
                        <span class="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                          {categoryData.lowStockCount} low
                        </span>
                      {/if}
                      
                      <!-- Total stock -->
                      <span class="text-lg font-bold text-emerald-400 min-w-16 text-right">
                        {categoryData.totalStock}
                      </span>
                    </div>
                  </button>

                  {#if isCategoryExpanded}
                    <div class="bg-slate-900/30 border-t border-slate-800/50">
                      
                      <!-- Level 2: Subcategories -->
                      {#if hasSubcategories}
                        {#each Object.entries(categoryData.subcategories).sort(([,a], [,b]) => b.totalStock - a.totalStock) as [subcategoryName, subcategoryData]}
                          {@const subcategoryKey = `${categoryName}:${subcategoryName}`}
                          {@const isSubcategoryExpanded = !!expandedSubcategories[subcategoryKey]}
                          
                          <div class="border-b border-slate-800/30 last:border-b-0">
                            <button
                              onclick={() => toggleSubcategory(categoryName, subcategoryName)}
                              class="w-full px-6 py-2.5 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
                            >
                              <div class="flex items-center gap-3">
                                <div class="w-7 h-7 rounded-md bg-indigo-500/10 flex items-center justify-center">
                                  <svg 
                                    class="w-4 h-4 text-indigo-400 transition-transform duration-200 {isSubcategoryExpanded ? 'rotate-90' : ''}" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                  >
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                                <div class="text-left">
                                  <h4 class="text-sm font-medium text-slate-200">{subcategoryName}</h4>
                                  <p class="text-xs text-slate-600">{subcategoryData.items.length} colors</p>
                                </div>
                              </div>
                              
                              <div class="flex items-center gap-3">
                                {#if subcategoryData.outOfStockCount > 0}
                                  <span class="text-xs text-red-400">{subcategoryData.outOfStockCount} out</span>
                                {/if}
                                {#if subcategoryData.lowStockCount > 0}
                                  <span class="text-xs text-amber-400">{subcategoryData.lowStockCount} low</span>
                                {/if}
                                <span class="text-base font-bold text-emerald-400">{subcategoryData.totalStock}</span>
                              </div>
                            </button>

                            <!-- Level 3: Items -->
                            {#if isSubcategoryExpanded}
                              <div class="bg-slate-900/50 border-t border-slate-800/30 divide-y divide-slate-800/20">
                                {#each subcategoryData.items.sort((a, b) => a.color.localeCompare(b.color)) as { item, color }}
                                  {@const stockLevel = getStockLevel(item)}
                                  <div class="flex items-center gap-3 px-8 py-2 hover:bg-slate-800/20 transition-colors">
                                    <!-- Color dot -->
                                    <div class="w-2 h-2 rounded-full shrink-0 {stockLevel === 'out' ? 'bg-red-500' : stockLevel === 'low' ? 'bg-amber-500' : 'bg-emerald-500'}"></div>
                                    
                                    <!-- Item info -->
                                    <div class="flex-1 min-w-0">
                                      <span class="text-sm text-slate-300">{color}</span>
                                      <span class="text-xs text-slate-600 ml-2">min: {item.min_threshold}</span>
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
                                        class="flex items-center gap-1"
                                      >
                                        <input type="hidden" name="id" value={item.id} />
                                        <input 
                                          type="number" 
                                          name="count" 
                                          bind:value={editCount}
                                          min="0"
                                          class="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-center text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        />
                                        <input type="hidden" name="reason" value="Manual count" />
                                        <button type="submit" class="p-1 text-emerald-400 hover:text-emerald-300 rounded" title="Save">
                                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                          </svg>
                                        </button>
                                        <button type="button" onclick={cancelEdit} class="p-1 text-slate-400 hover:text-slate-300 rounded" title="Cancel">
                                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                          </svg>
                                        </button>
                                      </form>
                                    {:else}
                                      <div class="flex items-center gap-0.5">
                                        <!-- Quick decrement -->
                                        <form method="POST" action="?/removeStock" use:enhance>
                                          <input type="hidden" name="id" value={item.id} />
                                          <input type="hidden" name="quantity" value="1" />
                                          <input type="hidden" name="reason" value="Quick remove" />
                                          <button 
                                            type="submit"
                                            disabled={item.stock_count === 0}
                                            class="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                                            title="Remove 1"
                                          >
                                            −
                                          </button>
                                        </form>
                                        
                                        <!-- Stock count -->
                                        <button 
                                          onclick={() => startEdit(item)}
                                          class="min-w-12 px-2 py-1 rounded text-sm font-bold transition-colors {getStockColor(stockLevel)}"
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
                                            class="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors text-sm"
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
                        {/each}
                      {/if}
                      
                      <!-- Direct items (no subcategory) -->
                      {#if categoryData.items.length > 0}
                        <div class="divide-y divide-slate-800/20">
                          {#each categoryData.items as { item, color }}
                            {@const stockLevel = getStockLevel(item)}
                            <div class="flex items-center gap-3 px-6 py-2 hover:bg-slate-800/20 transition-colors">
                              <div class="w-2 h-2 rounded-full shrink-0 {stockLevel === 'out' ? 'bg-red-500' : stockLevel === 'low' ? 'bg-amber-500' : 'bg-emerald-500'}"></div>
                              <div class="flex-1 min-w-0">
                                <span class="text-sm text-slate-300">{item.name}</span>
                              </div>
                              <span class="text-sm font-bold {getStockColor(stockLevel).split(' ')[0]}">{item.stock_count}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}
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