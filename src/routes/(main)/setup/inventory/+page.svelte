<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();
  let submitting = $state(false);

  const inputClass =
    "mt-1.5 w-full rounded-lg bg-white dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329] px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-0 transition-colors";
</script>

<svelte:head><title>Set up inventory · Print Farm Companion</title></svelte:head>

<div class="mb-6">
  <h1 class="text-3xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50">Inventory & demand</h1>
  <p class="text-sm text-zinc-500 mt-2 leading-relaxed">
    Objects are the physical things your farm produces. Inventory keeps their
    stock and works out what to print next.
  </p>
</div>

<!-- How demand works -->
<div class="mb-6 rounded-xl bg-teal-50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-900/30 p-4 text-xs leading-relaxed text-teal-800 dark:text-teal-200/80 space-y-1.5">
  <p><span class="font-medium">Every stock change is logged.</span> Prints add stock, sales remove it — each as an entry in the inventory log.</p>
  <p><span class="font-medium">Demand is forecast from that history.</span> The last 90 days of sales feed a bootstrap forecast — daily velocity, stockout risk and a confidence level per object.</p>
  <p><span class="font-medium">The queue prioritizes what's running low.</span> Objects most likely to sell out get printed first, so you rarely stock out.</p>
  <p class="text-teal-700/70 dark:text-teal-300/50">It needs sales history to get accurate — this just sets up the objects it tracks.</p>
</div>

<!-- Match modules to objects -->
{#if data.unmatchedModules.length > 0}
  <div class="mb-6">
    <p class="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">Match modules to objects</p>
    <p class="text-xs text-zinc-500 mb-3 leading-relaxed">
      These modules aren't linked to an object yet — so their prints won't count
      into any stock. Link each one to what it produces.
    </p>
    <div class="space-y-2">
      {#each data.unmatchedModules as module}
        <form
          method="POST"
          action="?/matchModule"
          use:enhance
          class="flex items-center gap-2 bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl px-4 py-2.5"
        >
          <input type="hidden" name="moduleId" value={module.id} />
          <span class="flex-1 text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{module.name}</span>
          <span class="text-zinc-400 text-xs">→</span>
          <select name="objectId" required class="rounded-lg bg-white dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 max-w-[9rem]">
            <option value="">Object…</option>
            {#each data.objects as object}
              <option value={object.id}>{object.name}</option>
            {/each}
          </select>
          <button
            type="submit"
            disabled={data.objects.length === 0}
            class="shrink-0 h-8 px-3 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Link
          </button>
        </form>
      {/each}
    </div>
    {#if data.objects.length === 0}
      <p class="text-xs text-amber-600 dark:text-amber-400 mt-2">Create an object below first, then link it.</p>
    {/if}
  </div>
{/if}

<!-- Existing objects -->
{#if data.objects.length > 0}
  <div class="mb-6 space-y-2">
    {#each data.objects as object}
      <div class="flex items-center gap-3 bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl px-4 py-3">
        <div class="w-2 h-2 rounded-full bg-teal-500"></div>
        <div class="flex-1">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">{object.name}</p>
        </div>
        <span class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
          {object.in_stock} in stock{object.min_threshold > 0 ? ` · floor ${object.min_threshold}` : ""}
        </span>
      </div>
    {/each}
  </div>
{/if}

<!-- Add object -->
<form
  method="POST"
  action="?/addObject"
  class="bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl p-5 space-y-4 mb-6"
  use:enhance={() => {
    submitting = true;
    return async ({ update }) => {
      await update({ reset: true });
      submitting = false;
    };
  }}
>
  <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">
    {data.objects.length === 0 ? "Add your first object" : "Add another object"}
  </p>

  {#if form?.error}
    <div class="rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-2.5 text-sm text-red-500 dark:text-red-300">
      {form.error}
    </div>
  {/if}

  <div class="grid grid-cols-[1fr_auto] gap-3">
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Object name</span>
      <input name="name" required placeholder="e.g. Benchy, Cable clip" class={inputClass} />
    </label>
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Alert floor</span>
      <input name="minThreshold" type="number" min="0" value="0" class="{inputClass} w-24" />
    </label>
  </div>
  <p class="text-xs text-zinc-400 -mt-1">The alert floor flags an object as low when stock drops to or below it.</p>

  <button
    type="submit"
    disabled={submitting}
    class="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium py-2.5 hover:opacity-90 disabled:opacity-60 transition-opacity"
  >
    {submitting ? "Adding…" : "Add object"}
  </button>
</form>

<form method="POST" action="?/finish" use:enhance>
  {#if data.objects.length > 0}
    <button
      type="submit"
      class="w-full rounded-lg border border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 text-sm font-medium py-2.5 hover:bg-zinc-900 hover:text-white dark:hover:bg-zinc-100 dark:hover:text-zinc-900 transition-colors"
    >
      Done with inventory & continue →
    </button>
  {:else}
    <button
      type="submit"
      class="w-full text-center text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 py-2.5 transition-colors"
    >
      Skip inventory for now →
    </button>
  {/if}
</form>
