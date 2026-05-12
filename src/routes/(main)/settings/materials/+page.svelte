<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';

  export let data: PageData;
  export let form: ActionData;

  let showPresetEditor = false;
  let editingPreset: any = null;
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
        <p class="text-sm text-emerald-700 dark:text-emerald-400">{form.message || 'Saved successfully'}</p>
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
      <details class="group">
        <summary class="px-5 py-4 flex items-center justify-between cursor-pointer list-none border-b border-zinc-50 dark:border-[#1a1a1a]">
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Spool Presets</p>
          <span class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            New Preset
          </span>
        </summary>
        <form method="POST" action="?/addSpoolPreset" class="px-5 py-5 border-b border-zinc-50 dark:border-[#1a1a1a] space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <label for="presetName" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Name</label>
              <input type="text" id="presetName" name="name" required placeholder="e.g., Bambu PLA Basic Black" class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
            <div>
              <label for="brand" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Brand</label>
              <input type="text" id="brand" name="brand" required placeholder="Bambu Lab" class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
            <div>
              <label for="material" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Material</label>
              <input type="text" id="material" name="material" required placeholder="PLA" class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
            <div>
              <label for="color" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Color</label>
              <input type="text" id="color" name="color" placeholder="Black" class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
            <div>
              <label for="defaultWeight" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Weight (g)</label>
              <input type="number" id="defaultWeight" name="defaultWeight" required min="0" value="1000" class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
            <div>
              <label for="cost" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Cost (€)</label>
              <input type="number" id="cost" name="cost" min="0" step="0.01" placeholder="20.00" class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
          </div>
          <div class="flex justify-end">
            <button type="submit" class="inline-flex items-center h-9 px-4 rounded-lg text-sm font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors">Add Spool Preset</button>
          </div>
        </form>
      </details>

      {#if data.spoolPresets && data.spoolPresets.length > 0}
        <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a]">
          {#each data.spoolPresets as preset}
            <div class="px-5 py-3.5 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200">{preset.name}</p>
                <p class="text-xs text-zinc-400 mt-0.5">{preset.brand} · {preset.material}{preset.color ? ` · ${preset.color}` : ''}</p>
              </div>
              <div class="flex items-center gap-4 text-xs text-zinc-400">
                <span>{preset.default_weight}g</span>
                {#if preset.cost}<span class="text-emerald-600 dark:text-emerald-400">€{preset.cost.toFixed(2)}</span>{/if}
              </div>
              <div class="flex items-center gap-0.5 shrink-0">
                <button onclick={() => { editingPreset = preset; showPresetEditor = true; }} class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors text-xs">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  Edit
                </button>
                <form method="POST" action="?/deleteSpoolPreset" use:enhance={() => ({ async update({ result }) { if (result.type === 'failure') alert(result.data?.error || 'Failed to delete preset'); } })}>
                  <input type="hidden" name="presetId" value={preset.id} />
                  <button type="submit" class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs" onclick={(e) => { if (!confirm(`Delete ${preset.name}?`)) e.preventDefault(); }}>
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    Delete
                  </button>
                </form>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="px-5 py-8 text-center">
          <p class="text-sm text-zinc-400">No spool presets yet. Click New Preset above.</p>
        </div>
      {/if}
    </div>

  </div>
</div>

<!-- Spool Preset Edit Modal -->
{#if showPresetEditor && editingPreset}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => { showPresetEditor = false; editingPreset = null; }} onkeydown={(e) => e.key === 'Escape' && (showPresetEditor = false)} role="button" tabindex="-1"></div>
    <div class="relative w-full max-w-lg bg-white dark:bg-[#111] rounded-2xl border border-zinc-200 dark:border-[#1e1e1e] shadow-2xl overflow-hidden">
      <div class="px-6 py-5 border-b border-zinc-100 dark:border-[#1a1a1a]">
        <h2 class="text-xl font-medium text-zinc-900 dark:text-zinc-50">Edit Spool Preset</h2>
        <p class="text-sm text-zinc-500 mt-0.5">Editing {editingPreset.name}</p>
      </div>
      <form method="POST" action="?/updateSpoolPreset"
        use:enhance={() => ({ async update({ result }) { if (result.type === 'success' || result.type === 'redirect') { showPresetEditor = false; editingPreset = null; } } })}
        class="px-6 py-5 space-y-4">
        <input type="hidden" name="presetId" value={editingPreset.id} />
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <label for="editPresetName" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Name</label>
            <input type="text" id="editPresetName" name="name" required value={editingPreset.name} class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
          <div>
            <label for="editPresetBrand" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Brand</label>
            <input type="text" id="editPresetBrand" name="brand" required value={editingPreset.brand} class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
          <div>
            <label for="editPresetMaterial" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Material</label>
            <input type="text" id="editPresetMaterial" name="material" required value={editingPreset.material} class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
          <div>
            <label for="editPresetColor" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Color</label>
            <input type="text" id="editPresetColor" name="color" value={editingPreset.color || ''} class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
          <div>
            <label for="editPresetWeight" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Weight (g)</label>
            <input type="number" id="editPresetWeight" name="defaultWeight" required min="0" value={editingPreset.default_weight} class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
          <div>
            <label for="editPresetCost" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Cost (€)</label>
            <input type="number" id="editPresetCost" name="cost" min="0" step="0.01" value={editingPreset.cost || ''} class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" onclick={() => { showPresetEditor = false; editingPreset = null; }} class="h-9 px-4 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
          <button type="submit" class="h-9 px-4 rounded-lg text-sm font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors">Save Changes</button>
        </div>
      </form>
    </div>
  </div>
{/if}
