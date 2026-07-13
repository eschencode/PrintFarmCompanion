<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();
  let submitting = $state(false);
  let colorHex = $state("#22c55e");

  const inputClass =
    "mt-1.5 w-full rounded-lg bg-white dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329] px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-0 transition-colors";
</script>

<svelte:head><title>Set up filament · Print Farm Companion</title></svelte:head>

<div class="mb-6">
  <h1 class="text-3xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50">Your filament</h1>
  <p class="text-sm text-zinc-500 mt-2 leading-relaxed">
    A filament preset describes a spool type — brand, material, color. Add the
    ones you print with most; more any time in Settings → Materials.
  </p>
</div>

<!-- What filament is used for -->
<div class="mb-6 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 p-4 text-xs leading-relaxed text-amber-800 dark:text-amber-200/80 space-y-1.5">
  <p><span class="font-medium">Loaded spools</span> — when you load one into a printer you pick from these presets, and every job records the filament it used.</p>
  <p><span class="font-medium">Module matching</span> — a module declares the filament it needs, so the queue only sends a job to a printer with the right material loaded.</p>
  <p><span class="font-medium">Material inventory</span> — the <span class="font-medium">in&nbsp;storage</span> count tracks unopened spools so you know when to reorder.</p>
</div>

{#if data.spoolPresets.length > 0}
  <div class="mb-6 space-y-2">
    {#each data.spoolPresets as preset}
      <div class="flex items-center gap-3 bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl px-4 py-3">
        <div
          class="w-3.5 h-3.5 rounded-full border border-zinc-200 dark:border-zinc-700"
          style="background-color: {preset.color_hex || '#9ca3af'}"
        ></div>
        <div class="flex-1">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {preset.brand} {preset.material}
            {#if preset.color}<span class="text-zinc-400">· {preset.color}</span>{/if}
          </p>
        </div>
        <!-- Storage +/- -->
        <div class="flex items-center gap-1.5">
          <form method="POST" action="?/adjustStock" use:enhance>
            <input type="hidden" name="presetId" value={preset.id} />
            <input type="hidden" name="current" value={preset.in_storage} />
            <input type="hidden" name="delta" value="-1" />
            <button
              type="submit"
              disabled={preset.in_storage <= 0}
              aria-label="Remove one spool from storage"
              class="w-7 h-7 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30 transition-colors flex items-center justify-center"
            >−</button>
          </form>
          <span class="min-w-[3.5rem] text-center text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            {preset.in_storage} <span class="text-zinc-400 dark:text-zinc-600">in&nbsp;storage</span>
          </span>
          <form method="POST" action="?/adjustStock" use:enhance>
            <input type="hidden" name="presetId" value={preset.id} />
            <input type="hidden" name="current" value={preset.in_storage} />
            <input type="hidden" name="delta" value="1" />
            <button
              type="submit"
              aria-label="Add one spool to storage"
              class="w-7 h-7 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex items-center justify-center"
            >+</button>
          </form>
        </div>
      </div>
    {/each}
  </div>
{/if}

<form
  method="POST"
  action="?/addPreset"
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
    {data.spoolPresets.length === 0 ? "Add your first filament" : "Add another filament"}
  </p>

  {#if form?.error}
    <div class="rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-2.5 text-sm text-red-500 dark:text-red-300">
      {form.error}
    </div>
  {/if}

  <div class="grid grid-cols-2 gap-3">
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Brand</span>
      <input name="brand" required placeholder="e.g. Bambu, Prusament" class={inputClass} />
    </label>
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Material</span>
      <input name="material" required placeholder="e.g. PLA, PETG" class={inputClass} />
    </label>
  </div>

  <div class="grid grid-cols-[1fr_auto] gap-3 items-end">
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Color name</span>
      <input name="color" placeholder="e.g. Galaxy Black" class={inputClass} />
    </label>
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Color</span>
      <input
        name="colorHex"
        type="color"
        bind:value={colorHex}
        class="mt-1.5 h-[42px] w-14 rounded-lg bg-white dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329] cursor-pointer"
      />
    </label>
  </div>

  <div class="grid grid-cols-2 gap-3">
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Spool weight (g)</span>
      <input name="defaultWeight" type="number" value="1000" min="1" class={inputClass} />
    </label>
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Spools in storage</span>
      <input name="initialStock" type="number" value="0" min="0" class={inputClass} />
    </label>
  </div>

  <button
    type="submit"
    disabled={submitting}
    class="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium py-2.5 hover:opacity-90 disabled:opacity-60 transition-opacity"
  >
    {submitting ? "Adding…" : "Add filament"}
  </button>
</form>

<form method="POST" action="?/finish" use:enhance>
  {#if data.spoolPresets.length > 0}
    <button
      type="submit"
      class="w-full rounded-lg border border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 text-sm font-medium py-2.5 hover:bg-zinc-900 hover:text-white dark:hover:bg-zinc-100 dark:hover:text-zinc-900 transition-colors"
    >
      Done with filament & continue →
    </button>
  {:else}
    <button
      type="submit"
      class="w-full text-center text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 py-2.5 transition-colors"
    >
      Skip filament for now →
    </button>
  {/if}
</form>
