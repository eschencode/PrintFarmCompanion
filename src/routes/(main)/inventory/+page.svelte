<script lang="ts">
  import type { ObjectItem, InventoryLog, Category } from '$lib/types';
  import { enhance, deserialize } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import BackToDashboard from '$lib/components/BackToDashboard.svelte';

  // extend item type locally to include AI fields
  type ObjectItemUI = ObjectItem & {
    daily_velocity?: number;
    days_until_stockout?: number;
  };

  // Set & weight types from server
  interface SetComponent {
    object_id: number;
    quantity: number;
  }
  interface SetDefinition {
    shopify_sku: string;
    label: string;
    components: SetComponent[];
  }
  interface UnitWeight {
    id: number;
    name: string;
    weight_per_unit: number;
  }

  type ActivityLog = InventoryLog & { object_name: string; order_number: string | null };

  interface PageData {
    items: ObjectItemUI[];
    logs: ActivityLog[];
    setDefinitions: SetDefinition[];
    unitWeights: UnitWeight[];
    categories: Category[];
  }

  let { data }: { data: PageData } = $props();

  // Filter/search
  let searchQuery = $state('');
  let showLowStockOnly = $state(false);

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
      s.shopify_sku.toLowerCase().includes(q)
    );
  });

  // Filtered items for weight tab
  const filteredWeightItems = $derived(() => {
    const weights = data.unitWeights || [];
    if (!weightSearchQuery) return weights;
    const q = weightSearchQuery.toLowerCase();
    return weights.filter(w => w.name.toLowerCase().includes(q));
  });

  // Filtered items for direct add tab
  const filteredDirectItems = $derived(() => {
    let items = data.items || [];
    if (!directSearchQuery) return items;
    const q = directSearchQuery.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(q));
  });

  // Compute count from weight for a given id key (string-encoded number)
  function getCountFromWeight(idKey: string): number {
    const weight = weightInputs[idKey] || 0;
    const unitWeight = (data.unitWeights || []).find(w => String(w.id) === idKey);
    if (!unitWeight || unitWeight.weight_per_unit <= 0 || weight <= 0) return 0;
    return Math.floor(weight / unitWeight.weight_per_unit);
  }

  // Summary of pending changes for sets tab (keyed by String(object_id))
  const setPendingSummary = $derived(() => {
    const summary: Record<string, number> = {};
    const sets = data.setDefinitions || [];
    for (const set of sets) {
      const count = setCounts[set.shopify_sku] || 0;
      if (count <= 0) continue;
      for (const comp of set.components) {
        const k = String(comp.object_id);
        summary[k] = (summary[k] || 0) + comp.quantity * count;
      }
    }
    return summary;
  });

  // Summary of pending changes for weight tab
  const weightPendingSummary = $derived(() => {
    const summary: Record<string, number> = {};
    for (const [idKey] of Object.entries(weightInputs)) {
      const count = getCountFromWeight(idKey);
      if (count > 0) summary[idKey] = count;
    }
    return summary;
  });

  // Summary of pending changes for direct tab
  const directPendingSummary = $derived(() => {
    const summary: Record<string, number> = {};
    for (const [idKey, count] of Object.entries(directCounts)) {
      if (count > 0) summary[idKey] = count;
    }
    return summary;
  });

  // Get item name by string-encoded id
  function getItemName(idKey: string): string {
    const id = parseInt(idKey);
    return (data.items || []).find(i => i.id === id)?.name || idKey;
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

  // ── Category tree (driven by the categories table) ──────────────────────────
  interface GroupStats { totalStock: number; low: number; out: number; count: number }
  interface SubGroup { cat: Category; items: ObjectItemUI[]; stats: GroupStats }
  interface CatGroup { cat: Category; items: ObjectItemUI[]; subs: SubGroup[]; stats: GroupStats }

  function statsOf(items: ObjectItemUI[]): GroupStats {
    let totalStock = 0, low = 0, out = 0;
    for (const i of items) {
      totalStock += i.in_stock;
      if (i.in_stock <= 0) out++;
      else if (i.in_stock < i.min_threshold) low++;
    }
    return { totalStock, low, out, count: items.length };
  }

  function matchesFilters(i: ObjectItemUI): boolean {
    if (showLowStockOnly && !(i.in_stock < i.min_threshold)) return false;
    if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }

  function pushTo<K>(m: Map<K, ObjectItemUI[]>, k: K, v: ObjectItemUI) {
    const arr = m.get(k);
    if (arr) arr.push(v); else m.set(k, [v]);
  }

  const tree = $derived.by(() => {
    const cats = data.categories || [];
    const items = (data.items || []).filter(matchesFilters);
    const byId = new Map(cats.map(c => [c.id, c]));

    const itemsByCat = new Map<number, ObjectItemUI[]>();
    const uncategorized: ObjectItemUI[] = [];
    for (const it of items) {
      if (it.category_id != null && byId.has(it.category_id)) pushTo(itemsByCat, it.category_id, it);
      else uncategorized.push(it);
    }

    const subsByParent = new Map<number, Category[]>();
    for (const c of cats) {
      if (c.parent_id != null) {
        const arr = subsByParent.get(c.parent_id);
        if (arr) arr.push(c); else subsByParent.set(c.parent_id, [c]);
      }
    }

    const groups: CatGroup[] = cats
      .filter(c => c.parent_id == null)
      .map(cat => {
        const directItems = itemsByCat.get(cat.id) ?? [];
        const subs: SubGroup[] = (subsByParent.get(cat.id) ?? []).map(sc => {
          const si = itemsByCat.get(sc.id) ?? [];
          return { cat: sc, items: si, stats: statsOf(si) };
        });
        const allItems = [...directItems, ...subs.flatMap(s => s.items)];
        return { cat, items: directItems, subs, stats: statsOf(allItems) };
      });

    return { groups, uncategorized, uncatStats: statsOf(uncategorized) };
  });

  // ── Drag & drop + category mutations ────────────────────────────────────────
  let draggedId = $state<number | null>(null);
  let dragOverKey = $state<string | null>(null);
  // Explicit expand/collapse overrides; absent falls back to the level's default
  // (top categories open, subcategories closed) so nothing is fully expanded on load.
  let expandedState = $state<Record<string, boolean>>({});
  let manageMode = $state(false); // gear toggle: reveals drag/rename/delete/create affordances
  let newCatName = $state('');
  let addingSubFor = $state<number | null>(null);
  let newSubName = $state('');
  let editingCatId = $state<number | null>(null);
  let catNameDraft = $state('');

  function isExpanded(key: string, def: boolean): boolean {
    return key in expandedState ? expandedState[key] : def;
  }
  function toggleExpand(key: string, def: boolean) {
    expandedState = { ...expandedState, [key]: !isExpanded(key, def) };
  }

  function onDragStart(e: DragEvent, id: number) {
    draggedId = id;
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', String(id));
      e.dataTransfer.effectAllowed = 'move';
    }
  }
  function onDragEnd() { draggedId = null; dragOverKey = null; }
  function onDragOver(e: DragEvent, key: string) {
    if (draggedId == null) return;
    e.preventDefault();
    e.stopPropagation();
    dragOverKey = key;
  }

  async function postAction(action: string, fields: Record<string, string | number | null>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v != null) fd.set(k, String(v));
    const res = await fetch(action, { method: 'POST', body: fd });
    const result = deserialize(await res.text());
    if (result.type === 'success' || result.type === 'failure') await invalidateAll();
  }

  // Drop targets nest (sub inside category) — stopPropagation so only the
  // innermost zone handles the drop and we don't double-assign.
  function onDropTarget(e: DragEvent, categoryId: number | null) {
    e.preventDefault();
    e.stopPropagation();
    const id = draggedId;
    draggedId = null;
    dragOverKey = null;
    if (id == null) return;
    postAction('?/assignCategory', { objectId: id, categoryId });
  }

  async function createTopCategory() {
    if (!newCatName.trim()) return;
    await postAction('?/createCategory', { name: newCatName.trim() });
    newCatName = '';
  }
  async function createSub(parentId: number) {
    if (!newSubName.trim()) return;
    await postAction('?/createCategory', { name: newSubName.trim(), parentId });
    newSubName = '';
    addingSubFor = null;
  }
  async function removeCategory(id: number) {
    await postAction('?/deleteCategory', { id });
  }
  function startRename(c: Category) { editingCatId = c.id; catNameDraft = c.name; }
  async function submitRename(id: number) {
    if (catNameDraft.trim()) await postAction('?/renameCategory', { id, name: catNameDraft.trim() });
    editingCatId = null;
  }

  const filteredItems = $derived(() => data.items || []);

  const totalItems = $derived(filteredItems().length);
  const totalStock = $derived(filteredItems().reduce((sum, i) => sum + i.in_stock, 0));
  // Low stock = below threshold but NOT out (out = zero or negative on oversell)
  const lowStockCount = $derived(filteredItems().filter(i => i.in_stock > 0 && i.in_stock < i.min_threshold).length);
  const outOfStockCount = $derived(filteredItems().filter(i => i.in_stock <= 0).length);

  // Runway: items that deplete within a horizon *assuming no further production*.
  // Only items with real sell-through (velocity > 0) ever run out; the rest sit at 999d.
  function runoutWithin(days: number): ObjectItemUI[] {
    return (data.items || []).filter(i =>
      (i.daily_velocity ?? 0) > 0 &&
      i.in_stock > 0 &&
      (i.days_until_stockout ?? 999) <= days
    );
  }
  const runoutWeek = $derived(runoutWithin(7));
  const runoutMonth = $derived(runoutWithin(30));

  // Stock coverage relative to the minimum threshold — anchors the bar so the
  // min line sits at 50% (ref = 2× min). Threshold-less items anchor to their own stock.
  function coverage(item: ObjectItem): { fill: number; minPct: number } {
    const min = item.min_threshold || 0;
    const ref = min > 0 ? min * 2 : Math.max(item.in_stock, 1);
    return {
      fill: Math.max(0, Math.min(1, item.in_stock / ref)) * 100,
      minPct: min > 0 ? 50 : 0
    };
  }

  // Stock level indicator. <= 0 counts as out (stock can go negative on oversell).
  function getStockLevel(item: ObjectItem): 'ok' | 'low' | 'out' {
    if (item.in_stock <= 0) return 'out';
    if (item.in_stock < item.min_threshold) return 'low';
    return 'ok';
  }

  function getStockColor(level: 'ok' | 'low' | 'out'): string {
    switch (level) {
      case 'out': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950';
      case 'low': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950';
      case 'ok': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950';
    }
  }

  // Format timestamp. created_at is stored in Unix SECONDS — convert to ms for Date.
  function formatTime(timestamp: number): string {
    const ms = timestamp * 1000;
    const date = new Date(ms);
    const now = new Date();
    const diff = now.getTime() - ms;

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
      case '+ printed': return { label: '+', color: 'text-green-600' };
      case '+ stock count': return { label: '✓', color: 'text-amber-600' };
      case '- stock count': return { label: '−', color: 'text-red-600' };
      case '- sold b2c': return { label: 'B2C', color: 'text-blue-600' };
      case '- sold b2b': return { label: 'B2B', color: 'text-purple-400' };
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
    if (d >= 999) return '∞';
    return `${Math.round(d * 10) / 10}d`;
  }

  // Group the activity feed: consecutive "- sold b2c" entries sharing a Shopify
  // order id collapse into one order block (its line items listed underneath);
  // everything else (printed, stock count, b2b) stays a standalone entry.
  interface ActivityGroup {
    orderId: string | null;
    orderNumber: string | null;
    created_at: number;
    items: ActivityLog[];
  }
  const activityGroups = $derived(() => {
    const groups: ActivityGroup[] = [];
    let current: ActivityGroup | null = null;
    for (const log of data.logs || []) {
      const oid = log.shopify_order_id ?? null;
      if (oid && current && current.orderId === oid) {
        current.items.push(log);
        continue;
      }
      current = { orderId: oid, orderNumber: log.order_number ?? null, created_at: log.created_at, items: [log] };
      groups.push(current);
      if (!oid) current = null; // non-order rows never absorb following entries
    }
    return groups;
  });
</script>

<svelte:head>
  <title>Inventory | 3D Tracker</title>
</svelte:head>

<div class="min-h-screen bg-[#f8f8f8] dark:bg-[#080808]">
  <div class="max-w-6xl mx-auto px-6 sm:px-8 py-10">

    <!-- Header -->
    <div class="flex items-start justify-between mb-10">
      <div>
        <h1 class="text-[2rem] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-none">Inventory</h1>
        <p class="text-zinc-400 dark:text-zinc-500 text-sm mt-2">Finished goods ready for sale</p>
      </div>
      <div class="flex flex-col items-end gap-3">
        <BackToDashboard />
        <div class="flex items-center gap-2">
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
    </div>

    <!-- Runway summary -->
    {#if runoutWeek.length > 0 || runoutMonth.length > 0}
      <div class="mb-6 rounded-xl border {runoutWeek.length > 0 ? 'border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20' : 'border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20'} px-5 py-4">
        <div class="flex items-start gap-3">
          <svg class="w-4 h-4 mt-0.5 shrink-0 {runoutWeek.length > 0 ? 'text-red-500' : 'text-amber-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <div class="min-w-0">
            <p class="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {#if runoutWeek.length > 0}
                <span class="text-red-600 dark:text-red-400 font-semibold">{runoutWeek.length}</span>
                {runoutWeek.length === 1 ? 'item runs' : 'items run'} out this week
              {:else}
                <span class="text-amber-600 dark:text-amber-400 font-semibold">{runoutMonth.length}</span>
                {runoutMonth.length === 1 ? 'item runs' : 'items run'} out this month
              {/if}
              <span class="text-zinc-400 dark:text-zinc-500 font-normal">· assuming no further production</span>
            </p>
            <div class="flex flex-wrap gap-1.5 mt-2">
              {#each (runoutWeek.length > 0 ? runoutWeek : runoutMonth).slice(0, 12) as i (i.id)}
                <span class="text-[11px] px-2 py-0.5 rounded-md bg-white/70 dark:bg-black/30 text-zinc-600 dark:text-zinc-300 tabular-nums">
                  {i.name} <span class="text-zinc-400">· {formatDays(i.days_until_stockout)}</span>
                </span>
              {/each}
              {#if (runoutWeek.length > 0 ? runoutWeek : runoutMonth).length > 12}
                <span class="text-[11px] px-2 py-0.5 text-zinc-400">+{(runoutWeek.length > 0 ? runoutWeek : runoutMonth).length - 12} more</span>
              {/if}
            </div>
            {#if runoutWeek.length > 0 && runoutMonth.length > runoutWeek.length}
              <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-2">{runoutMonth.length} run out within 30 days.</p>
            {/if}
          </div>
        </div>
      </div>
    {/if}

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

    {#snippet itemRow(item: ObjectItemUI, padClass: string)}
      {@const stockLevel = getStockLevel(item)}
      {@const cov = coverage(item)}
      <div
        role="listitem"
        draggable={manageMode}
        ondragstart={(e) => onDragStart(e, item.id)}
        ondragend={onDragEnd}
        class="flex items-center gap-4 {padClass} pr-5 py-2.5 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors {manageMode ? 'cursor-grab active:cursor-grabbing' : ''} {draggedId === item.id ? 'opacity-40' : ''} {stockLevel === 'out' ? 'border-l-2 border-l-red-400' : stockLevel === 'low' ? 'border-l-2 border-l-amber-400' : 'border-l-2 border-l-transparent'}"
      >
        <div class="flex items-center gap-2 flex-1 min-w-0">
          {#if manageMode}
            <svg class="w-3 h-3 text-zinc-300 dark:text-zinc-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9h8M8 15h8"/></svg>
          {/if}
          <span class="text-xs text-zinc-600 dark:text-zinc-400 truncate">{item.name}</span>
        </div>
        <div class="flex items-center gap-5">
          <div class="hidden sm:block w-16" title="{item.in_stock} in stock · min {item.min_threshold}">
            <div class="relative h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div class="absolute inset-y-0 left-0 rounded-full {stockLevel === 'out' ? 'bg-red-400' : stockLevel === 'low' ? 'bg-amber-400' : 'bg-emerald-400'}" style="width: {cov.fill}%"></div>
              {#if cov.minPct > 0}
                <div class="absolute top-0 bottom-0 w-px bg-zinc-400/70 dark:bg-zinc-500/70" style="left: {cov.minPct}%"></div>
              {/if}
            </div>
          </div>
          <div>
            <span class="text-[9px] text-zinc-400 block leading-none mb-0.5">vel.</span>
            <span class="text-xs tabular-nums text-zinc-500">{formatVelocity(item.daily_velocity)}</span>
          </div>
          <div>
            <span class="text-[9px] text-zinc-400 block leading-none mb-0.5">days</span>
            <span class="text-xs tabular-nums {item.days_until_stockout != null && item.days_until_stockout <= 7 ? 'text-red-500' : item.days_until_stockout != null && item.days_until_stockout <= 14 ? 'text-amber-500' : 'text-zinc-500'}">{formatDays(item.days_until_stockout)}</span>
          </div>
          <span class="min-w-10 h-7 px-2.5 flex items-center justify-center rounded-md text-xs font-semibold tabular-nums {stockLevel === 'out' ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' : stockLevel === 'low' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'}">{item.in_stock}</span>
        </div>
      </div>
    {/snippet}

    <!-- Main Content Grid -->
    <div class="grid lg:grid-cols-3 gap-5 mb-10">
      <!-- Stock Levels 2/3 -->
      <div class="lg:col-span-2">
        <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden">
          <div class="px-5 py-4 border-b border-zinc-50 dark:border-[#1a1a1a] flex items-center justify-between">
            <h2 class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Stock Levels</h2>
            <div class="flex items-center gap-3">
              <span class="text-[10px] text-zinc-400">{totalItems} items</span>
              <button
                onclick={() => manageMode = !manageMode}
                title={manageMode ? 'Done organizing' : 'Organize categories'}
                aria-pressed={manageMode}
                class="w-7 h-7 flex items-center justify-center rounded-md transition-colors {manageMode ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </button>
            </div>
          </div>
          {#if manageMode}
            <div class="px-5 py-2 bg-blue-50/60 dark:bg-blue-950/20 border-b border-blue-100/60 dark:border-blue-900/30 text-[11px] text-blue-600 dark:text-blue-300">
              Organizing — drag items into categories, double-click a name to rename, or use the +/trash actions.
            </div>
          {/if}

          <div class="divide-y divide-zinc-50 dark:divide-[#171717]">
            {#if (data.items || []).length === 0 && tree.groups.length === 0}
              <div class="py-12 text-center">
                <p class="text-sm text-zinc-400">No inventory items yet</p>
              </div>
            {/if}

            <!-- Categories -->
            {#each tree.groups as g (g.cat.id)}
              {@const catKey = `cat:${g.cat.id}`}
              {@const expanded = isExpanded(catKey, true)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                role="group"
                ondragover={(e) => onDragOver(e, catKey)}
                ondrop={(e) => onDropTarget(e, g.cat.id)}
                class="transition-colors {dragOverKey === catKey ? 'bg-blue-50/60 dark:bg-blue-950/20 ring-1 ring-inset ring-blue-400/50' : ''}"
              >
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <div
                  role="button"
                  tabindex="0"
                  onclick={() => toggleExpand(catKey, true)}
                  class="group px-5 py-4 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <svg class="w-3 h-3 shrink-0 text-zinc-300 dark:text-zinc-600 transition-transform duration-200 {expanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                    {#if editingCatId === g.cat.id}
                      <!-- svelte-ignore a11y_autofocus -->
                      <input
                        bind:value={catNameDraft}
                        autofocus
                        onclick={(e) => e.stopPropagation()}
                        onkeydown={(e) => { if (e.key === 'Enter') submitRename(g.cat.id); if (e.key === 'Escape') editingCatId = null; }}
                        onblur={() => submitRename(g.cat.id)}
                        class="h-7 px-2 text-sm font-semibold rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      />
                    {:else}
                      <span ondblclick={(e) => { if (!manageMode) return; e.stopPropagation(); startRename(g.cat); }} title={manageMode ? 'Double-click to rename' : ''} class="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{g.cat.name}</span>
                    {/if}
                    <span class="text-xs text-zinc-400 shrink-0">{g.stats.count}</span>
                  </div>

                  <div class="flex items-center gap-3 shrink-0">
                    {#if g.stats.out > 0}
                      <span class="text-[10px] font-medium text-red-500 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"></span>{g.stats.out} out</span>
                    {/if}
                    {#if g.stats.low > 0}
                      <span class="text-[10px] font-medium text-amber-500 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>{g.stats.low} low</span>
                    {/if}
                    <span class="text-xl font-light tabular-nums text-zinc-600 dark:text-zinc-400 min-w-12 text-right">{g.stats.totalStock}</span>
                    {#if manageMode}
                      <div class="flex items-center gap-1">
                        <button onclick={(e) => { e.stopPropagation(); addingSubFor = addingSubFor === g.cat.id ? null : g.cat.id; newSubName = ''; }} title="Add subcategory" class="w-6 h-6 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14M5 12h14"/></svg>
                        </button>
                        <button onclick={(e) => { e.stopPropagation(); removeCategory(g.cat.id); }} title="Delete category" class="w-6 h-6 flex items-center justify-center rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>

                {#if expanded}
                  <div class="border-t border-zinc-50 dark:border-[#171717]">
                    {#each g.items as item (item.id)}
                      {@render itemRow(item, 'pl-10')}
                    {/each}

                    {#each g.subs as s (s.cat.id)}
                      {@const subKey = `sub:${s.cat.id}`}
                      {@const subExpanded = isExpanded(subKey, false)}
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        role="group"
                        ondragover={(e) => onDragOver(e, subKey)}
                        ondrop={(e) => onDropTarget(e, s.cat.id)}
                        class="transition-colors {dragOverKey === subKey ? 'bg-blue-50/60 dark:bg-blue-950/20 ring-1 ring-inset ring-blue-400/50' : ''}"
                      >
                        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                        <div
                          role="button"
                          tabindex="0"
                          onclick={() => toggleExpand(subKey, false)}
                          class="group pl-10 pr-5 py-3 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors"
                        >
                          <div class="flex items-center gap-2.5 min-w-0">
                            <svg class="w-2.5 h-2.5 shrink-0 text-zinc-300 dark:text-zinc-600 transition-transform duration-200 {subExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                            {#if editingCatId === s.cat.id}
                              <!-- svelte-ignore a11y_autofocus -->
                              <input
                                bind:value={catNameDraft}
                                autofocus
                                onclick={(e) => e.stopPropagation()}
                                onkeydown={(e) => { if (e.key === 'Enter') submitRename(s.cat.id); if (e.key === 'Escape') editingCatId = null; }}
                                onblur={() => submitRename(s.cat.id)}
                                class="h-6 px-2 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                              />
                            {:else}
                              <span ondblclick={(e) => { if (!manageMode) return; e.stopPropagation(); startRename(s.cat); }} title={manageMode ? 'Double-click to rename' : ''} class="text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">{s.cat.name}</span>
                            {/if}
                            <span class="text-[10px] text-zinc-400 shrink-0">{s.stats.count}</span>
                          </div>
                          <div class="flex items-center gap-3 shrink-0">
                            {#if s.stats.out > 0}<span class="text-[10px] text-red-500">{s.stats.out} out</span>{/if}
                            {#if s.stats.low > 0}<span class="text-[10px] text-amber-500">{s.stats.low} low</span>{/if}
                            <span class="text-base font-light tabular-nums text-zinc-500 min-w-8 text-right">{s.stats.totalStock}</span>
                            {#if manageMode}
                              <button onclick={(e) => { e.stopPropagation(); removeCategory(s.cat.id); }} title="Delete subcategory" class="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-red-500">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                              </button>
                            {/if}
                          </div>
                        </div>
                        {#if subExpanded}
                          <div class="border-t border-zinc-50 dark:border-[#171717]">
                            {#if manageMode && s.items.length === 0}
                              <div class="pl-16 pr-5 py-3 text-[11px] text-zinc-300 dark:text-zinc-600 italic">Drag items here</div>
                            {/if}
                            {#each s.items as item (item.id)}
                              {@render itemRow(item, 'pl-16')}
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/each}

                    {#if manageMode && g.items.length === 0 && g.subs.length === 0}
                      <div class="pl-10 pr-5 py-3 text-[11px] text-zinc-300 dark:text-zinc-600 italic">Drag items here, or add a subcategory</div>
                    {/if}

                    {#if manageMode && addingSubFor === g.cat.id}
                      <div class="pl-10 pr-5 py-2.5 flex items-center gap-2 bg-zinc-50/50 dark:bg-[#0d0d0d]">
                        <!-- svelte-ignore a11y_autofocus -->
                        <input
                          bind:value={newSubName}
                          autofocus
                          placeholder="New subcategory…"
                          onkeydown={(e) => { if (e.key === 'Enter') createSub(g.cat.id); if (e.key === 'Escape') { addingSubFor = null; newSubName = ''; } }}
                          class="h-7 flex-1 max-w-xs px-2.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        />
                        <button onclick={() => createSub(g.cat.id)} class="h-7 px-3 text-xs rounded-md bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90">Add</button>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}

            <!-- Uncategorized (drop here to clear category) -->
            {#if tree.uncategorized.length > 0}
              {@const expanded = isExpanded('uncat', true)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                role="group"
                ondragover={(e) => onDragOver(e, 'uncat')}
                ondrop={(e) => onDropTarget(e, null)}
                class="transition-colors {dragOverKey === 'uncat' ? 'bg-blue-50/60 dark:bg-blue-950/20 ring-1 ring-inset ring-blue-400/50' : ''}"
              >
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <div
                  role="button"
                  tabindex="0"
                  onclick={() => toggleExpand('uncat', true)}
                  class="px-5 py-4 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <svg class="w-3 h-3 shrink-0 text-zinc-300 dark:text-zinc-600 transition-transform duration-200 {expanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                    <span class="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Uncategorized</span>
                    <span class="text-xs text-zinc-400">{tree.uncatStats.count}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    {#if tree.uncatStats.out > 0}
                      <span class="text-[10px] font-medium text-red-500 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"></span>{tree.uncatStats.out} out</span>
                    {/if}
                    {#if tree.uncatStats.low > 0}
                      <span class="text-[10px] font-medium text-amber-500 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>{tree.uncatStats.low} low</span>
                    {/if}
                    <span class="text-xl font-light tabular-nums text-zinc-600 dark:text-zinc-400 min-w-12 text-right">{tree.uncatStats.totalStock}</span>
                  </div>
                </div>
                {#if expanded}
                  <div class="border-t border-zinc-50 dark:border-[#171717]">
                    {#each tree.uncategorized as item (item.id)}
                      {@render itemRow(item, 'pl-10')}
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Create category (manage mode only) -->
            {#if manageMode}
              <div class="px-5 py-3 flex items-center gap-2 bg-zinc-50/40 dark:bg-[#0d0d0d]">
                <input
                  bind:value={newCatName}
                  placeholder="New category…"
                  onkeydown={(e) => { if (e.key === 'Enter') createTopCategory(); }}
                  class="h-8 flex-1 max-w-xs px-3 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                <button onclick={createTopCategory} class="h-8 px-3.5 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 transition-opacity">Add category</button>
              </div>
            {/if}
          </div>
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
              {#each activityGroups() as group}
                {#if group.orderId}
                  <!-- Shopify order block: header + line items -->
                  {@const orderQty = group.items.reduce((s, l) => s + Math.abs(l.quantity), 0)}
                  <div class="bg-zinc-50/60 dark:bg-[#0d0d0d]">
                    <div class="px-5 pt-3 pb-1.5 flex items-center justify-between gap-3">
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="inline-flex items-center justify-center px-1.5 h-4 rounded bg-blue-500/10 text-[9px] font-bold text-blue-500 shrink-0">B2C</span>
                        <span class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 truncate">
                          {group.orderNumber ? `Order #${group.orderNumber}` : 'Shopify order'}
                        </span>
                        <span class="text-zinc-300 dark:text-zinc-700 shrink-0">·</span>
                        <span class="text-[10px] text-zinc-400 dark:text-zinc-600 shrink-0">{formatTime(group.created_at)}</span>
                      </div>
                      <span class="text-[11px] font-semibold tabular-nums text-red-500 shrink-0">−{orderQty}</span>
                    </div>
                    <div class="pb-2">
                      {#each group.items as log}
                        <div class="pl-9 pr-5 py-1 flex items-center justify-between">
                          <span class="text-xs text-zinc-600 dark:text-zinc-400 truncate">{log.object_name}</span>
                          <span class="text-xs font-medium tabular-nums text-red-400 shrink-0">−{Math.abs(log.quantity)}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {:else}
                  <!-- Standalone entry (printed / stock count / b2b) -->
                  {@const log = group.items[0]}
                  {@const changeType = getChangeTypeLabel(log.change_type)}
                  {@const isOutflow = log.change_type.startsWith('-')}
                  <div class="px-5 py-3 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
                    <div class="flex items-center gap-3">
                      <span class="inline-flex items-center justify-center w-5 h-5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold shrink-0 {changeType.color}">
                        {changeType.label}
                      </span>
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate leading-snug">{log.object_name}</p>
                        <p class="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">{formatTime(log.created_at)}</p>
                      </div>
                      <span class="text-xs font-semibold tabular-nums shrink-0 {isOutflow ? 'text-red-500' : 'text-emerald-500'}">
                        {isOutflow ? '−' : '+'}{Math.abs(log.quantity)}
                      </span>
                    </div>
                  </div>
                {/if}
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
                        <p class="text-[10px] text-zinc-400 mt-0.5 truncate">{set.components.map(c => `${c.quantity}× ${getItemName(String(c.object_id))}`).join(' + ')}</p>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button onclick={() => { setCounts[set.shopify_sku] = Math.max(0, (setCounts[set.shopify_sku] || 0) - 1); setCounts = { ...setCounts }; }} disabled={(setCounts[set.shopify_sku] || 0) === 0}
                          class="w-7 h-7 flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">−</button>
                        <input type="number" min="0" value={setCounts[set.shopify_sku] || 0}
                          oninput={(e) => { setCounts[set.shopify_sku] = parseInt((e.target as HTMLInputElement).value) || 0; setCounts = { ...setCounts }; }}
                          class="w-12 h-7 bg-white dark:bg-[#111] border border-zinc-200 dark:border-zinc-700 rounded-md px-2 text-center text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"/>
                        <button onclick={() => { setCounts[set.shopify_sku] = (setCounts[set.shopify_sku] || 0) + 1; setCounts = { ...setCounts }; }}
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
                  {@const wKey = String(w.id)}
                  {@const count = getCountFromWeight(wKey)}
                  <div class="rounded-lg border border-zinc-100 dark:border-[#1e1e1e] bg-zinc-50 dark:bg-[#0d0d0d] px-4 py-3">
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{w.name}</p>
                        <p class="text-[10px] text-zinc-400 mt-0.5">{w.weight_per_unit}g / unit</p>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <div class="relative">
                          <input type="number" min="0" step="1" placeholder="0" value={weightInputs[wKey] || ''}
                            oninput={(e) => { weightInputs[wKey] = parseFloat((e.target as HTMLInputElement).value) || 0; weightInputs = { ...weightInputs }; }}
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
                  {@const iKey = String(item.id)}
                  {@const currentStock = item.in_stock}
                  {@const pending = directCounts[iKey] || 0}
                  <div class="rounded-lg border border-zinc-100 dark:border-[#1e1e1e] bg-zinc-50 dark:bg-[#0d0d0d] px-4 py-3">
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{item.name}</p>
                        <p class="text-[10px] text-zinc-400 mt-0.5">{currentStock}{pending > 0 ? ` → ${currentStock + pending}` : ''}</p>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button onclick={() => { directCounts[iKey] = Math.max(0, (directCounts[iKey] || 0) - 1); directCounts = { ...directCounts }; }} disabled={(directCounts[iKey] || 0) === 0}
                          class="w-7 h-7 flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">−</button>
                        <input type="number" min="0" value={directCounts[iKey] || 0}
                          oninput={(e) => { directCounts[iKey] = parseInt((e.target as HTMLInputElement).value) || 0; directCounts = { ...directCounts }; }}
                          class="w-12 h-7 bg-white dark:bg-[#111] border border-zinc-200 dark:border-zinc-700 rounded-md px-2 text-center text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"/>
                        <button onclick={() => { directCounts[iKey] = (directCounts[iKey] || 0) + 1; directCounts = { ...directCounts }; }}
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
                <input type="hidden" name="entries" value={JSON.stringify(Object.entries(setCounts).filter(([_, c]) => c > 0).map(([shopify_sku, count]) => ({ shopify_sku, count })))} />
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
                <input type="hidden" name="entries" value={JSON.stringify(Object.entries(weightPendingSummary()).map(([idKey, count]) => ({ id: parseInt(idKey), count })))} />
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
                <input type="hidden" name="entries" value={JSON.stringify(Object.entries(directCounts).filter(([_, c]) => c > 0).map(([idKey, count]) => ({ id: parseInt(idKey), count })))} />
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
