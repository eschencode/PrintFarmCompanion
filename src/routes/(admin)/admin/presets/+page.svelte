<script lang="ts">
  import { enhance } from "$app/forms";

  let { data, form } = $props();

  let editingPrinter = $state<number | null>(null);
  let editingPlate = $state<number | null>(null);

  const inputCls =
    "h-8 px-2 rounded-md text-sm bg-zinc-50 dark:bg-[#181818] border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 w-full";
  const btnCls =
    "h-7 px-2.5 rounded-md text-xs text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors";
  const dangerBtnCls =
    "h-7 px-2.5 rounded-md text-xs text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors";
  const primaryBtnCls =
    "h-8 px-3 rounded-md text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 transition-colors";
</script>

<svelte:head><title>System Presets · Admin</title></svelte:head>

<h1 class="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-1">System presets</h1>
<p class="text-sm text-zinc-400 mb-6">
  Shared catalog rows every workspace sees (workspace-custom presets are not shown here).
</p>

{#if form?.error}
  <div class="mb-4 rounded-lg bg-red-500/10 border border-red-500/25 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-400">
    {form.error}
  </div>
{/if}

<!-- Printer presets -->
<div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl p-5 mb-6">
  <p class="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">Printer presets</p>

  <table class="w-full text-sm mb-4">
    <thead>
      <tr class="text-left text-xs uppercase tracking-wide text-zinc-400 border-b border-zinc-100 dark:border-[#1e1e1e]">
        <th class="py-2 pr-3 font-medium">Brand</th>
        <th class="py-2 pr-3 font-medium">Model</th>
        <th class="py-2 pr-3 font-medium">X</th>
        <th class="py-2 pr-3 font-medium">Y</th>
        <th class="py-2 pr-3 font-medium">Z</th>
        <th class="py-2 pr-3 font-medium">Device path</th>
        <th class="py-2 font-medium text-right">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each data.printerPresets as p (p.id)}
        {#if editingPrinter === p.id}
          <tr class="border-b border-zinc-50 dark:border-[#181818]">
            <td colspan="7" class="py-2">
              <form
                method="POST"
                action="?/updatePrinterPreset"
                use:enhance={() => async ({ update }) => { editingPrinter = null; await update(); }}
                class="grid grid-cols-[1fr_1fr_4rem_4rem_4rem_1fr_auto] gap-2 items-center"
              >
                <input type="hidden" name="id" value={p.id} />
                <input name="brand" value={p.brand} class={inputCls} />
                <input name="model" value={p.model} class={inputCls} />
                <input name="dimensionX" type="number" value={p.dimension_x} class={inputCls} />
                <input name="dimensionY" type="number" value={p.dimension_y} class={inputCls} />
                <input name="dimensionZ" type="number" value={p.dimension_z} class={inputCls} />
                <input name="deviceFilePath" value={p.device_file_path} class={inputCls} />
                <div class="flex gap-1">
                  <button type="submit" class={primaryBtnCls}>Save</button>
                  <button type="button" onclick={() => (editingPrinter = null)} class={btnCls}>Cancel</button>
                </div>
              </form>
            </td>
          </tr>
        {:else}
          <tr class="border-b border-zinc-50 dark:border-[#181818] last:border-0">
            <td class="py-2 pr-3 text-zinc-900 dark:text-zinc-100">{p.brand}</td>
            <td class="py-2 pr-3 text-zinc-900 dark:text-zinc-100 font-medium">{p.model}</td>
            <td class="py-2 pr-3 tabular-nums text-zinc-500">{p.dimension_x ?? "—"}</td>
            <td class="py-2 pr-3 tabular-nums text-zinc-500">{p.dimension_y ?? "—"}</td>
            <td class="py-2 pr-3 tabular-nums text-zinc-500">{p.dimension_z ?? "—"}</td>
            <td class="py-2 pr-3 font-mono text-xs text-zinc-500">{p.device_file_path}</td>
            <td class="py-2 text-right">
              <div class="inline-flex gap-1">
                <button onclick={() => (editingPrinter = p.id)} class={btnCls}>Edit</button>
                <form method="POST" action="?/deletePrinterPreset" use:enhance>
                  <input type="hidden" name="id" value={p.id} />
                  <button class={dangerBtnCls}>Delete</button>
                </form>
              </div>
            </td>
          </tr>
        {/if}
      {:else}
        <tr><td colspan="7" class="py-4 text-center text-zinc-400">No system printer presets yet.</td></tr>
      {/each}
    </tbody>
  </table>

  <form
    method="POST"
    action="?/createPrinterPreset"
    use:enhance
    class="grid grid-cols-[1fr_1fr_4rem_4rem_4rem_1fr_auto] gap-2 items-center pt-3 border-t border-zinc-100 dark:border-[#1e1e1e]"
  >
    <input name="brand" placeholder="Brand" required class={inputCls} />
    <input name="model" placeholder="Model" required class={inputCls} />
    <input name="dimensionX" type="number" placeholder="X" class={inputCls} />
    <input name="dimensionY" type="number" placeholder="Y" class={inputCls} />
    <input name="dimensionZ" type="number" placeholder="Z" class={inputCls} />
    <input name="deviceFilePath" placeholder="/cache" required class={inputCls} />
    <button type="submit" class={primaryBtnCls}>Add</button>
  </form>
</div>

<!-- Plate presets -->
<div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl p-5">
  <p class="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">Plate presets</p>

  <table class="w-full text-sm mb-4">
    <thead>
      <tr class="text-left text-xs uppercase tracking-wide text-zinc-400 border-b border-zinc-100 dark:border-[#1e1e1e]">
        <th class="py-2 pr-3 font-medium">Name</th>
        <th class="py-2 pr-3 font-medium">X</th>
        <th class="py-2 pr-3 font-medium">Y</th>
        <th class="py-2 font-medium text-right">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each data.platePresets as p (p.id)}
        {#if editingPlate === p.id}
          <tr class="border-b border-zinc-50 dark:border-[#181818]">
            <td colspan="4" class="py-2">
              <form
                method="POST"
                action="?/updatePlatePreset"
                use:enhance={() => async ({ update }) => { editingPlate = null; await update(); }}
                class="grid grid-cols-[1fr_5rem_5rem_auto] gap-2 items-center"
              >
                <input type="hidden" name="id" value={p.id} />
                <input name="name" value={p.name} class={inputCls} />
                <input name="dimensionX" type="number" value={p.dimension_x} class={inputCls} />
                <input name="dimensionY" type="number" value={p.dimension_y} class={inputCls} />
                <div class="flex gap-1">
                  <button type="submit" class={primaryBtnCls}>Save</button>
                  <button type="button" onclick={() => (editingPlate = null)} class={btnCls}>Cancel</button>
                </div>
              </form>
            </td>
          </tr>
        {:else}
          <tr class="border-b border-zinc-50 dark:border-[#181818] last:border-0">
            <td class="py-2 pr-3 text-zinc-900 dark:text-zinc-100 font-medium">{p.name}</td>
            <td class="py-2 pr-3 tabular-nums text-zinc-500">{p.dimension_x ?? "—"}</td>
            <td class="py-2 pr-3 tabular-nums text-zinc-500">{p.dimension_y ?? "—"}</td>
            <td class="py-2 text-right">
              <div class="inline-flex gap-1">
                <button onclick={() => (editingPlate = p.id)} class={btnCls}>Edit</button>
                <form method="POST" action="?/deletePlatePreset" use:enhance>
                  <input type="hidden" name="id" value={p.id} />
                  <button class={dangerBtnCls}>Delete</button>
                </form>
              </div>
            </td>
          </tr>
        {/if}
      {:else}
        <tr><td colspan="4" class="py-4 text-center text-zinc-400">No system plate presets yet.</td></tr>
      {/each}
    </tbody>
  </table>

  <form
    method="POST"
    action="?/createPlatePreset"
    use:enhance
    class="grid grid-cols-[1fr_5rem_5rem_auto] gap-2 items-center pt-3 border-t border-zinc-100 dark:border-[#1e1e1e]"
  >
    <input name="name" placeholder="Plate name" required class={inputCls} />
    <input name="dimensionX" type="number" placeholder="X" class={inputCls} />
    <input name="dimensionY" type="number" placeholder="Y" class={inputCls} />
    <button type="submit" class={primaryBtnCls}>Add</button>
  </form>
</div>
