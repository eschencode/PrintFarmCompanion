<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  import type { Product } from './+page.server';

  export let data: PageData;
  export let form: ActionData;

  let searchQuery = '';
  let activeCategory = '';
  let editingId: number | null = null;
  let showNewForm = false;

  let editName = '';
  let editCategory = '';
  let editMinThreshold = 5;
  let editError = '';
  let saving = false;
  let deleteConfirmId: number | null = null;

  $: filtered = (() => {
    let items: Product[] = data.products ?? [];
    if (activeCategory) items = items.filter(p => p.category === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q)
      );
    }
    return items;
  })();

  $: categorySuggestions = [
    ...(data.categories ?? []),
    ...(editCategory && !(data.categories ?? []).includes(editCategory) ? [editCategory] : []),
  ];

  function startEdit(product: Product) {
    editingId = product.id;
    showNewForm = false;
    editName = product.name;
    editCategory = product.category ?? '';
    editMinThreshold = product.min_threshold;
    editError = '';
  }

  function startNew() {
    editingId = null;
    showNewForm = true;
    editName = '';
    editCategory = activeCategory;
    editMinThreshold = 5;
    editError = '';
  }

  function cancelEdit() {
    editingId = null;
    showNewForm = false;
    editError = '';
  }

  function stockBadge(p: Product): { label: string; class: string } {
    if (p.in_stock === 0)
      return { label: 'Out of stock', class: 'bg-red-500/10 text-red-500 dark:text-red-400' };
    if (p.in_stock < p.min_threshold)
      return { label: `Low — ${p.in_stock}`, class: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' };
    return { label: `${p.in_stock} in stock`, class: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  }

  $: if (form?.success) { editingId = null; showNewForm = false; editError = ''; }
  $: if ((form as any)?.error) { editError = (form as any).error; }
</script>

<svelte:head><title>Products — PrintFarm</title></svelte:head>

<div class="min-h-screen bg-zinc-50 dark:bg-[#080808]">
  <div class="border-b border-zinc-200 dark:border-[#1a1a1a] bg-white dark:bg-[#0c0c0f] sticky top-0 z-10">
    <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <a href="/" aria-label="Back to dashboard" class="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </a>
        <div>
          <h1 class="text-lg font-medium text-zinc-900 dark:text-zinc-50 tracking-tight">Products</h1>
          <p class="text-xs text-zinc-400 dark:text-zinc-600">Objects produced by the farm — linked to modules and Shopify SKUs</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <input
          type="search"
          bind:value={searchQuery}
          placeholder="Search…"
          class="h-9 px-3.5 text-sm bg-zinc-50 dark:bg-[#111] border border-zinc-200 dark:border-[#262626] rounded-lg text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors w-52"
        />
        <button onclick={startNew} class="h-9 px-4 rounded-lg text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors">
          + New Object
        </button>
      </div>
    </div>

    {#if (data.categories ?? []).length > 0}
      <div class="max-w-5xl mx-auto px-6 pb-3 flex items-center gap-2 flex-wrap">
        <button onclick={() => activeCategory = ''} class="text-xs px-3 py-1 rounded-full transition-colors {activeCategory === '' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-[#1a1a1a] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'}">All</button>
        {#each data.categories as cat}
          <button onclick={() => activeCategory = cat === activeCategory ? '' : cat} class="text-xs px-3 py-1 rounded-full transition-colors {activeCategory === cat ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-[#1a1a1a] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'}">{cat}</button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="max-w-5xl mx-auto px-6 py-8 space-y-3">

    {#if showNewForm}
      <div class="bg-white dark:bg-[#0c0c0f] border-2 border-emerald-500/30 rounded-xl p-6">
        <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-4">New Object</h3>
        {#if editError}<p class="text-xs text-red-500 mb-3">{editError}</p>{/if}
        <form method="POST" action="?/saveItem" use:enhance={() => { saving = true; return async ({ update }) => { saving = false; await update(); }; }}>
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="col-span-2">
              <label for="new-name" class="text-xs text-zinc-400 block mb-1">Name *</label>
              <input id="new-name" bind:value={editName} name="name" required
                class="w-full h-9 px-3 text-sm bg-zinc-50 dark:bg-[#111] border border-zinc-200 dark:border-[#262626] rounded-lg text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 transition-colors" />
            </div>
            <div>
              <label for="new-category" class="text-xs text-zinc-400 block mb-1">Category</label>
              <input id="new-category" bind:value={editCategory} name="category" list="category-suggestions" placeholder="e.g. Hooks"
                class="w-full h-9 px-3 text-sm bg-zinc-50 dark:bg-[#111] border border-zinc-200 dark:border-[#262626] rounded-lg text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 transition-colors" />
              <datalist id="category-suggestions">{#each categorySuggestions as s}<option value={s}></option>{/each}</datalist>
            </div>
            <div>
              <label for="new-min" class="text-xs text-zinc-400 block mb-1">Min. Stock Threshold</label>
              <input id="new-min" type="number" bind:value={editMinThreshold} name="min_threshold" min="0"
                class="w-full h-9 px-3 text-sm bg-zinc-50 dark:bg-[#111] border border-zinc-200 dark:border-[#262626] rounded-lg text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 transition-colors" />
            </div>
          </div>
          <div class="flex gap-2">
            <button type="submit" disabled={saving} class="h-9 px-4 rounded-lg text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50">{saving ? 'Saving…' : 'Create Object'}</button>
            <button type="button" onclick={cancelEdit} class="h-9 px-4 rounded-lg text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    {/if}

    {#if filtered.length === 0 && !showNewForm}
      <div class="text-center py-16">
        <p class="text-sm text-zinc-400">{searchQuery || activeCategory ? 'No items match your filters' : 'No objects yet — create one above'}</p>
      </div>
    {/if}

    {#each filtered as product (product.id)}
      {@const badge = stockBadge(product)}
      {@const isEditing = editingId === product.id}
      {@const isDeleting = deleteConfirmId === product.id}

      <div class="bg-white dark:bg-[#0c0c0f] border {isEditing ? 'border-zinc-400 dark:border-zinc-500' : 'border-zinc-100 dark:border-[#1a1a1a]'} rounded-xl overflow-hidden transition-colors">

        {#if isEditing}
          <div class="p-6">
            <p class="text-xs text-zinc-400 mb-4 uppercase tracking-widest">Editing: {product.name}</p>
            {#if editError}<p class="text-xs text-red-500 mb-3">{editError}</p>{/if}
            <form method="POST" action="?/saveItem" use:enhance={() => { saving = true; return async ({ update }) => { saving = false; await update(); }; }}>
              <input type="hidden" name="id" value={product.id} />
              <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="col-span-2">
                  <label for="edit-name" class="text-xs text-zinc-400 block mb-1">Name *</label>
                  <input id="edit-name" bind:value={editName} name="name" required
                    class="w-full h-9 px-3 text-sm bg-zinc-50 dark:bg-[#111] border border-zinc-200 dark:border-[#262626] rounded-lg text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 transition-colors" />
                </div>
                <div>
                  <label for="edit-category" class="text-xs text-zinc-400 block mb-1">Category</label>
                  <input id="edit-category" bind:value={editCategory} name="category" list="category-suggestions-edit" placeholder="e.g. Hooks"
                    class="w-full h-9 px-3 text-sm bg-zinc-50 dark:bg-[#111] border border-zinc-200 dark:border-[#262626] rounded-lg text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 transition-colors" />
                  <datalist id="category-suggestions-edit">{#each categorySuggestions as s}<option value={s}></option>{/each}</datalist>
                </div>
                <div>
                  <label for="edit-min" class="text-xs text-zinc-400 block mb-1">Min. Stock Threshold</label>
                  <input id="edit-min" type="number" bind:value={editMinThreshold} name="min_threshold" min="0"
                    class="w-full h-9 px-3 text-sm bg-zinc-50 dark:bg-[#111] border border-zinc-200 dark:border-[#262626] rounded-lg text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 transition-colors" />
                </div>
              </div>
              <div class="flex gap-2">
                <button type="submit" disabled={saving} class="h-9 px-4 rounded-lg text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
                <button type="button" onclick={cancelEdit} class="h-9 px-4 rounded-lg text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">Cancel</button>
              </div>
            </form>
          </div>

        {:else}
          <div class="px-5 py-4">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2.5 flex-wrap">
                  <span class="text-base font-medium text-zinc-900 dark:text-zinc-50">{product.name}</span>
                  <span class="text-xs px-2 py-0.5 rounded-full {badge.class}">{badge.label}</span>
                  {#if product.category}
                    <span class="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-[#1a1a1a] text-zinc-500">{product.category}</span>
                  {/if}
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button onclick={() => startEdit(product)} class="h-8 px-3 rounded-lg text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors">Edit</button>
                {#if isDeleting}
                  <form method="POST" action="?/deleteItem" use:enhance class="flex items-center gap-1">
                    <input type="hidden" name="id" value={product.id} />
                    <span class="text-xs text-red-500 mr-1">Delete?</span>
                    <button type="submit" class="h-8 px-3 rounded-lg text-xs bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors">Yes</button>
                    <button type="button" onclick={() => deleteConfirmId = null} class="h-8 px-3 rounded-lg text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">No</button>
                  </form>
                {:else}
                  <button onclick={() => deleteConfirmId = product.id} class="h-8 px-3 rounded-lg text-xs text-zinc-400 hover:text-red-500 hover:bg-red-500/5 transition-colors">Delete</button>
                {/if}
              </div>
            </div>

            {#if product.modules.length > 0 || product.shopify_skus.length > 0}
              <div class="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p class="text-[10px] uppercase tracking-widest text-zinc-400 mb-2">
                    Produced by ({product.modules.length} module{product.modules.length === 1 ? '' : 's'})
                  </p>
                  <div class="space-y-1.5">
                    {#each product.modules as mod}
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-xs text-zinc-700 dark:text-zinc-300 truncate">{mod.name}</span>
                        <div class="flex items-center gap-1.5 shrink-0">
                          {#if mod.weight}
                            <span class="text-[10px] text-zinc-400 tabular-nums">{mod.objects_per_print > 1 ? `${mod.objects_per_print}× · ` : ''}{mod.weight}g</span>
                          {/if}
                          {#if mod.printer_preset_name}
                            <span class="text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-[#1a1a1a] text-zinc-500 rounded">{mod.printer_preset_name}</span>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>

                <div>
                  <p class="text-[10px] uppercase tracking-widest text-zinc-400 mb-2">
                    Sold via ({product.shopify_skus.length} Shopify SKU{product.shopify_skus.length === 1 ? '' : 's'})
                  </p>
                  {#if product.shopify_skus.length === 0}
                    <p class="text-xs text-zinc-500 italic">Not mapped to any Shopify SKU</p>
                  {:else}
                    <div class="space-y-1.5">
                      {#each product.shopify_skus as sku}
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-mono text-zinc-700 dark:text-zinc-300">{sku.shopify_sku}</span>
                          {#if sku.quantity > 1}<span class="text-[10px] text-zinc-400">{sku.quantity}×</span>{/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {:else}
              <p class="mt-3 text-xs text-zinc-400 italic">No print modules or Shopify SKUs linked yet.</p>
            {/if}
          </div>
        {/if}

      </div>
    {/each}
  </div>
</div>
