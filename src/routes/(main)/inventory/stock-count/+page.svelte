<script lang="ts">
  import type { PageData } from './$types';
  import type { InventoryItem } from '$lib/types';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';

  interface SetComponent { inventory_slug: string; quantity: number; }
  interface SetDefinition { sku: string; label: string; components: SetComponent[]; }
  interface UnitWeight { slug: string; name: string; weight_per_unit: number; }

  let { data }: { data: PageData } = $props();

  type Tab = 'sets' | 'weight' | 'direct' | 'review';
  let activeTab = $state<Tab>('sets');
  let submitting = $state(false);
  let successMessage = $state('');

  // Counting state
  let countSetCounts = $state<Record<string, number>>({});
  let countWeightInputs = $state<Record<string, number>>({});
  let countDirectCounts = $state<Record<string, number>>({});

  // Search state per tab
  let setSearch = $state('');
  let weightSearch = $state('');
  let directSearch = $state('');

  // Baseline = current stock from server
  const baseline = $derived(
    Object.fromEntries(
      (data.items || []).filter(i => i.slug).map(i => [i.slug as string, i.stock_count])
    )
  );

  // Filtered lists
  const visibleSets = $derived(
    (data.setDefinitions || []).filter(s =>
      !setSearch || s.label.toLowerCase().includes(setSearch.toLowerCase()) || s.sku.toLowerCase().includes(setSearch.toLowerCase())
    )
  );

  const visibleWeightItems = $derived(
    (data.unitWeights || []).filter(w =>
      !weightSearch || w.name.toLowerCase().includes(weightSearch.toLowerCase())
    )
  );

  const visibleDirectItems = $derived(
    (data.items || [])
      .filter(i => {
        const n = i.name.toLowerCase();
        const s = i.slug?.toLowerCase() || '';
        return !(n.includes('vase shrunk') || s.includes('vase-shrunk'));
      })
      .filter(i =>
        !directSearch || i.name.toLowerCase().includes(directSearch.toLowerCase()) || i.slug?.toLowerCase().includes(directSearch.toLowerCase())
      )
  );

  // Combined counted totals across all methods
  const totals = $derived(() => {
    const t: Record<string, number> = {};
    for (const set of (data.setDefinitions || [])) {
      const n = countSetCounts[set.sku] || 0;
      if (n <= 0) continue;
      for (const comp of set.components) {
        t[comp.inventory_slug] = (t[comp.inventory_slug] || 0) + comp.quantity * n;
      }
    }
    for (const [slug, weight] of Object.entries(countWeightInputs)) {
      const uw = (data.unitWeights || []).find(w => w.slug === slug);
      if (!uw || weight <= 0) continue;
      const count = Math.floor(weight / uw.weight_per_unit);
      if (count > 0) t[slug] = (t[slug] || 0) + count;
    }
    for (const [slug, count] of Object.entries(countDirectCounts)) {
      if (count > 0) t[slug] = (t[slug] || 0) + count;
    }
    return t;
  });

  function getCountedItems() { return totals(); }

  function getWeightCount(slug: string): number {
    const weight = countWeightInputs[slug] || 0;
    const uw = (data.unitWeights || []).find(w => w.slug === slug);
    if (!uw || uw.weight_per_unit <= 0 || weight <= 0) return 0;
    return Math.floor(weight / uw.weight_per_unit);
  }

  function getItemName(slug: string): string {
    return (data.items || []).find(i => i.slug === slug)?.name || slug;
  }

  const reviewSlugs = $derived(() => {
    const t = totals();
    return [...new Set([...Object.keys(baseline), ...Object.keys(t)])].filter(
      slug => (baseline[slug] || 0) > 0 || (t[slug] || 0) > 0
    );
  });

  const totalLoss = $derived(() =>
    reviewSlugs().reduce((s, slug) => s + Math.min(0, (totals()[slug] || 0) - (baseline[slug] || 0)), 0)
  );
  const totalGain = $derived(() =>
    reviewSlugs().reduce((s, slug) => s + Math.max(0, (totals()[slug] || 0) - (baseline[slug] || 0)), 0)
  );
  const discrepancies = $derived(() =>
    reviewSlugs().filter(slug => (totals()[slug] || 0) !== (baseline[slug] || 0))
  );

  const inputCls = 'w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50';
  const stepperInputCls = 'w-14 bg-zinc-100 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-sm px-2 py-1.5 text-center text-sm font-medium text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50';
  const minusBtnCls = 'w-8 h-8 flex items-center justify-center rounded-sm bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-medium';
  const plusBtnCls = 'w-8 h-8 flex items-center justify-center rounded-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors text-base font-medium';
</script>

<svelte:head>
  <title>Stock Count | Inventory</title>
</svelte:head>

<div class="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50">
  <!-- Page header -->
  <div class="border-b border-zinc-200 dark:border-[#262626] px-6 py-4">
    <div class="max-w-3xl mx-auto flex items-center gap-4">
      <a href="/inventory" aria-label="Go back" class="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19l-7-7 7-7" />
        </svg>
      </a>
      <div>
        <h1 class="text-base font-medium text-zinc-900 dark:text-zinc-50">Stock Count</h1>
        <p class="text-xs text-zinc-500 mt-0.5">Count physical inventory and reconcile discrepancies</p>
      </div>
    </div>
  </div>

  <div class="max-w-3xl mx-auto px-6 py-8">

    <!-- Tab navigation -->
    <div class="flex items-center gap-1 border-b border-zinc-200 dark:border-[#262626] mb-6">
      {#each [['sets', 'By Sets'], ['weight', 'By Weight'], ['direct', 'Direct Count'], ['review', 'Review & Apply']] as [id, label]}
        <button
          onclick={() => activeTab = id as Tab}
          class="px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px {activeTab === id ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50 font-medium' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}"
        >{label}</button>
      {/each}
      {#if Object.keys(totals()).length > 0}
        <span class="ml-auto text-xs text-zinc-500 pb-2">{Object.keys(totals()).length} items counted</span>
      {/if}
    </div>

    <!-- SETS TAB -->
    {#if activeTab === 'sets'}
      <div class="space-y-4">
        <input type="text" bind:value={setSearch} placeholder="Search sets..." class={inputCls} />
        {#if visibleSets.length === 0}
          <p class="text-center text-zinc-400 dark:text-zinc-500 py-12 text-sm">No set definitions found</p>
        {:else}
          <div class="space-y-2">
            {#each visibleSets as set}
              <div class="flex items-center gap-3 px-4 py-3 border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#111111] hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">{set.label}</p>
                  <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{set.components.map(c => `${c.quantity}× ${getItemName(c.inventory_slug)}`).join(' + ')}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button
                    onclick={() => { countSetCounts[set.sku] = Math.max(0, (countSetCounts[set.sku] || 0) - 1); countSetCounts = { ...countSetCounts }; }}
                    disabled={(countSetCounts[set.sku] || 0) === 0}
                    class={minusBtnCls}
                  >−</button>
                  <input
                    type="number" min="0"
                    value={countSetCounts[set.sku] || 0}
                    oninput={(e) => { countSetCounts[set.sku] = parseInt((e.target as HTMLInputElement).value) || 0; countSetCounts = { ...countSetCounts }; }}
                    class={stepperInputCls}
                  />
                  <button
                    onclick={() => { countSetCounts[set.sku] = (countSetCounts[set.sku] || 0) + 1; countSetCounts = { ...countSetCounts }; }}
                    class={plusBtnCls}
                  >+</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    <!-- WEIGHT TAB -->
    {:else if activeTab === 'weight'}
      <div class="space-y-4">
        <div>
          <input type="text" bind:value={weightSearch} placeholder="Search items..." class={inputCls} />
          <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-2">Enter total weight in grams — item count is calculated automatically</p>
        </div>
        {#if visibleWeightItems.length === 0}
          <p class="text-center text-zinc-400 dark:text-zinc-500 py-12 text-sm">No items with weight data available</p>
        {:else}
          <div class="space-y-2">
            {#each visibleWeightItems as w}
              {@const count = getWeightCount(w.slug)}
              <div class="flex items-center gap-3 px-4 py-3 border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#111111] hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">{w.name}</p>
                  <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{w.weight_per_unit}g per unit</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <div class="relative">
                    <input
                      type="number" min="0" step="1" placeholder="0"
                      value={countWeightInputs[w.slug] || ''}
                      oninput={(e) => { countWeightInputs[w.slug] = parseFloat((e.target as HTMLInputElement).value) || 0; countWeightInputs = { ...countWeightInputs }; }}
                      class="w-24 bg-zinc-100 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-sm px-2 py-1.5 text-right text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 pr-6"
                    />
                    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">g</span>
                  </div>
                  <span class="text-zinc-300 dark:text-zinc-600">=</span>
                  <span class="w-10 text-center text-sm font-medium {count > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400 dark:text-zinc-500'}">{count}</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    <!-- DIRECT TAB -->
    {:else if activeTab === 'direct'}
      <div class="space-y-4">
        <div>
          <input type="text" bind:value={directSearch} placeholder="Search items..." class={inputCls} />
          <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-2">Enter the exact count you physically found for each item</p>
        </div>
        {#if visibleDirectItems.length === 0}
          <p class="text-center text-zinc-400 dark:text-zinc-500 py-12 text-sm">No items found</p>
        {:else}
          <div class="space-y-1.5">
            {#each visibleDirectItems as item}
              {@const slug = item.slug || ''}
              {@const expected = baseline[slug] ?? item.stock_count}
              {@const counted = countDirectCounts[slug] || 0}
              <div class="flex items-center gap-3 px-4 py-2.5 border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#111111] hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-zinc-900 dark:text-zinc-50 truncate">{item.name}</p>
                  <p class="text-xs text-zinc-400 dark:text-zinc-500">Expected: {expected}{counted > 0 ? ` → counted: ${counted}` : ''}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button
                    onclick={() => { countDirectCounts[slug] = Math.max(0, (countDirectCounts[slug] || 0) - 1); countDirectCounts = { ...countDirectCounts }; }}
                    disabled={(countDirectCounts[slug] || 0) === 0}
                    class={minusBtnCls}
                  >−</button>
                  <input
                    type="number" min="0"
                    value={countDirectCounts[slug] || 0}
                    oninput={(e) => { countDirectCounts[slug] = parseInt((e.target as HTMLInputElement).value) || 0; countDirectCounts = { ...countDirectCounts }; }}
                    class={stepperInputCls}
                  />
                  <button
                    onclick={() => { countDirectCounts[slug] = (countDirectCounts[slug] || 0) + 1; countDirectCounts = { ...countDirectCounts }; }}
                    class={plusBtnCls}
                  >+</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    <!-- REVIEW TAB -->
    {:else if activeTab === 'review'}
      {@const allSlugs = reviewSlugs()}
      {@const t = totals()}

      {#if allSlugs.length === 0}
        <div class="text-center py-16">
          <p class="text-zinc-500 text-sm">No items counted yet.</p>
          <p class="text-zinc-400 dark:text-zinc-600 text-xs mt-1">Use the Sets, Weight, or Direct tabs to enter counts first.</p>
          <button onclick={() => activeTab = 'sets'} class="mt-4 px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-[#262626] rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">Start counting</button>
        </div>
      {:else}
        <!-- Summary strip -->
        <div class="grid grid-cols-3 gap-3 mb-6">
          <div class="p-4 border border-zinc-200 dark:border-[#262626] rounded-lg text-center">
            <p class="text-2xl font-medium text-zinc-900 dark:text-zinc-50">{allSlugs.length}</p>
            <p class="text-xs text-zinc-500 mt-1">items reviewed</p>
          </div>
          <div class="p-4 border border-red-100 dark:border-red-900 rounded-lg text-center bg-red-50 dark:bg-red-950">
            <p class="text-2xl font-medium text-red-600 dark:text-red-400">{totalLoss()}</p>
            <p class="text-xs text-zinc-500 mt-1">total loss</p>
          </div>
          <div class="p-4 border border-green-100 dark:border-green-900 rounded-lg text-center bg-green-50 dark:bg-green-950">
            <p class="text-2xl font-medium text-green-600 dark:text-green-400">+{totalGain()}</p>
            <p class="text-xs text-zinc-500 mt-1">total gain</p>
          </div>
        </div>

        <!-- Diff table -->
        <div class="border border-zinc-200 dark:border-[#262626] rounded-lg overflow-hidden mb-6">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-zinc-50 dark:bg-[#111111] border-b border-zinc-200 dark:border-[#262626] text-left">
                <th class="px-4 py-2.5 text-xs font-medium text-zinc-500">Item</th>
                <th class="px-4 py-2.5 text-xs font-medium text-zinc-500 text-right">Expected</th>
                <th class="px-4 py-2.5 text-xs font-medium text-zinc-500 text-right">Counted</th>
                <th class="px-4 py-2.5 text-xs font-medium text-zinc-500 text-right">Diff</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
              {#each allSlugs.sort((a, b) => getItemName(a).localeCompare(getItemName(b))) as slug}
                {@const expected = baseline[slug] || 0}
                {@const counted = t[slug] || 0}
                {@const delta = counted - expected}
                <tr class="{delta < 0 ? 'bg-red-50 dark:bg-red-950' : delta > 0 ? 'bg-green-50 dark:bg-green-950' : ''}">
                  <td class="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{getItemName(slug)}</td>
                  <td class="px-4 py-2.5 text-right text-zinc-400 dark:text-zinc-500">{expected}</td>
                  <td class="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{counted}</td>
                  <td class="px-4 py-2.5 text-right font-medium {delta < 0 ? 'text-red-600 dark:text-red-400' : delta > 0 ? 'text-green-600 dark:text-green-400' : 'text-zinc-400 dark:text-zinc-500'}">
                    {delta > 0 ? '+' : ''}{delta}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Footer actions -->
        <div class="flex items-center justify-between gap-4">
          <p class="text-xs text-zinc-500">
            {#if discrepancies().length > 0}
              {discrepancies().length} discrepanc{discrepancies().length === 1 ? 'y' : 'ies'} found — applying will update stock values.
            {:else}
              Everything matches — no discrepancies found.
            {/if}
          </p>
          <div class="flex items-center gap-3">
            {#if successMessage}
              <span class="text-sm text-green-600 dark:text-green-400">{successMessage}</span>
            {/if}
            <form
              method="POST"
              action="?/applyStockCount"
              use:enhance={() => {
                submitting = true;
                return async ({ result, update }) => {
                  submitting = false;
                  if (result.type === 'success') {
                    successMessage = 'Stock count applied';
                    setTimeout(() => goto('/inventory'), 1500);
                  }
                  await update();
                };
              }}
            >
              <input type="hidden" name="entries" value={JSON.stringify(allSlugs.map(slug => ({ slug, count: t[slug] || 0 })))} />
              <button
                type="submit"
                disabled={submitting || allSlugs.length === 0}
                class="px-5 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:bg-zinc-200 dark:disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed text-white dark:text-zinc-900 rounded-md text-sm font-medium transition-colors"
              >
                {submitting ? 'Applying…' : `Apply Count (${allSlugs.length} items)`}
              </button>
            </form>
          </div>
        </div>
      {/if}
    {/if}

  </div>
</div>
