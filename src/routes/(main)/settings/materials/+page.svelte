<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';

  export let data: PageData;
  export let form: ActionData;

  let showPresetEditor = false;
  let editingPreset: any = null;

  function openAddPreset() {
    editingPreset = null;
    showPresetEditor = true;
  }

  function openEditPreset(preset: any) {
    editingPreset = preset;
    showPresetEditor = true;
  }

  function closePresetEditor() {
    showPresetEditor = false;
    editingPreset = null;
  }

  // Hex value bound to the colour picker. Seeded from the preset when editing.
  let colorHex = '#888888';
  $: if (showPresetEditor) {
    colorHex = editingPreset?.color_hex || '#888888';
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
      <h1 class="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Materials</h1>
      <p class="text-zinc-400 dark:text-zinc-500 text-sm mt-1">Spool presets and filament templates</p>
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

    <!-- ── Spool Presets ──────────────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Spool Presets</p>
        <button
          onclick={openAddPreset}
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          aria-label="Add new spool preset"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          New Preset
        </button>
      </div>

      {#if data.spoolPresets && data.spoolPresets.length > 0}
        <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a]">
          {#each data.spoolPresets as preset}
            <div class="px-5 py-3.5 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
              {#if preset.color_hex}
                <div class="w-8 h-8 rounded-lg shrink-0 border border-zinc-200 dark:border-[#262626]" style="background-color: {preset.color_hex}"></div>
              {:else}
                <div class="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0">
                  <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 3L2 9l10 6 10-6-10-6zM2 17l10 6 10-6M2 13l10 6 10-6"/></svg>
                </div>
              {/if}
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200">{preset.brand} {preset.material}{preset.color ? ` ${preset.color}` : ''}</p>
                <p class="text-xs text-zinc-400 mt-0.5">{preset.default_weight}g{preset.cost ? ` · €${preset.cost}` : ''}</p>
              </div>
              <div class="flex items-center gap-4 text-xs text-zinc-400 shrink-0">
                <span>{preset.default_weight}g</span>
                {#if preset.cost}<span class="text-emerald-600 dark:text-emerald-400">€{preset.cost.toFixed(2)}</span>{/if}
              </div>
              <div class="flex items-center gap-0.5 shrink-0">
                <button
                  onclick={() => openEditPreset(preset)}
                  class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors text-xs"
                  aria-label="Edit preset"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  Edit
                </button>
                <form method="POST" action="?/deleteSpoolPreset" use:enhance={() => async ({ result, update }) => { if (result.type === 'failure') alert((result.data as any)?.error ?? 'Failed to delete preset'); await update(); }}>
                  <input type="hidden" name="presetId" value={preset.id} />
                  <button
                    type="submit"
                    class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs"
                    onclick={(e) => { if (!confirm(`Delete this preset?`)) e.preventDefault(); }}
                    aria-label="Delete preset"
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
        <div class="px-5 py-10 text-center">
          <p class="text-sm text-zinc-400 mb-3">No spool presets yet</p>
          <button onclick={openAddPreset} class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors">
            Add your first preset (e.g., Bambu PLA Basic Black)
          </button>
        </div>
      {/if}
    </div>

  </div>
</div>

<!-- Spool Preset Modal (shared for add + edit) -->
{#if showPresetEditor}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    onclick={closePresetEditor}
    onkeydown={(e) => e.key === 'Escape' && closePresetEditor()}
    role="button" tabindex="0" aria-label="Close spool preset editor"
  >
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
    <div
      class="relative w-full max-w-lg bg-white dark:bg-[#111] rounded-2xl border border-zinc-200 dark:border-[#1e1e1e] shadow-2xl overflow-hidden"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog" aria-modal="true" tabindex="-1"
    >
      <div class="px-6 py-4 border-b border-zinc-100 dark:border-[#1a1a1a] flex justify-between items-center">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">{editingPreset ? 'Edit Preset' : 'New Preset'}</p>
          <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-0.5">{editingPreset ? editingPreset.name : 'Add a spool preset'}</p>
        </div>
        <button onclick={closePresetEditor} class="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors" aria-label="Close">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <form
        method="POST"
        action={editingPreset ? '?/updateSpoolPreset' : '?/addSpoolPreset'}
        use:enhance={() => async ({ result, update }) => { if (result.type === 'success') closePresetEditor(); await update(); }}
        class="px-6 py-5 space-y-4"
      >
        {#if editingPreset}<input type="hidden" name="presetId" value={editingPreset.id} />{/if}

        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <label for="presetName" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Name *</label>
            <input
              type="text"
              id="presetName"
              name="name"
              required
              value={editingPreset?.name ?? ''}
              placeholder="e.g., Bambu PLA Basic Black"
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
            />
          </div>
          <div>
            <label for="presetBrand" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Brand *</label>
            <input
              type="text"
              id="presetBrand"
              name="brand"
              required
              value={editingPreset?.brand ?? ''}
              placeholder="Bambu Lab"
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
            />
          </div>
          <div>
            <label for="presetMaterial" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Material *</label>
            <input
              type="text"
              id="presetMaterial"
              name="material"
              required
              value={editingPreset?.material ?? ''}
              placeholder="PLA"
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
            />
          </div>
          <div>
            <label for="presetColor" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Color</label>
            <div class="flex items-center gap-2">
              <!-- Swatch / picker — drives color_hex used in the dashboard gauges -->
              <label
                class="relative w-10 h-[42px] shrink-0 rounded-lg border border-zinc-200 dark:border-[#262626] overflow-hidden cursor-pointer"
                style="background-color: {colorHex}"
                title="Pick spool colour"
              >
                <input
                  type="color"
                  bind:value={colorHex}
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  aria-label="Spool colour picker"
                />
              </label>
              <input type="hidden" name="colorHex" value={colorHex} />
              <input
                type="text"
                id="presetColor"
                name="color"
                value={editingPreset?.color ?? ''}
                placeholder="Black"
                class="flex-1 min-w-0 bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
              />
            </div>
          </div>
          <div>
            <label for="presetWeight" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Weight (g) *</label>
            <input
              type="number"
              id="presetWeight"
              name="defaultWeight"
              required
              min="0"
              value={editingPreset?.default_weight ?? 1000}
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
            />
          </div>
          <div>
            <label for="presetCost" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Cost (€)</label>
            <input
              type="number"
              id="presetCost"
              name="cost"
              min="0"
              step="0.01"
              value={editingPreset?.cost ?? ''}
              placeholder="20.00"
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
            />
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <button type="button" onclick={closePresetEditor} class="h-9 px-4 rounded-lg text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">Cancel</button>
          <button type="submit" class="h-9 px-4 rounded-lg text-sm font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors">
            {editingPreset ? 'Save Changes' : 'Add Preset'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
