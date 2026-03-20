<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';

  interface SetComponent { inventory_slug: string; quantity: number; }
  interface SetDefinition { sku: string; label: string; components: SetComponent[]; }

  let { data }: { data: PageData } = $props();

  type Mode = 'sets' | 'direct';
  let activeMode = $state<Mode>('sets');
  let submitting = $state(false);
  let successMessage = $state('');

  // Set sell state
  let setCounts = $state<Record<string, number>>({});
  let setSearch = $state('');

  // Direct sell state
  let directCounts = $state<Record<string, number>>({});
  let directSearch = $state('');

  function getItemName(slug: string): string {
    return (data.items || []).find(i => i.slug === slug)?.name || slug;
  }

  const visibleSets = $derived(
    (data.setDefinitions || []).filter(s =>
      !setSearch || s.label.toLowerCase().includes(setSearch.toLowerCase()) || s.sku.toLowerCase().includes(setSearch.toLowerCase())
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

  // Summaries
  const setSummary = $derived(() => {
    const s: Record<string, number> = {};
    for (const set of (data.setDefinitions || [])) {
      const n = setCounts[set.sku] || 0;
      if (n <= 0) continue;
      for (const comp of set.components) {
        s[comp.inventory_slug] = (s[comp.inventory_slug] || 0) + comp.quantity * n;
      }
    }
    return s;
  });

  const directSummary = $derived(() => {
    const s: Record<string, number> = {};
    for (const [slug, count] of Object.entries(directCounts)) {
      if (count > 0) s[slug] = count;
    }
    return s;
  });

  const activeSummary = $derived(() => activeMode === 'sets' ? setSummary() : directSummary());
  const totalItems = $derived(() => Object.values(activeSummary()).reduce((s, v) => s + v, 0));

  const inputCls = 'w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50';
  const stepperInputCls = 'w-14 bg-zinc-100 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-sm px-2 py-1.5 text-center text-sm font-medium text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50';
  const minusBtnCls = 'w-8 h-8 flex items-center justify-center rounded-sm bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-medium';
  const plusBtnCls = 'w-8 h-8 flex items-center justify-center rounded-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors text-base font-medium';
</script>

<svelte:head>
  <title>B2B Sale | Inventory</title>
</svelte:head>

<div class="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50">
  <!-- Page header -->
  <div class="border-b border-zinc-200 dark:border-[#262626] px-6 py-4">
    <div class="max-w-3xl mx-auto flex items-center gap-4">
      <a href="/inventory" class="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19l-7-7 7-7" />
        </svg>
      </a>
      <div>
        <h1 class="text-base font-medium text-zinc-900 dark:text-zinc-50">B2B Sale</h1>
        <p class="text-xs text-zinc-500 mt-0.5">Record a wholesale order and deduct inventory</p>
      </div>
    </div>
  </div>

  <div class="max-w-3xl mx-auto px-6 py-8">

    <!-- Mode switcher -->
    <div class="flex items-center gap-1 border-b border-zinc-200 dark:border-[#262626] mb-6">
      <button
        onclick={() => { activeMode = 'sets'; }}
        class="px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px {activeMode === 'sets' ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50 font-medium' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}"
      >By Sets</button>
      <button
        onclick={() => { activeMode = 'direct'; }}
        class="px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px {activeMode === 'direct' ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50 font-medium' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}"
      >Individual Items</button>
    </div>

    <!-- SETS MODE -->
    {#if activeMode === 'sets'}
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
                    onclick={() => { setCounts[set.sku] = Math.max(0, (setCounts[set.sku] || 0) - 1); setCounts = { ...setCounts }; }}
                    disabled={(setCounts[set.sku] || 0) === 0}
                    class={minusBtnCls}
                  >−</button>
                  <input
                    type="number" min="0"
                    value={setCounts[set.sku] || 0}
                    oninput={(e) => { setCounts[set.sku] = parseInt((e.target as HTMLInputElement).value) || 0; setCounts = { ...setCounts }; }}
                    class={stepperInputCls}
                  />
                  <button
                    onclick={() => { setCounts[set.sku] = (setCounts[set.sku] || 0) + 1; setCounts = { ...setCounts }; }}
                    class={plusBtnCls}
                  >+</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    <!-- DIRECT MODE -->
    {:else}
      <div class="space-y-4">
        <input type="text" bind:value={directSearch} placeholder="Search items..." class={inputCls} />
        {#if visibleDirectItems.length === 0}
          <p class="text-center text-zinc-400 dark:text-zinc-500 py-12 text-sm">No items found</p>
        {:else}
          <div class="space-y-1.5">
            {#each visibleDirectItems as item}
              {@const slug = item.slug || ''}
              <div class="flex items-center gap-3 px-4 py-2.5 border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#111111] hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-zinc-900 dark:text-zinc-50 truncate">{item.name}</p>
                  <p class="text-xs text-zinc-400 dark:text-zinc-500">
                    In stock: {item.stock_count}
                    {#if (directCounts[slug] || 0) > 0}
                      → {Math.max(0, item.stock_count - (directCounts[slug] || 0))} after sale
                    {/if}
                  </p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button
                    onclick={() => { directCounts[slug] = Math.max(0, (directCounts[slug] || 0) - 1); directCounts = { ...directCounts }; }}
                    disabled={(directCounts[slug] || 0) === 0}
                    class={minusBtnCls}
                  >−</button>
                  <input
                    type="number" min="0"
                    value={directCounts[slug] || 0}
                    oninput={(e) => { directCounts[slug] = parseInt((e.target as HTMLInputElement).value) || 0; directCounts = { ...directCounts }; }}
                    class={stepperInputCls}
                  />
                  <button
                    onclick={() => { directCounts[slug] = (directCounts[slug] || 0) + 1; directCounts = { ...directCounts }; }}
                    class={plusBtnCls}
                  >+</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Summary + confirm -->
    {#if Object.keys(activeSummary()).length > 0}
      <div class="mt-6 border border-zinc-200 dark:border-[#262626] rounded-lg overflow-hidden">
        <div class="px-4 py-3 border-b border-zinc-200 dark:border-[#262626] bg-zinc-50 dark:bg-[#111111]">
          <h2 class="text-xs font-medium text-zinc-500 uppercase tracking-wide">Items to deduct</h2>
        </div>
        <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
          {#each Object.entries(activeSummary()) as [slug, qty]}
            <div class="flex items-center justify-between px-4 py-2.5">
              <span class="text-sm text-zinc-700 dark:text-zinc-300">{getItemName(slug)}</span>
              <span class="text-sm font-medium text-red-600 dark:text-red-400">−{qty}</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between gap-4">
        {#if successMessage}
          <span class="text-sm text-green-600 dark:text-green-400">{successMessage}</span>
        {:else}
          <span class="text-sm text-zinc-500">{totalItems()} units across {Object.keys(activeSummary()).length} items</span>
        {/if}

        <form
          method="POST"
          action={activeMode === 'sets' ? '?/b2bSellSets' : '?/b2bSellDirect'}
          use:enhance={() => {
            submitting = true;
            return async ({ result, update }) => {
              submitting = false;
              if (result.type === 'success') {
                successMessage = 'Sale recorded';
                setTimeout(() => goto('/inventory'), 1500);
              }
              await update();
            };
          }}
        >
          {#if activeMode === 'sets'}
            <input type="hidden" name="entries" value={JSON.stringify(
              Object.entries(setCounts).filter(([, c]) => (c || 0) > 0).map(([sku, count]) => ({ sku, count: count || 0 }))
            )} />
          {:else}
            <input type="hidden" name="entries" value={JSON.stringify(
              Object.entries(directCounts).filter(([, c]) => (c || 0) > 0).map(([slug, count]) => ({ slug, count: count || 0 }))
            )} />
          {/if}
          <button
            type="submit"
            disabled={submitting || totalItems() === 0}
            class="px-5 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:bg-zinc-200 dark:disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed text-white dark:text-zinc-900 rounded-md text-sm font-medium transition-colors"
          >
            {submitting ? 'Recording…' : 'Confirm Sale'}
          </button>
        </form>
      </div>
    {/if}

  </div>
</div>
