<script lang="ts">
  import type { InventoryItem, InventoryLog } from '$lib/types';
  import { enhance } from '$app/forms';

  // extend item type locally to include AI fields
  type InventoryItemUI = InventoryItem & {
    daily_velocity?: number;
    days_until_stockout?: number;
  };

  // Set & weight types from server
  interface SetComponent {
    inventory_slug: string;
    quantity: number;
  }
  interface SetDefinition {
    sku: string;
    label: string;
    components: SetComponent[];
  }
  interface UnitWeight {
    slug: string;
    name: string;
    weight_per_unit: number;
  }

  interface PageData {
    items: InventoryItemUI[];
    logs: (InventoryLog & { item_name: string })[];
    setDefinitions: SetDefinition[];
    unitWeights: UnitWeight[];
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

  // ============ INVENTORY CHECK TOOL STATE ============
  let activeCheckPanel = $state<'sets' | 'weight' | 'direct' | null>(null);
  let checkSubmitting = $state(false);
  let checkMessage = $state('');

  // Sets tab state
  let setSearchQuery = $state('');
  let setCounts = $state<Record<string, number>>({});

  // Weight tab state
  let weightSearchQuery = $state('');
  let weightInputs = $state<Record<string, number>>({}); // slug → weight in grams
  
  // Direct add tab state
  let directSearchQuery = $state('');
  let directCounts = $state<Record<string, number>>({}); // slug → count

  // Filtered sets for search
  const filteredSets = $derived(() => {
    const sets = data.setDefinitions || [];
    if (!setSearchQuery) return sets;
    const q = setSearchQuery.toLowerCase();
    return sets.filter(s => 
      s.label.toLowerCase().includes(q) || 
      s.sku.toLowerCase().includes(q)
    );
  });

  // Filtered items for weight tab
  const filteredWeightItems = $derived(() => {
    const weights = data.unitWeights || [];
    if (!weightSearchQuery) return weights;
    const q = weightSearchQuery.toLowerCase();
    return weights.filter(w => 
      w.name.toLowerCase().includes(q) || 
      w.slug.toLowerCase().includes(q)
    );
  });

  // Filtered items for direct add tab
  const filteredDirectItems = $derived(() => {
    let items = data.items || [];
    // Exclude Vase Shrunk
    items = items.filter(item => {
      const name = item.name.toLowerCase();
      const slug = item.slug?.toLowerCase() || '';
      return !(name.includes('vase shrunk') || slug.includes('vase-shrunk'));
    });
    if (!directSearchQuery) return items;
    const q = directSearchQuery.toLowerCase();
    return items.filter(i => 
      i.name.toLowerCase().includes(q) || 
      i.slug?.toLowerCase().includes(q) ||
      i.sku?.toLowerCase().includes(q)
    );
  });

  // Compute count from weight for a given slug
  function getCountFromWeight(slug: string): number {
    const weight = weightInputs[slug] || 0;
    const unitWeight = (data.unitWeights || []).find(w => w.slug === slug);
    if (!unitWeight || unitWeight.weight_per_unit <= 0 || weight <= 0) return 0;
    return Math.floor(weight / unitWeight.weight_per_unit);
  }

  // Summary of pending changes for sets tab
  const setPendingSummary = $derived(() => {
    const summary: Record<string, number> = {};
    const sets = data.setDefinitions || [];
    for (const set of sets) {
      const count = setCounts[set.sku] || 0;
      if (count <= 0) continue;
      for (const comp of set.components) {
        summary[comp.inventory_slug] = (summary[comp.inventory_slug] || 0) + comp.quantity * count;
      }
    }
    return summary;
  });

  // Summary of pending changes for weight tab
  const weightPendingSummary = $derived(() => {
    const summary: Record<string, number> = {};
    for (const [slug, _weight] of Object.entries(weightInputs)) {
      const count = getCountFromWeight(slug);
      if (count > 0) summary[slug] = count;
    }
    return summary;
  });

  // Summary of pending changes for direct tab
  const directPendingSummary = $derived(() => {
    const summary: Record<string, number> = {};
    for (const [slug, count] of Object.entries(directCounts)) {
      if (count > 0) summary[slug] = count;
    }
    return summary;
  });

  // Get item name by slug
  function getItemName(slug: string): string {
    const item = (data.items || []).find(i => i.slug === slug);
    return item?.name || slug;
  }

  // Reset check tool state
  function resetCheckTool() {
    setCounts = {};
    weightInputs = {};
    directCounts = {};
    checkMessage = '';
    setSearchQuery = '';
    weightSearchQuery = '';
    directSearchQuery = '';
  }

  function openCheckPanel(panel: 'sets' | 'weight' | 'direct') {
    if (activeCheckPanel === panel) {
      activeCheckPanel = null;
    } else {
      resetCheckTool();
      activeCheckPanel = panel;
    }
  }

  function closeCheckPanel() {
    activeCheckPanel = null;
    resetCheckTool();
  }

  function openCheckTool() {
    resetCheckTool();
    activeCheckPanel = 'sets';
  }

  function closeCheckTool() {
    activeCheckPanel = null;
    resetCheckTool();
  }

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

  // helper for display
  function formatVelocity(v?: number) {
    if (v == null) return '0/d';
    return `${Math.round(v * 100) / 100}/d`;
  }
  function formatDays(d?: number) {
    if (d == null) return '∞';
    if (d > 999) return '∞';
    return `${Math.round(d * 10) / 10}d`;
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
                              {#each subcategoryData.items.sort((a, b) => a.color.localeCompare(b.color)) as { item, color }}
                                {@const stockLevel = getStockLevel(item)}
                                {@const ui = item as InventoryItemUI}
                                <div class="flex items-center gap-3 px-8 py-2.5 hover:bg-slate-800/20 transition-colors">
                                  <div class="w-2 h-2 rounded-full shrink-0 {stockLevel === 'out' ? 'bg-red-500' : stockLevel === 'low' ? 'bg-amber-500' : 'bg-emerald-500'}"></div>
                                  
                                  <!-- Color name -->
                                  <span class="text-sm text-slate-300 w-20 shrink-0">{color}</span>

                                  <!-- Velocity & days metrics -->
                                  <div class="flex-1 flex items-center gap-4 min-w-0">
                                    <div class="flex flex-col">
                                      <span class="text-xs text-slate-500 leading-none">velocity</span>
                                      <span class="text-sm font-semibold text-slate-200 leading-snug">{formatVelocity(ui.daily_velocity)}</span>
                                    </div>
                                    <div class="flex flex-col">
                                      <span class="text-xs text-slate-500 leading-none">days left</span>
                                      <span class="text-sm font-semibold {ui.days_until_stockout != null && ui.days_until_stockout <= 7 ? 'text-red-400' : ui.days_until_stockout != null && ui.days_until_stockout <= 14 ? 'text-amber-400' : 'text-slate-200'} leading-snug">{formatDays(ui.days_until_stockout)}</span>
                                    </div>
                                  </div>

                                  <!-- Stock count badge -->
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
                                    <button
                                      onclick={() => startEdit(item)}
                                      class="min-w-14 px-3 py-1.5 rounded-lg text-base font-bold transition-colors {getStockColor(stockLevel)}"
                                      title="Click to edit"
                                    >
                                      {item.stock_count}
                                    </button>
                                  {/if}
                                </div>
                              {/each}
                            {/if}
                          </div>
                        {/each}
                      {/if}
                      
                      <!-- Direct items (no subcategory) -->
                      {#if categoryData.items.length > 0}
                        <div class="divide-y divide-slate-800/20">
                          {#each categoryData.items as { item, color }}
                            {@const stockLevel = getStockLevel(item)}
                            {@const ui = item as InventoryItemUI}
                            <div class="flex items-center gap-3 px-6 py-2.5 hover:bg-slate-800/20 transition-colors">
                              <div class="w-2 h-2 rounded-full shrink-0 {stockLevel === 'out' ? 'bg-red-500' : stockLevel === 'low' ? 'bg-amber-500' : 'bg-emerald-500'}"></div>
                              <span class="text-sm text-slate-300 flex-1 min-w-0 truncate">{item.name}</span>
                              <div class="flex items-center gap-4">
                                <div class="flex flex-col items-end">
                                  <span class="text-xs text-slate-500 leading-none">velocity</span>
                                  <span class="text-sm font-semibold text-slate-200 leading-snug">{formatVelocity(ui.daily_velocity)}</span>
                                </div>
                                <div class="flex flex-col items-end">
                                  <span class="text-xs text-slate-500 leading-none">days left</span>
                                  <span class="text-sm font-semibold {ui.days_until_stockout != null && ui.days_until_stockout <= 7 ? 'text-red-400' : ui.days_until_stockout != null && ui.days_until_stockout <= 14 ? 'text-amber-400' : 'text-slate-200'} leading-snug">{formatDays(ui.days_until_stockout)}</span>
                                </div>
                                <span class="min-w-12 px-2 py-1 rounded-lg text-sm font-bold text-center {getStockColor(stockLevel)}">{item.stock_count}</span>
                              </div>
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
            <div class="divide-y divide-slate-800/30 max-h-150 overflow-y-auto">
              {#each data.logs as log}
                {@const changeType = getChangeTypeLabel(log.change_type)}
                <div class="px-4 py-2.5 hover:bg-slate-800/20">
                  <div class="flex items-start gap-2">
                    <span class="w-8 text-center text-xs font-medium {changeType.color}">
                      {changeType.label}
                    </span>
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

    <!-- ============ INVENTORY CHECK SECTION ============ -->
    <div class="mt-8">
      <div class="mb-4">
        <h2 class="text-lg font-bold text-slate-100">Add Stock</h2>
        <p class="text-slate-400 text-sm mt-0.5">Choose how you want to record new inventory</p>
      </div>

      <!-- Action buttons -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <button
          onclick={() => openCheckPanel('sets')}
          class="flex items-center gap-4 p-4 rounded-xl border transition-all {activeCheckPanel === 'sets' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-emerald-500/30 hover:bg-slate-800/60'}"
        >
          <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 text-xl">📦</div>
          <div class="text-left">
            <p class="font-semibold text-sm">Add by Sets</p>
            <p class="text-xs text-slate-500 mt-0.5">Decompose bundles into singles</p>
          </div>
          <svg class="w-4 h-4 ml-auto shrink-0 transition-transform {activeCheckPanel === 'sets' ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          onclick={() => openCheckPanel('weight')}
          class="flex items-center gap-4 p-4 rounded-xl border transition-all {activeCheckPanel === 'weight' ? 'bg-blue-500/10 border-blue-500/40 text-blue-300' : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-blue-500/30 hover:bg-slate-800/60'}"
        >
          <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 text-xl">⚖️</div>
          <div class="text-left">
            <p class="font-semibold text-sm">Add by Scale</p>
            <p class="text-xs text-slate-500 mt-0.5">Weight → item count</p>
          </div>
          <svg class="w-4 h-4 ml-auto shrink-0 transition-transform {activeCheckPanel === 'weight' ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          onclick={() => openCheckPanel('direct')}
          class="flex items-center gap-4 p-4 rounded-xl border transition-all {activeCheckPanel === 'direct' ? 'bg-violet-500/10 border-violet-500/40 text-violet-300' : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-violet-500/30 hover:bg-slate-800/60'}"
        >
          <div class="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 text-xl">🔢</div>
          <div class="text-left">
            <p class="font-semibold text-sm">Add Individually</p>
            <p class="text-xs text-slate-500 mt-0.5">Direct count per item</p>
          </div>
          <svg class="w-4 h-4 ml-auto shrink-0 transition-transform {activeCheckPanel === 'direct' ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <!-- Expanded Panel -->
      {#if activeCheckPanel !== null}
        {@const panelColor = activeCheckPanel === 'sets' ? 'emerald' : activeCheckPanel === 'weight' ? 'blue' : 'violet'}
        <div class="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          
          <!-- Panel Content -->
          <div class="p-5">

            <!-- ========== SETS PANEL ========== -->
            {#if activeCheckPanel === 'sets'}
              <div class="mb-4">
                <input
                  type="text"
                  placeholder="Search sets..."
                  bind:value={setSearchQuery}
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              {#if filteredSets().length === 0}
                <p class="text-slate-500 text-sm text-center py-8">No set definitions found</p>
              {:else}
                <div class="grid sm:grid-cols-2 gap-2">
                  {#each filteredSets() as set}
                    <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium text-slate-200 truncate">{set.label}</p>
                          <p class="text-xs text-slate-500 mt-0.5">
                            {set.components.map(c => `${c.quantity}x ${getItemName(c.inventory_slug)}`).join(' + ')}
                          </p>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                          <button
                            onclick={() => { setCounts[set.sku] = Math.max(0, (setCounts[set.sku] || 0) - 1); setCounts = { ...setCounts }; }}
                            disabled={(setCounts[set.sku] || 0) === 0}
                            class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg font-bold"
                          >−</button>
                          <input
                            type="number"
                            min="0"
                            value={setCounts[set.sku] || 0}
                            oninput={(e) => { setCounts[set.sku] = parseInt((e.target as HTMLInputElement).value) || 0; setCounts = { ...setCounts }; }}
                            class="w-14 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-center text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          />
                          <button
                            onclick={() => { setCounts[set.sku] = (setCounts[set.sku] || 0) + 1; setCounts = { ...setCounts }; }}
                            class="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors text-lg font-bold"
                          >+</button>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}

              {#if Object.keys(setPendingSummary()).length > 0}
                <div class="mt-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                  <p class="text-xs font-medium text-emerald-400 mb-2">Will add to inventory:</p>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
                    {#each Object.entries(setPendingSummary()) as [slug, qty]}
                      <div class="text-xs text-slate-300">
                        <span class="text-emerald-400 font-bold">+{qty}</span> {getItemName(slug)}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

            <!-- ========== WEIGHT PANEL ========== -->
            {:else if activeCheckPanel === 'weight'}
              <div class="mb-4">
                <input
                  type="text"
                  placeholder="Search items..."
                  bind:value={weightSearchQuery}
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <p class="text-xs text-slate-500 mb-4">Enter total weight in grams → auto-calculates item count</p>

              {#if filteredWeightItems().length === 0}
                <p class="text-slate-500 text-sm text-center py-8">No items with weight data available</p>
              {:else}
                <div class="grid sm:grid-cols-2 gap-2">
                  {#each filteredWeightItems() as w}
                    {@const count = getCountFromWeight(w.slug)}
                    <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium text-slate-200 truncate">{w.name}</p>
                          <p class="text-xs text-slate-500 mt-0.5">{w.weight_per_unit}g per unit</p>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          <div class="relative">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="0"
                              value={weightInputs[w.slug] || ''}
                              oninput={(e) => { weightInputs[w.slug] = parseFloat((e.target as HTMLInputElement).value) || 0; weightInputs = { ...weightInputs }; }}
                              class="w-24 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-right text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 pr-6"
                            />
                            <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">g</span>
                          </div>
                          <span class="text-sm text-slate-500">=</span>
                          <span class="min-w-10 text-center text-sm font-bold {count > 0 ? 'text-blue-400' : 'text-slate-600'}">
                            {count}
                          </span>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}

              {#if Object.keys(weightPendingSummary()).length > 0}
                <div class="mt-4 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                  <p class="text-xs font-medium text-blue-400 mb-2">Will add to inventory:</p>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
                    {#each Object.entries(weightPendingSummary()) as [slug, qty]}
                      <div class="text-xs text-slate-300">
                        <span class="text-blue-400 font-bold">+{qty}</span> {getItemName(slug)}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

            <!-- ========== DIRECT ADD PANEL ========== -->
            {:else if activeCheckPanel === 'direct'}
              <div class="mb-4">
                <input
                  type="text"
                  placeholder="Search items..."
                  bind:value={directSearchQuery}
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
              <p class="text-xs text-slate-500 mb-4">Enter the exact count to add for each item</p>

              {#if filteredDirectItems().length === 0}
                <p class="text-slate-500 text-sm text-center py-8">No items found</p>
              {:else}
                <div class="grid sm:grid-cols-2 gap-1.5">
                  {#each filteredDirectItems() as item}
                    {@const currentStock = item.stock_count}
                    {@const pending = directCounts[item.slug] || 0}
                    <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2">
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex-1 min-w-0">
                          <p class="text-sm text-slate-200 truncate">{item.name}</p>
                          <p class="text-xs text-slate-500">Stock: {currentStock}{pending > 0 ? ` → ${currentStock + pending}` : ''}</p>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                          <button
                            onclick={() => { directCounts[item.slug] = Math.max(0, (directCounts[item.slug] || 0) - 1); directCounts = { ...directCounts }; }}
                            disabled={(directCounts[item.slug] || 0) === 0}
                            class="w-7 h-7 flex items-center justify-center rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-bold"
                          >−</button>
                          <input
                            type="number"
                            min="0"
                            value={directCounts[item.slug] || 0}
                            oninput={(e) => { directCounts[item.slug] = parseInt((e.target as HTMLInputElement).value) || 0; directCounts = { ...directCounts }; }}
                            class="w-14 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-center text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                          />
                          <button
                            onclick={() => { directCounts[item.slug] = (directCounts[item.slug] || 0) + 1; directCounts = { ...directCounts }; }}
                            class="w-7 h-7 flex items-center justify-center rounded bg-violet-600 text-white hover:bg-violet-500 transition-colors text-sm font-bold"
                          >+</button>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}

              {#if Object.keys(directPendingSummary()).length > 0}
                <div class="mt-4 bg-violet-500/5 border border-violet-500/20 rounded-lg p-3">
                  <p class="text-xs font-medium text-violet-400 mb-2">Will add to inventory:</p>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
                    {#each Object.entries(directPendingSummary()) as [slug, qty]}
                      <div class="text-xs text-slate-300">
                        <span class="text-violet-400 font-bold">+{qty}</span> {getItemName(slug)}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}
          </div>

          <!-- Panel Footer -->
          <div class="px-5 py-4 border-t border-slate-800 flex items-center justify-between">
            {#if checkMessage}
              <p class="text-sm text-emerald-400">{checkMessage}</p>
            {:else}
              <button onclick={closeCheckPanel} class="text-sm text-slate-400 hover:text-white transition-colors">
                Close
              </button>
            {/if}

            {#if activeCheckPanel === 'sets'}
              <form
                method="POST"
                action="?/addSets"
                use:enhance={() => {
                  checkSubmitting = true;
                  return async ({ result, update }) => {
                    checkSubmitting = false;
                    if (result.type === 'success') {
                      checkMessage = '✓ Sets added to inventory!';
                      setCounts = {};
                      setTimeout(() => { checkMessage = ''; closeCheckPanel(); }, 1500);
                    }
                    await update();
                  };
                }}
              >
                <input type="hidden" name="entries" value={JSON.stringify(
                  Object.entries(setCounts).filter(([_, c]) => c > 0).map(([sku, count]) => ({ sku, count }))
                )} />
                <button
                  type="submit"
                  disabled={checkSubmitting || Object.keys(setPendingSummary()).length === 0}
                  class="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {checkSubmitting ? 'Adding...' : `Add ${Object.values(setPendingSummary()).reduce((s, v) => s + v, 0)} items`}
                </button>
              </form>
            {:else if activeCheckPanel === 'weight'}
              <form
                method="POST"
                action="?/addByWeight"
                use:enhance={() => {
                  checkSubmitting = true;
                  return async ({ result, update }) => {
                    checkSubmitting = false;
                    if (result.type === 'success') {
                      checkMessage = '✓ Weight-based items added!';
                      weightInputs = {};
                      setTimeout(() => { checkMessage = ''; closeCheckPanel(); }, 1500);
                    }
                    await update();
                  };
                }}
              >
                <input type="hidden" name="entries" value={JSON.stringify(
                  Object.entries(weightPendingSummary()).map(([slug, count]) => ({ slug, count }))
                )} />
                <button
                  type="submit"
                  disabled={checkSubmitting || Object.keys(weightPendingSummary()).length === 0}
                  class="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {checkSubmitting ? 'Adding...' : `Add ${Object.values(weightPendingSummary()).reduce((s, v) => s + v, 0)} items`}
                </button>
              </form>
            {:else if activeCheckPanel === 'direct'}
              <form
                method="POST"
                action="?/bulkAdd"
                use:enhance={() => {
                  checkSubmitting = true;
                  return async ({ result, update }) => {
                    checkSubmitting = false;
                    if (result.type === 'success') {
                      checkMessage = '✓ Items added to inventory!';
                      directCounts = {};
                      setTimeout(() => { checkMessage = ''; closeCheckPanel(); }, 1500);
                    }
                    await update();
                  };
                }}
              >
                <input type="hidden" name="entries" value={JSON.stringify(
                  Object.entries(directCounts).filter(([_, c]) => c > 0).map(([slug, count]) => ({ slug, count }))
                )} />
                <button
                  type="submit"
                  disabled={checkSubmitting || Object.keys(directPendingSummary()).length === 0}
                  class="px-6 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {checkSubmitting ? 'Adding...' : `Add ${Object.values(directPendingSummary()).reduce((s, v) => s + v, 0)} items`}
                </button>
              </form>
            {/if}
          </div>
        </div>
      {/if}
    </div>

  </div>
</div>
