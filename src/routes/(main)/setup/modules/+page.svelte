<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import ThreeMfUpload from "$lib/components/ThreeMfUpload.svelte";
  let { data, form } = $props();
  let submitting = $state(false);
  let newObject = $state(false);
  let manualMode = $state(false);

  const inputClass =
    "mt-1.5 w-full rounded-lg bg-white dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329] px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-0 transition-colors";

  // ThreeMfUpload saves via /api/print-modules then dispatches `uploaded`;
  // re-run the loader so the new module shows in the list below.
  function handleUploaded() {
    invalidateAll();
  }
</script>

<svelte:head><title>Set up modules · Print Farm Companion</title></svelte:head>

<div class="mb-6">
  <h1 class="text-3xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50">Your first module</h1>
  <p class="text-sm text-zinc-500 mt-2 leading-relaxed">
    A module is something you print: a print file plus its expected time and
    filament weight. Each module produces an
    <span class="text-zinc-700 dark:text-zinc-300">object</span> — the physical
    thing that lands in your inventory when a print succeeds.
  </p>
</div>

<!-- What an object is / why it matters -->
<div class="mb-6 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/30 p-4 text-xs leading-relaxed text-emerald-800 dark:text-emerald-200/80">
  Tip: link each module to an <span class="font-medium">object</span>. Every
  successful print then increments that object's stock — that's what powers
  inventory tracking and demand forecasting later. You can create the object
  right here while adding the module.
</div>

{#if data.modules.length > 0}
  <div class="mb-6 space-y-2">
    {#each data.modules as module}
      <div class="flex items-center gap-3 bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl px-4 py-3">
        <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
        <div class="flex-1">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">{module.name}</p>
          <p class="text-xs text-zinc-400">
            {module.expected_time_minutes} min · {module.weight} g · {module.objects_per_print}× per print
          </p>
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- Primary path: upload a sliced file, values extracted automatically -->
<div class="mb-4">
  <div class="mb-3">
    <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">Upload a sliced file</p>
    <p class="text-xs text-zinc-500 mt-1 leading-relaxed">
      Export a sliced <span class="font-mono">.3mf</span> from Bambu Studio / OrcaSlicer —
      print time, filament weights, colors and the thumbnail are read automatically.
    </p>
  </div>
  <ThreeMfUpload
    spoolPresets={data.spoolPresets}
    printerModels={data.printerPresets}
    inventoryItems={data.objects}
    on:uploaded={handleUploaded}
  />
</div>

<!-- Secondary path: manual entry -->
<button
  type="button"
  class="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors mb-6"
  onclick={() => (manualMode = !manualMode)}
>
  {manualMode ? "← Hide manual entry" : "No file handy? Add a module manually →"}
</button>

{#if manualMode}
<form
  method="POST"
  action="?/addModule"
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
    {data.modules.length === 0 ? "Add your first module" : "Add another module"}
  </p>

  {#if form?.error}
    <div class="rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-2.5 text-sm text-red-500 dark:text-red-300">
      {form.error}
    </div>
  {/if}

  <label class="block">
    <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Module name</span>
    <input name="name" required placeholder="e.g. Benchy, Phone stand plate…" class={inputClass} />
  </label>

  <div class="grid grid-cols-3 gap-3">
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Print time (min)</span>
      <input name="expectedTime" type="number" min="0" placeholder="45" class={inputClass} />
    </label>
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Weight (g)</span>
      <input name="weight" type="number" min="0" placeholder="16" class={inputClass} />
    </label>
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Objects / print</span>
      <input name="objectsPerPrint" type="number" min="1" value="1" class={inputClass} />
    </label>
  </div>

  <!-- Object: what this module produces -->
  {#if !newObject && data.objects.length > 0}
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Produces object</span>
      <select name="objectId" class={inputClass}>
        <option value="">No object (just track prints)</option>
        {#each data.objects as object}
          <option value={object.id}>{object.name}</option>
        {/each}
      </select>
    </label>
    <button
      type="button"
      class="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
      onclick={() => (newObject = true)}
    >
      Create a new object instead →
    </button>
  {:else}
    <label class="block">
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Produces object <span class="font-normal text-zinc-400">(created for you — this is what gets counted in inventory)</span>
      </span>
      <input name="newObjectName" placeholder="e.g. Benchy" class={inputClass} />
    </label>
    {#if data.objects.length > 0}
      <button
        type="button"
        class="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        onclick={() => (newObject = false)}
      >
        ← Pick an existing object instead
      </button>
    {/if}
  {/if}

  <button
    type="submit"
    disabled={submitting}
    class="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium py-2.5 hover:opacity-90 disabled:opacity-60 transition-opacity"
  >
    {submitting ? "Adding…" : "Add module"}
  </button>
</form>
{/if}

<form method="POST" action="?/finish" use:enhance>
  {#if data.modules.length > 0}
    <button
      type="submit"
      class="w-full rounded-lg border border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 text-sm font-medium py-2.5 hover:bg-zinc-900 hover:text-white dark:hover:bg-zinc-100 dark:hover:text-zinc-900 transition-colors"
    >
      Done with modules & continue →
    </button>
  {:else}
    <button
      type="submit"
      class="w-full text-center text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 py-2.5 transition-colors"
    >
      Skip modules for now →
    </button>
  {/if}
</form>
