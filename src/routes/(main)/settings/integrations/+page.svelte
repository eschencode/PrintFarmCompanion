<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';

  export let data: PageData;
  export let form: ActionData;

  // ── SKU set editor ──────────────────────────────────────────────────────────
  type SetItem = {
    object_id: number;
    quantity: number;
  };

  let editingSetSku: string | null = null;
  let editingSetSkuInput = '';
  let editingSetOriginalSku = '';
  let editingSetItems: SetItem[] = [];
  let skuSearch = '';

  function openSetEditor(sku: string | null) {
    if (sku) {
      editingSetSku = sku;
      editingSetSkuInput = sku;
      editingSetOriginalSku = sku;
      const existing = (data.skuMappings as any[] ?? []).filter((m) => m.shopify_sku === sku);
      editingSetItems = existing.map((m) => ({
        object_id: m.object_id,
        quantity: m.quantity,
      }));
    } else {
      editingSetSku = '';
      editingSetSkuInput = '';
      editingSetOriginalSku = '';
      editingSetItems = [{ object_id: 0, quantity: 1 }];
    }
  }

  function closeSetEditor() {
    editingSetSku = null;
    editingSetItems = [];
  }

  function addSetItem() {
    editingSetItems = [...editingSetItems, { object_id: 0, quantity: 1 }];
  }

  function removeSetItem(index: number) {
    editingSetItems = editingSetItems.filter((_, i) => i !== index);
  }

  function getItemLabel(mapping: any): string {
    return mapping.object_name || `Object #${mapping.object_id}`;
  }

  $: groupedMappings = (() => {
    const search = skuSearch.toLowerCase();
    const filtered = (data.skuMappings as any[] ?? []).filter((m) =>
      m.shopify_sku.toLowerCase().includes(search) ||
      getItemLabel(m).toLowerCase().includes(search)
    );
    const groups: Record<string, typeof filtered> = {};
    for (const m of filtered) {
      if (!groups[m.shopify_sku]) groups[m.shopify_sku] = [];
      groups[m.shopify_sku].push(m);
    }
    return groups;
  })();

  // ── Inline inventory item creator ───────────────────────────────────────────
  let showNewInventoryItem = false;
  let newInvName = '';

  // ── Shopify test result ─────────────────────────────────────────────────────
  let testingShopify = false;
  let shopifyTestResult: { success: boolean; shopName?: string; error?: string } | null = null;

  async function testShopifyConnection() {
    testingShopify = true;
    shopifyTestResult = null;
    try {
      const res = await fetch('?/testShopifyConnection', { method: 'POST', body: new FormData() });
      const d = await res.json() as { type: string; data?: { success?: boolean; shopName?: string; error?: string } };
      shopifyTestResult = d.type === 'success' ? (d.data as any) : { success: false, error: d.data?.error ?? 'Unknown error' };
    } catch {
      shopifyTestResult = { success: false, error: 'Request failed' };
    }
    testingShopify = false;
  }
</script>

<div class="min-h-screen p-6 sm:p-10">
  <div class="max-w-2xl mx-auto">

    <div class="mb-8">
      <a href="/settings" class="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mb-4 tracking-wide transition-colors">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Settings
      </a>
      <h1 class="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Integrations</h1>
      <p class="text-zinc-400 dark:text-zinc-500 text-sm mt-1">Shopify sync and SKU → inventory mappings</p>
    </div>

    {#if form?.success}
      <div class="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-xl px-4 py-3 mb-6">
        <svg class="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
        <p class="text-sm text-emerald-700 dark:text-emerald-400">{form.message ?? 'Saved successfully'}</p>
      </div>
    {/if}
    {#if form?.error}
      <div class="flex items-center gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-xl px-4 py-3 mb-6">
        <svg class="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        <p class="text-sm text-red-700 dark:text-red-400">{form.error}</p>
      </div>
    {/if}

    <!-- ── Shopify Sync ────────────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-4">
      <div class="px-5 py-4 border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Shopify</p>
        <p class="text-xs text-zinc-400 mt-1">Sync orders and deduct inventory automatically</p>
      </div>

      <div class="p-5 space-y-4">
        {#if data.shopifyConfigured}
          <!-- Status row -->
          <div class="flex items-center gap-3">
            <span class="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
              Connected
            </span>
            {#if data.shopifySyncState?.last_sync_at}
              <span class="text-xs text-zinc-400">Last sync: {new Date(data.shopifySyncState.last_sync_at * 1000).toLocaleString()}</span>
            {:else}
              <span class="text-xs text-zinc-400">Never synced</span>
            {/if}
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 flex-wrap">
            <form method="POST" action="?/syncShopify" use:enhance={() => async ({ update }) => { await update(); }}>
              <button type="submit" class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition-colors" aria-label="Run Shopify sync now">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                Sync now
              </button>
            </form>
            <button
              type="button"
              onclick={testShopifyConnection}
              disabled={testingShopify}
              class="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Test Shopify connection"
            >
              {testingShopify ? 'Testing…' : 'Test connection'}
            </button>
            {#if shopifyTestResult}
              {#if shopifyTestResult.success}
                <span class="text-xs text-emerald-600 dark:text-emerald-400">Connected to {shopifyTestResult.shopName}</span>
              {:else}
                <span class="text-xs text-red-500">{shopifyTestResult.error}</span>
              {/if}
            {/if}
          </div>

          <!-- Recent sync orders -->
          {#if data.shopifyRecentOrders && (data.shopifyRecentOrders as any[]).length > 0}
            <div class="border border-zinc-100 dark:border-[#1e1e1e] rounded-lg overflow-hidden">
              <div class="px-4 py-2.5 bg-zinc-50 dark:bg-[#161616] border-b border-zinc-100 dark:border-[#1e1e1e]">
                <p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">Recent Synced Orders</p>
              </div>
              <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a]">
                {#each (data.shopifyRecentOrders as any[]).slice(0, 5) as order}
                  <div class="px-4 py-2.5 flex items-center justify-between text-xs">
                    <span class="font-medium text-zinc-700 dark:text-zinc-300">#{order.order_number ?? order.order_id}</span>
                    <span class="text-zinc-400">{order.total_items} items</span>
                    <span class="text-zinc-400">{new Date(order.processed_at * 1000).toLocaleDateString()}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

        {:else}
          <div class="flex items-start gap-3 p-4 bg-zinc-50 dark:bg-[#161616] rounded-lg">
            <svg class="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <div>
              <p class="text-sm text-zinc-700 dark:text-zinc-300 font-medium">Shopify not configured</p>
              <p class="text-xs text-zinc-400 mt-0.5">Set <code class="font-mono bg-zinc-200 dark:bg-[#2a2a2a] px-1 rounded">SHOPIFY_STORE_DOMAIN</code> and <code class="font-mono bg-zinc-200 dark:bg-[#2a2a2a] px-1 rounded">SHOPIFY_ACCESS_TOKEN</code> as environment variables to enable the Shopify integration.</p>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- ── SKU Mappings ───────────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-4">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">SKU Mappings</p>
          <p class="text-xs text-zinc-400 mt-0.5">Map Shopify SKUs to inventory items deducted on each order</p>
        </div>
        <button
          onclick={() => openSetEditor(null)}
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          aria-label="Add new SKU mapping"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          New Mapping
        </button>
      </div>

      {#if (data.skuMappings as any[] ?? []).length > 0}
        <!-- Search -->
        <div class="px-5 py-3 border-b border-zinc-50 dark:border-[#1a1a1a]">
          <input
            type="search"
            bind:value={skuSearch}
            placeholder="Filter by SKU or item name…"
            class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
            aria-label="Filter SKU mappings"
          />
        </div>

        {#if Object.keys(groupedMappings).length > 0}
          <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a]">
            {#each Object.entries(groupedMappings) as [sku, items]}
              <div class="px-5 py-3.5 flex items-start gap-4 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200 font-mono">{sku}</p>
                  <div class="flex flex-wrap gap-1 mt-1.5">
                    {#each items as item}
                      <span class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-[#1e1e1e] text-zinc-600 dark:text-zinc-400">
                        {getItemLabel(item)}
                        {#if item.quantity !== 1}
                          <span class="text-zinc-400">×{item.quantity}</span>
                        {/if}
                      </span>
                    {/each}
                  </div>
                </div>
                <div class="flex items-center gap-0.5 shrink-0 pt-0.5">
                  <button
                    onclick={() => openSetEditor(sku)}
                    class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors text-xs"
                    aria-label="Edit mapping for {sku}"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    Edit
                  </button>
                  <form method="POST" action="?/deleteSkuSet" use:enhance={() => async ({ result, update }) => { if (result.type === 'failure') alert((result.data as any)?.error ?? 'Failed to delete'); await update(); }}>
                    <input type="hidden" name="shopifySku" value={sku} />
                    <button
                      type="submit"
                      class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs"
                      onclick={(e) => { if (!confirm(`Delete mapping for SKU "${sku}"?`)) e.preventDefault(); }}
                      aria-label="Delete mapping for {sku}"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="px-5 py-6 text-center">
            <p class="text-sm text-zinc-400">No mappings match your filter</p>
          </div>
        {/if}
      {:else}
        <div class="px-5 py-10 text-center">
          <p class="text-sm text-zinc-400 mb-3">No SKU mappings yet</p>
          <button onclick={() => openSetEditor(null)} class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors">
            Add your first mapping
          </button>
        </div>
      {/if}
    </div>

    <!-- ── Inventory Items ────────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden">
      <div class="px-5 py-4 border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Inventory Items</p>
        <p class="text-xs text-zinc-400 mt-0.5">Items available as mapping targets — manage full details in <a href="/inventory" class="underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">Inventory</a></p>
      </div>

      {#if (data.inventoryItems as any[] ?? []).length > 0}
        <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a]">
          {#each (data.inventoryItems as any[]) as item}
            <div class="px-5 py-2.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
              <div class="flex-1 min-w-0">
                <p class="text-sm text-zinc-800 dark:text-zinc-200">{item.name}</p>
              </div>
              <span class="text-xs text-zinc-400 tabular-nums">{item.in_stock} in stock</span>
            </div>
          {/each}
        </div>
      {:else}
        <div class="px-5 py-8 text-center">
          <p class="text-sm text-zinc-400">No inventory items yet — <a href="/inventory" class="underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">go to Inventory</a> to create some.</p>
        </div>
      {/if}
    </div>

  </div>
</div>

<!-- ── SKU Set Editor Modal ───────────────────────────────────────────────── -->
{#if editingSetSku !== null}
  <div
    class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
    onclick={closeSetEditor}
    onkeydown={(e) => e.key === 'Escape' && closeSetEditor()}
    role="button" tabindex="0" aria-label="Close SKU mapping editor"
  >
    <div
      class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog" aria-modal="true" tabindex="-1"
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-zinc-50 dark:border-[#1a1a1a] flex justify-between items-center sticky top-0 bg-white dark:bg-[#111] z-10">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">{editingSetOriginalSku ? 'Edit Mapping' : 'New Mapping'}</p>
          <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-0.5">{editingSetOriginalSku || 'Add a SKU → inventory mapping'}</p>
        </div>
        <button onclick={closeSetEditor} class="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors" aria-label="Close">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <form
        method="POST"
        action="?/saveSkuSet"
        use:enhance={({ formData }) => {
          formData.set('items', JSON.stringify(editingSetItems));
          formData.set('originalSku', editingSetOriginalSku);
          return async ({ result, update }) => {
            if (result.type === 'success') {
              closeSetEditor();
              await update();
            } else {
              await update();
            }
          };
        }}
      >
        <div class="p-6 space-y-5">

          <!-- SKU input -->
          <div>
            <label for="shopifySku" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Shopify SKU *</label>
            <input
              id="shopifySku"
              type="text"
              name="shopifySku"
              bind:value={editingSetSkuInput}
              required
              placeholder="e.g., WIDGET-BLK-XL"
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm font-mono text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 placeholder:font-sans focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
            />
          </div>

          <!-- Items -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Items to deduct <span class="font-normal text-zinc-400">— when this SKU is ordered</span></p>
              <button type="button" onclick={addSetItem} class="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors" aria-label="Add another item to deduct">
                + Add item
              </button>
            </div>

            <div class="space-y-2">
              {#each editingSetItems as item, i}
                <div class="flex items-start gap-2 p-3 bg-zinc-50 dark:bg-[#161616] rounded-lg border border-zinc-100 dark:border-[#1e1e1e]">
                  <!-- Object selector -->
                  <select
                    bind:value={item.object_id}
                    class="flex-1 h-8 bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#262626] rounded-md px-2 text-xs text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 transition-colors min-w-0"
                    aria-label="Inventory item for row {i + 1}"
                  >
                    <option value={0}>— select item —</option>
                    {#each (data.inventoryItems as any[] ?? []) as inv}
                      <option value={inv.id}>{inv.name}</option>
                    {/each}
                  </select>

                  <!-- Quantity -->
                  <div class="flex items-center gap-1 shrink-0">
                    <span class="text-[10px] text-zinc-400">×</span>
                    <input
                      type="number"
                      bind:value={item.quantity}
                      min="1"
                      class="w-14 h-8 bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#262626] rounded-md px-2 text-xs text-zinc-900 dark:text-zinc-50 text-center focus:outline-none focus:border-zinc-400 transition-colors"
                      aria-label="Quantity for item {i + 1}"
                    />
                  </div>

                  <!-- Remove -->
                  {#if editingSetItems.length > 1}
                    <button
                      type="button"
                      onclick={() => removeSetItem(i)}
                      class="h-8 w-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                      aria-label="Remove item {i + 1}"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  {/if}
                </div>
              {/each}
            </div>

            <!-- Inline inventory item creator -->
            {#if !showNewInventoryItem}
              <button
                type="button"
                onclick={() => showNewInventoryItem = true}
                class="mt-2 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                + Create new inventory item
              </button>
            {:else}
              <div class="mt-3 p-3 bg-zinc-50 dark:bg-[#161616] rounded-lg border border-zinc-100 dark:border-[#1e1e1e] space-y-2">
                <p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">New Object</p>
                <div>
                  <label for="newInvName" class="text-[10px] text-zinc-400 block mb-1">Name</label>
                  <input id="newInvName" type="text" bind:value={newInvName} placeholder="Widget Black XL" class="w-full h-8 bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#262626] rounded-md px-2.5 text-xs text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"/>
                </div>
                <div class="flex gap-2">
                  <form method="POST" action="?/addInventoryItem"
                    use:enhance={({ formData }) => {
                      formData.set('name', newInvName);
                      return async ({ result, update }) => {
                        if (result.type === 'success') {
                          (data.inventoryItems as any[]).push({ name: newInvName, in_stock: 0 });
                          data.inventoryItems = [...(data.inventoryItems as any[])];
                          newInvName = '';
                          showNewInventoryItem = false;
                        }
                        await update({ reset: false });
                      };
                    }}
                  >
                    <button type="submit" disabled={!newInvName.trim()} class="h-7 px-3 rounded-md text-[11px] font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      Create
                    </button>
                  </form>
                  <button type="button" onclick={() => { showNewInventoryItem = false; newInvName = ''; }} class="h-7 px-3 rounded-md text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            {/if}
          </div>

        </div>

        <div class="px-6 py-4 border-t border-zinc-50 dark:border-[#1a1a1a] flex justify-end gap-3">
          <button type="button" onclick={closeSetEditor} class="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Cancel</button>
          <button
            type="submit"
            disabled={!editingSetSkuInput.trim() || editingSetItems.length === 0}
            class="bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 dark:text-zinc-100 font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {editingSetOriginalSku ? 'Save Changes' : 'Add Mapping'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
