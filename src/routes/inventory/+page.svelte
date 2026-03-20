<script lang="ts">
  import type { InventoryItem, InventoryLog } from '$lib/types';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';

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
      case 'out': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950';
      case 'low': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950';
      case 'ok': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950';
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
      case 'add': return { label: '+', color: 'text-green-600' };
      case 'remove': return { label: '−', color: 'text-red-600' };
      case 'sold_b2c': return { label: 'B2C', color: 'text-blue-600' };
      case 'sold_b2b': return { label: 'B2B', color: 'text-purple-400' };
      case 'count_adjust': return { label: '✓', color: 'text-amber-600' };
      case 'defect': return { label: '✗', color: 'text-red-600' };
      default: return { label: '?', color: 'text-zinc-500' };
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
  <title>Inventory | 3D Tracker</title>
</svelte:head>

<div class="min-h-screen bg-[#f8f8f8] dark:bg-[#080808]">
  <div class="max-w-6xl mx-auto px-6 sm:px-8 py-10">

    <!-- Header -->
    <div class="flex items-start justify-between mb-10">
      <div>
        <a href="/" class="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mb-4 tracking-wide">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          Dashboard
        </a>
        <h1 class="text-[2rem] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-none">Inventory</h1>
        <p class="text-zinc-400 dark:text-zinc-500 text-sm mt-2">Finished goods ready for sale</p>
      </div>
      <div class="flex items-center gap-2 mt-8">
        <button
          onclick={() => goto('/inventory/stock-count')}
          class="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all duration-150"
        >
          <svg class="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
          Stock Count
        </button>
        <button
          onclick={() => goto('/inventory/b2b-sell')}
          class="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all duration-150"
        >
          B2B Sale
          <svg class="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
      <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] p-5">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 mb-3">SKUs</p>
        <p class="text-4xl font-light tabular-nums text-zinc-900 dark:text-zinc-50">{totalItems}</p>
      </div>
      <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] p-5">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 mb-3">In Stock</p>
        <p class="text-4xl font-light tabular-nums text-zinc-900 dark:text-zinc-50">{totalStock}</p>
      </div>
      <div class="rounded-xl border p-5 transition-colors {lowStockCount > 0 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40' : 'bg-white dark:bg-[#111] border-zinc-100 dark:border-[#1e1e1e]'}">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] mb-3 {lowStockCount > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'}">Low Stock</p>
        <p class="text-4xl font-light tabular-nums {lowStockCount > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-50'}">{lowStockCount}</p>
      </div>
      <div class="rounded-xl border p-5 transition-colors {outOfStockCount > 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40' : 'bg-white dark:bg-[#111] border-zinc-100 dark:border-[#1e1e1e]'}">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] mb-3 {outOfStockCount > 0 ? 'text-red-500 dark:text-red-400' : 'text-zinc-400 dark:text-zinc-500'}">Out of Stock</p>
        <p class="text-4xl font-light tabular-nums {outOfStockCount > 0 ? 'text-red-500 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-50'}">{outOfStockCount}</p>
      </div>
    </div>

    <!-- Search & Filter -->
    <div class="flex items-center gap-3 mb-6">
      <div class="relative flex-1 max-w-sm">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
        </svg>
        <input
          type="text"
          placeholder="Search inventory…"
          bind:value={searchQuery}
          class="w-full h-9 pl-9 pr-4 bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#1e1e1e] rounded-lg text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-50/10 transition-shadow"
        />
      </div>
      <label class="flex items-center gap-2 h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-[#1e1e1e] bg-white dark:bg-[#111] cursor-pointer hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors select-none">
        <input
          type="checkbox"
          bind:checked={showLowStockOnly}
          class="w-3.5 h-3.5 rounded-sm border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-0"
        />
        <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Low stock only</span>
      </label>
    </div>

    <!-- Main Content Grid -->
    <div class="grid lg:grid-cols-3 gap-5 mb-10">
      <!-- Stock Levels 2/3 -->
      <div class="lg:col-span-2">
        <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden">
          <div class="px-5 py-4 border-b border-zinc-50 dark:border-[#1a1a1a] flex items-center justify-between">
            <h2 class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Stock Levels</h2>
            <span class="text-[10px] text-zinc-400">{totalItems} items</span>
          </div>

          {#if Object.keys(groupedInventory()).length === 0}
            <div class="py-16 text-center">
              <p class="text-sm text-zinc-400">{searchQuery || showLowStockOnly ? 'No items match your filters' : 'No inventory items yet'}</p>
            </div>
          {:else}
            <div class="divide-y divide-zinc-50 dark:divide-[#171717]">
              {#each Object.entries(groupedInventory()).sort(([,a], [,b]) => b.totalStock - a.totalStock) as [categoryName, categoryData]}
                {@const isCategoryExpanded = !!expandedCategories[categoryName]}
                {@const hasSubcategories = Object.keys(categoryData.subcategories).length > 0}
                {@const itemCount = Object.values(categoryData.subcategories).reduce((sum, sub) => sum + sub.items.length, 0) + categoryData.items.length}

                <!-- Level 1: Category -->
                <div>
                  <button
                    onclick={() => toggleCategory(categoryName)}
                    class="w-full px-5 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors"
                  >
                    <div class="flex items-center gap-3">
                      <svg
                        class="w-3 h-3 text-zinc-300 dark:text-zinc-600 shrink-0 transition-transform duration-200 {isCategoryExpanded ? 'rotate-90' : ''}"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                      </svg>
                      <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{categoryName}</span>
                      <span class="text-xs text-zinc-400">{itemCount}</span>
                    </div>

                    <div class="flex items-center gap-4">
                      {#if categoryData.outOfStockCount > 0}
                        <span class="text-[10px] font-medium text-red-500 flex items-center gap-1">
                          <span class="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"></span>
                          {categoryData.outOfStockCount} out
                        </span>
                      {/if}
                      {#if categoryData.lowStockCount > 0}
                        <span class="text-[10px] font-medium text-amber-500 flex items-center gap-1">
                          <span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                          {categoryData.lowStockCount} low
                        </span>
                      {/if}
                      <span class="text-xl font-light tabular-nums text-zinc-600 dark:text-zinc-400 min-w-12 text-right">{categoryData.totalStock}</span>
                    </div>
                  </button>

                  {#if isCategoryExpanded}
                    <div class="border-t border-zinc-50 dark:border-[#171717]">

                      <!-- Level 2: Subcategories -->
                      {#if hasSubcategories}
                        {#each Object.entries(categoryData.subcategories).sort(([,a], [,b]) => b.totalStock - a.totalStock) as [subcategoryName, subcategoryData]}
                          {@const subcategoryKey = `${categoryName}:${subcategoryName}`}
                          {@const isSubcategoryExpanded = !!expandedSubcategories[subcategoryKey]}

                          <div>
                            <button
                              onclick={() => toggleSubcategory(categoryName, subcategoryName)}
                              class="w-full pl-10 pr-5 py-3 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors"
                            >
                              <div class="flex items-center gap-2.5">
                                <svg
                                  class="w-2.5 h-2.5 text-zinc-300 dark:text-zinc-600 shrink-0 transition-transform duration-200 {isSubcategoryExpanded ? 'rotate-90' : ''}"
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                                </svg>
                                <span class="text-xs font-medium text-zinc-600 dark:text-zinc-400">{subcategoryName}</span>
                                <span class="text-[10px] text-zinc-400">{subcategoryData.items.length}</span>
                              </div>

                              <div class="flex items-center gap-3">
                                {#if subcategoryData.outOfStockCount > 0}
                                  <span class="text-[10px] text-red-500">{subcategoryData.outOfStockCount} out</span>
                                {/if}
                                {#if subcategoryData.lowStockCount > 0}
                                  <span class="text-[10px] text-amber-500">{subcategoryData.lowStockCount} low</span>
                                {/if}
                                <span class="text-base font-light tabular-nums text-zinc-500 min-w-8 text-right">{subcategoryData.totalStock}</span>
                              </div>
                            </button>

                            <!-- Level 3: Items -->
                            {#if isSubcategoryExpanded}
                              <div class="border-t border-zinc-50 dark:border-[#171717]">
                              {#each subcategoryData.items.sort((a, b) => a.color.localeCompare(b.color)) as { item, color }}
                                {@const stockLevel = getStockLevel(item)}
                                {@const ui = item as InventoryItemUI}
                                <div class="flex items-center gap-4 pl-16 pr-5 py-2.5 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors {stockLevel === 'out' ? 'border-l-2 border-l-red-400' : stockLevel === 'low' ? 'border-l-2 border-l-amber-400' : 'border-l-2 border-l-transparent'}">
                                  <span class="text-xs text-zinc-500 w-20 shrink-0">{color}</span>

                                  <div class="flex items-center gap-5 flex-1">
                                    <div>
                                      <span class="text-[9px] text-zinc-400 block leading-none mb-0.5">vel.</span>
                                      <span class="text-xs font-medium tabular-nums text-zinc-500">{formatVelocity(ui.daily_velocity)}</span>
                                    </div>
                                    <div>
                                      <span class="text-[9px] text-zinc-400 block leading-none mb-0.5">days</span>
                                      <span class="text-xs font-medium tabular-nums {ui.days_until_stockout != null && ui.days_until_stockout <= 7 ? 'text-red-500' : ui.days_until_stockout != null && ui.days_until_stockout <= 14 ? 'text-amber-500' : 'text-zinc-500'}">{formatDays(ui.days_until_stockout)}</span>
                                    </div>
                                  </div>

                                  {#if editingItemId === item.id}
                                    <form
                                      method="POST"
                                      action="?/setStock"
                                      use:enhance={() => {
                                        return async ({ update }) => { await update(); cancelEdit(); };
                                      }}
                                      class="flex items-center gap-1.5"
                                    >
                                      <input type="hidden" name="id" value={item.id} />
                                      <input type="hidden" name="reason" value="Manual count" />
                                      <input
                                        type="number"
                                        name="count"
                                        bind:value={editCount}
                                        min="0"
                                        class="w-16 h-7 bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-700 rounded-md px-2 text-center text-sm tabular-nums text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                                      />
                                      <button type="submit" class="w-7 h-7 flex items-center justify-center rounded-md bg-emerald-500 text-white hover:bg-emerald-600 transition-colors" title="Save">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                                      </button>
                                      <button type="button" onclick={cancelEdit} class="w-7 h-7 flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 transition-colors" title="Cancel">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                      </button>
                                    </form>
                                  {:else}
                                    <button
                                      onclick={() => startEdit(item)}
                                      title="Click to edit"
                                      class="min-w-12 h-7 px-3 rounded-md text-xs font-semibold tabular-nums transition-colors {stockLevel === 'out' ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100' : stockLevel === 'low' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 hover:bg-amber-100' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100'}"
                                    >
                                      {item.stock_count}
                                    </button>
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
                        <div>
                          {#each categoryData.items as { item, color }}
                            {@const stockLevel = getStockLevel(item)}
                            {@const ui = item as InventoryItemUI}
                            <div class="flex items-center gap-4 pl-10 pr-5 py-2.5 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors {stockLevel === 'out' ? 'border-l-2 border-l-red-400' : stockLevel === 'low' ? 'border-l-2 border-l-amber-400' : 'border-l-2 border-l-transparent'}">
                              <span class="text-xs text-zinc-600 dark:text-zinc-400 flex-1 min-w-0 truncate">{item.name}</span>
                              <div class="flex items-center gap-5">
                                <div>
                                  <span class="text-[9px] text-zinc-400 block leading-none mb-0.5">vel.</span>
                                  <span class="text-xs tabular-nums text-zinc-500">{formatVelocity(ui.daily_velocity)}</span>
                                </div>
                                <div>
                                  <span class="text-[9px] text-zinc-400 block leading-none mb-0.5">days</span>
                                  <span class="text-xs tabular-nums {ui.days_until_stockout != null && ui.days_until_stockout <= 7 ? 'text-red-500' : ui.days_until_stockout != null && ui.days_until_stockout <= 14 ? 'text-amber-500' : 'text-zinc-500'}">{formatDays(ui.days_until_stockout)}</span>
                                </div>
                                <span class="min-w-10 h-7 px-2.5 flex items-center justify-center rounded-md text-xs font-semibold tabular-nums {stockLevel === 'out' ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' : stockLevel === 'low' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'}">{item.stock_count}</span>
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

      <!-- Activity Log 1/3 -->
      <div class="lg:col-span-1">
        <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden">
          <div class="px-5 py-4 border-b border-zinc-50 dark:border-[#1a1a1a]">
            <h2 class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Activity</h2>
          </div>

          {#if (data.logs || []).length === 0}
            <div class="py-12 text-center">
              <p class="text-xs text-zinc-400">No activity yet</p>
            </div>
          {:else}
            <div class="divide-y divide-zinc-50 dark:divide-[#171717] max-h-130 overflow-y-auto">
              {#each data.logs as log}
                {@const changeType = getChangeTypeLabel(log.change_type)}
                <div class="px-5 py-3 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
                  <div class="flex items-start gap-3">
                    <span class="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold shrink-0 {changeType.color}">
                      {changeType.label}
                    </span>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate leading-snug">{log.item_name}</p>
                      {#if log.reason}
                        <p class="text-[10px] text-zinc-400 truncate mt-0.5">{log.reason}</p>
                      {/if}
                    </div>
                    <div class="text-right shrink-0">
                      <span class="text-xs font-semibold tabular-nums {log.quantity >= 0 ? 'text-emerald-500' : 'text-red-500'}">
                        {log.quantity >= 0 ? '+' : ''}{log.quantity}
                      </span>
                      <p class="text-[10px] text-zinc-400 mt-0.5">{formatTime(log.created_at)}</p>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Add Inventory -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden">
      <div class="px-5 py-4 border-b border-zinc-50 dark:border-[#1a1a1a]">
        <h2 class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Add Inventory</h2>
      </div>

      <!-- Tab strip -->
      <div class="flex border-b border-zinc-50 dark:border-[#1a1a1a]">
        {#each ([
          { id: 'sets' as const, label: 'By Sets', desc: 'Decompose bundles' },
          { id: 'weight' as const, label: 'By Weight', desc: 'Weight → count' },
          { id: 'direct' as const, label: 'Individually', desc: 'Direct count' },
        ]) as tab}
          <button
            onclick={() => openCheckPanel(tab.id)}
            class="flex-1 px-5 py-3.5 text-left border-b-2 transition-all duration-150 {activeCheckPanel === tab.id ? 'border-zinc-900 dark:border-zinc-100' : 'border-transparent hover:bg-zinc-50 dark:hover:bg-[#161616]'}"
          >
            <p class="text-xs font-semibold transition-colors {activeCheckPanel === tab.id ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-400 dark:text-zinc-500'}">{tab.label}</p>
            <p class="text-[10px] text-zinc-400 mt-0.5 hidden sm:block">{tab.desc}</p>
          </button>
        {/each}
      </div>

      {#if activeCheckPanel !== null}
        <div class="p-5">

          <!-- SETS PANEL -->
          {#if activeCheckPanel === 'sets'}
            <div class="mb-4">
              <input type="text" placeholder="Search sets…" bind:value={setSearchQuery}
                class="w-full h-8 px-3 bg-zinc-50 dark:bg-[#0d0d0d] border border-zinc-200 dark:border-[#1e1e1e] rounded-lg text-sm placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-50/10"
              />
            </div>
            {#if filteredSets().length === 0}
              <p class="text-xs text-zinc-400 text-center py-8">No set definitions found</p>
            {:else}
              <div class="grid sm:grid-cols-2 gap-2">
                {#each filteredSets() as set}
                  <div class="rounded-lg border border-zinc-100 dark:border-[#1e1e1e] bg-zinc-50 dark:bg-[#0d0d0d] px-4 py-3">
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{set.label}</p>
                        <p class="text-[10px] text-zinc-400 mt-0.5 truncate">{set.components.map(c => `${c.quantity}× ${getItemName(c.inventory_slug)}`).join(' + ')}</p>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button onclick={() => { setCounts[set.sku] = Math.max(0, (setCounts[set.sku] || 0) - 1); setCounts = { ...setCounts }; }} disabled={(setCounts[set.sku] || 0) === 0}
                          class="w-7 h-7 flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">−</button>
                        <input type="number" min="0" value={setCounts[set.sku] || 0}
                          oninput={(e) => { setCounts[set.sku] = parseInt((e.target as HTMLInputElement).value) || 0; setCounts = { ...setCounts }; }}
                          class="w-12 h-7 bg-white dark:bg-[#111] border border-zinc-200 dark:border-zinc-700 rounded-md px-2 text-center text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"/>
                        <button onclick={() => { setCounts[set.sku] = (setCounts[set.sku] || 0) + 1; setCounts = { ...setCounts }; }}
                          class="w-7 h-7 flex items-center justify-center rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors">+</button>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
            {#if Object.keys(setPendingSummary()).length > 0}
              <div class="mt-4 rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-3">
                <p class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2">Will add to inventory</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {#each Object.entries(setPendingSummary()) as [slug, qty]}
                    <div class="text-[10px] text-zinc-600 dark:text-zinc-400"><span class="text-emerald-500 font-semibold">+{qty}</span> {getItemName(slug)}</div>
                  {/each}
                </div>
              </div>
            {/if}

          <!-- WEIGHT PANEL -->
          {:else if activeCheckPanel === 'weight'}
            <div class="mb-4">
              <input type="text" placeholder="Search items…" bind:value={weightSearchQuery}
                class="w-full h-8 px-3 bg-zinc-50 dark:bg-[#0d0d0d] border border-zinc-200 dark:border-[#1e1e1e] rounded-lg text-sm placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-50/10"
              />
              <p class="text-[10px] text-zinc-400 mt-2">Enter total weight in grams — item count calculated automatically</p>
            </div>
            {#if filteredWeightItems().length === 0}
              <p class="text-xs text-zinc-400 text-center py-8">No items with weight data available</p>
            {:else}
              <div class="grid sm:grid-cols-2 gap-2">
                {#each filteredWeightItems() as w}
                  {@const count = getCountFromWeight(w.slug)}
                  <div class="rounded-lg border border-zinc-100 dark:border-[#1e1e1e] bg-zinc-50 dark:bg-[#0d0d0d] px-4 py-3">
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{w.name}</p>
                        <p class="text-[10px] text-zinc-400 mt-0.5">{w.weight_per_unit}g / unit</p>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <div class="relative">
                          <input type="number" min="0" step="1" placeholder="0" value={weightInputs[w.slug] || ''}
                            oninput={(e) => { weightInputs[w.slug] = parseFloat((e.target as HTMLInputElement).value) || 0; weightInputs = { ...weightInputs }; }}
                            class="w-20 h-7 bg-white dark:bg-[#111] border border-zinc-200 dark:border-zinc-700 rounded-md pr-5 pl-2 text-right text-xs tabular-nums text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"/>
                          <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400">g</span>
                        </div>
                        <span class="text-[10px] text-zinc-400">=</span>
                        <span class="w-8 text-center text-xs font-semibold tabular-nums {count > 0 ? 'text-blue-500' : 'text-zinc-400'}">{count}</span>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
            {#if Object.keys(weightPendingSummary()).length > 0}
              <div class="mt-4 rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 p-3">
                <p class="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">Will add to inventory</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {#each Object.entries(weightPendingSummary()) as [slug, qty]}
                    <div class="text-[10px] text-zinc-600 dark:text-zinc-400"><span class="text-blue-500 font-semibold">+{qty}</span> {getItemName(slug)}</div>
                  {/each}
                </div>
              </div>
            {/if}

          <!-- DIRECT PANEL -->
          {:else if activeCheckPanel === 'direct'}
            <div class="mb-4">
              <input type="text" placeholder="Search items…" bind:value={directSearchQuery}
                class="w-full h-8 px-3 bg-zinc-50 dark:bg-[#0d0d0d] border border-zinc-200 dark:border-[#1e1e1e] rounded-lg text-sm placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-50/10"
              />
            </div>
            {#if filteredDirectItems().length === 0}
              <p class="text-xs text-zinc-400 text-center py-8">No items found</p>
            {:else}
              <div class="grid sm:grid-cols-2 gap-2">
                {#each filteredDirectItems() as item}
                  {@const currentStock = item.stock_count}
                  {@const pending = directCounts[item.slug] || 0}
                  <div class="rounded-lg border border-zinc-100 dark:border-[#1e1e1e] bg-zinc-50 dark:bg-[#0d0d0d] px-4 py-3">
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{item.name}</p>
                        <p class="text-[10px] text-zinc-400 mt-0.5">{currentStock}{pending > 0 ? ` → ${currentStock + pending}` : ''}</p>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button onclick={() => { directCounts[item.slug] = Math.max(0, (directCounts[item.slug] || 0) - 1); directCounts = { ...directCounts }; }} disabled={(directCounts[item.slug] || 0) === 0}
                          class="w-7 h-7 flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">−</button>
                        <input type="number" min="0" value={directCounts[item.slug] || 0}
                          oninput={(e) => { directCounts[item.slug] = parseInt((e.target as HTMLInputElement).value) || 0; directCounts = { ...directCounts }; }}
                          class="w-12 h-7 bg-white dark:bg-[#111] border border-zinc-200 dark:border-zinc-700 rounded-md px-2 text-center text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"/>
                        <button onclick={() => { directCounts[item.slug] = (directCounts[item.slug] || 0) + 1; directCounts = { ...directCounts }; }}
                          class="w-7 h-7 flex items-center justify-center rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors">+</button>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
            {#if Object.keys(directPendingSummary()).length > 0}
              <div class="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-3">
                <p class="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">Will add to inventory</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {#each Object.entries(directPendingSummary()) as [slug, qty]}
                    <div class="text-[10px] text-zinc-600 dark:text-zinc-400"><span class="text-zinc-900 dark:text-zinc-100 font-semibold">+{qty}</span> {getItemName(slug)}</div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}

          <!-- Footer -->
          <div class="mt-5 pt-4 border-t border-zinc-100 dark:border-[#1e1e1e] flex items-center justify-between">
            {#if checkMessage}
              <p class="text-xs font-medium text-emerald-500">{checkMessage}</p>
            {:else}
              <button onclick={closeCheckPanel} class="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Close</button>
            {/if}

            {#if activeCheckPanel === 'sets'}
              <form method="POST" action="?/addSets" use:enhance={() => {
                checkSubmitting = true;
                return async ({ result, update }) => {
                  checkSubmitting = false;
                  if (result.type === 'success') { checkMessage = '✓ Sets added to inventory!'; setCounts = {}; setTimeout(() => { checkMessage = ''; closeCheckPanel(); }, 1500); }
                  await update();
                };
              }}>
                <input type="hidden" name="entries" value={JSON.stringify(Object.entries(setCounts).filter(([_, c]) => c > 0).map(([sku, count]) => ({ sku, count })))} />
                <button type="submit" disabled={checkSubmitting || Object.keys(setPendingSummary()).length === 0}
                  class="h-8 px-5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {checkSubmitting ? 'Adding…' : `Add ${Object.values(setPendingSummary()).reduce((s, v) => s + v, 0)} items`}
                </button>
              </form>
            {:else if activeCheckPanel === 'weight'}
              <form method="POST" action="?/addByWeight" use:enhance={() => {
                checkSubmitting = true;
                return async ({ result, update }) => {
                  checkSubmitting = false;
                  if (result.type === 'success') { checkMessage = '✓ Weight-based items added!'; weightInputs = {}; setTimeout(() => { checkMessage = ''; closeCheckPanel(); }, 1500); }
                  await update();
                };
              }}>
                <input type="hidden" name="entries" value={JSON.stringify(Object.entries(weightPendingSummary()).map(([slug, count]) => ({ slug, count })))} />
                <button type="submit" disabled={checkSubmitting || Object.keys(weightPendingSummary()).length === 0}
                  class="h-8 px-5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {checkSubmitting ? 'Adding…' : `Add ${Object.values(weightPendingSummary()).reduce((s, v) => s + v, 0)} items`}
                </button>
              </form>
            {:else if activeCheckPanel === 'direct'}
              <form method="POST" action="?/bulkAdd" use:enhance={() => {
                checkSubmitting = true;
                return async ({ result, update }) => {
                  checkSubmitting = false;
                  if (result.type === 'success') { checkMessage = '✓ Items added to inventory!'; directCounts = {}; setTimeout(() => { checkMessage = ''; closeCheckPanel(); }, 1500); }
                  await update();
                };
              }}>
                <input type="hidden" name="entries" value={JSON.stringify(Object.entries(directCounts).filter(([_, c]) => c > 0).map(([slug, count]) => ({ slug, count })))} />
                <button type="submit" disabled={checkSubmitting || Object.keys(directPendingSummary()).length === 0}
                  class="h-8 px-5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {checkSubmitting ? 'Adding…' : `Add ${Object.values(directPendingSummary()).reduce((s, v) => s + v, 0)} items`}
                </button>
              </form>
            {/if}
          </div>

        </div>
      {:else}
        <div class="px-5 py-6 text-center">
          <p class="text-xs text-zinc-400">Select a method above to add inventory</p>
        </div>
      {/if}
    </div>

  </div>
</div>
