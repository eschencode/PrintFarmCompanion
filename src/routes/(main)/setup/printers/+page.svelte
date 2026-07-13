<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();
  let submitting = $state(false);
  let showNewModel = $state(false);
  let slotCount = $state(1);

  const slotPresets = [
    { n: 1, label: "Single", hint: "one spool" },
    { n: 4, label: "AMS", hint: "4 spools" },
    { n: 8, label: "Dual AMS", hint: "8 spools" },
  ];

  const inputClass =
    "mt-1.5 w-full rounded-lg bg-white dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329] px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-0 transition-colors";
</script>

<svelte:head><title>Set up printers · Print Farm Companion</title></svelte:head>

<div class="mb-8">
  <h1 class="text-3xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50">Your printers</h1>
  <p class="text-sm text-zinc-500 mt-2 leading-relaxed">
    Add the machines you print with. A name and a model is all it takes —
    connection details (IP, serial, access code) are optional and can be added
    any time in Settings → Printers. Without them the printer runs in
    <span class="text-zinc-700 dark:text-zinc-300">manual mode</span>, which works great.
  </p>
</div>

<!-- Printers added so far -->
{#if data.printers.length > 0}
  <div class="mb-6 space-y-2">
    {#each data.printers as printer}
      <div class="flex items-center gap-3 bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl px-4 py-3">
        <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
        <div class="flex-1">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">{printer.name}</p>
          <p class="text-xs text-zinc-400">{printer.preset?.brand} {printer.preset?.model}</p>
        </div>
        <span class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
          {printer.secrets?.printer_ip ? "connected" : "manual mode"}
        </span>
      </div>
    {/each}
  </div>
{/if}

<!-- Add printer form -->
<form
  method="POST"
  action="?/addPrinter"
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
    {data.printers.length === 0 ? "Add your first printer" : "Add another printer"}
  </p>

  {#if form?.error}
    <div class="rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-2.5 text-sm text-red-500 dark:text-red-300">
      {form.error}
    </div>
  {/if}

  <label class="block">
    <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Name</span>
    <input name="name" required placeholder="e.g. P1S left, Voron №2 …" class={inputClass} />
  </label>

  {#if !showNewModel}
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Model</span>
      <select name="printerPresetId" class={inputClass}>
        <option value="">Select a model…</option>
        {#each data.printerPresets as preset}
          <option value={preset.id}>{preset.brand} {preset.model}</option>
        {/each}
      </select>
    </label>
    <button
      type="button"
      class="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
      onclick={() => (showNewModel = true)}
    >
      My model isn't listed →
    </button>
  {:else}
    <p class="text-xs text-zinc-400 leading-relaxed">
      This creates your own printer preset — it describes the machine type (like
      an entry in the catalog) and can be reused for every printer of this model.
    </p>
    <div class="grid grid-cols-2 gap-3">
      <label class="block">
        <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Brand</span>
        <input name="newBrand" placeholder="e.g. Bambu Lab" class={inputClass} />
      </label>
      <label class="block">
        <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Model</span>
        <input name="newModel" placeholder="e.g. P1S" class={inputClass} />
      </label>
    </div>
    <div>
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Build volume in mm <span class="font-normal text-zinc-400">(optional)</span></span>
      <div class="grid grid-cols-3 gap-3">
        <input name="buildVolumeX" type="number" min="1" placeholder="X · 256" class={inputClass} />
        <input name="buildVolumeY" type="number" min="1" placeholder="Y · 256" class={inputClass} />
        <input name="buildVolumeZ" type="number" min="1" placeholder="Z · 256" class={inputClass} />
      </div>
    </div>
    <button
      type="button"
      class="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
      onclick={() => (showNewModel = false)}
    >
      ← Pick from the list instead
    </button>
  {/if}

  <!-- Filament slots / AMS -->
  <div>
    <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Filament slots</span>
    <p class="text-[11px] text-zinc-400 mt-0.5 mb-2">How many spools can be loaded at once? Bambu AMS holds 4.</p>
    <input type="hidden" name="slotCount" value={slotCount} />
    <div class="flex items-center gap-2">
      {#each slotPresets as preset}
        <button
          type="button"
          onclick={() => (slotCount = preset.n)}
          class="flex-1 rounded-lg border px-3 py-2 text-center transition-colors {slotCount === preset.n
            ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
            : 'border-zinc-200 dark:border-[#232329] text-zinc-600 dark:text-zinc-300 hover:border-zinc-400'}"
        >
          <span class="block text-xs font-medium">{preset.label}</span>
          <span class="block text-[10px] opacity-70">{preset.hint}</span>
        </button>
      {/each}
      <label class="block">
        <input
          type="number" min="1" max="16" bind:value={slotCount}
          aria-label="Custom slot count"
          class="w-16 rounded-lg bg-white dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329] px-2.5 py-2 text-sm text-center text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 focus:outline-none focus:ring-0 transition-colors"
        />
      </label>
    </div>
  </div>

  <details class="group">
    <summary class="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors list-none flex items-center gap-1">
      <svg class="w-3 h-3 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      Connection details (optional)
    </summary>
    <div class="mt-3 space-y-3">
      <label class="block">
        <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">IP address</span>
        <input name="printerIp" placeholder="192.168.1.…" class={inputClass} />
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Serial</span>
          <input name="printerSerial" class={inputClass} />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Access code</span>
          <input name="printerAccessCode" class={inputClass} />
        </label>
      </div>
    </div>
  </details>

  <button
    type="submit"
    disabled={submitting}
    class="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium py-2.5 hover:opacity-90 disabled:opacity-60 transition-opacity"
  >
    {submitting ? "Adding…" : "Add printer"}
  </button>
</form>

<!-- Finish / skip -->
<form method="POST" action="?/finish" use:enhance>
  {#if data.printers.length > 0}
    <button
      type="submit"
      class="w-full rounded-lg border border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 text-sm font-medium py-2.5 hover:bg-zinc-900 hover:text-white dark:hover:bg-zinc-100 dark:hover:text-zinc-900 transition-colors"
    >
      Add {data.printers.length}
      {data.printers.length === 1 ? "printer" : "printers"} to the dashboard & continue →
    </button>
  {:else}
    <button
      type="submit"
      class="w-full text-center text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 py-2.5 transition-colors"
    >
      Skip printers for now →
    </button>
  {/if}
</form>
