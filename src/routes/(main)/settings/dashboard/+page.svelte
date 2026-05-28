<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import type { GridCell } from '$lib/types';
  import { enhance } from '$app/forms';

  export let data: PageData;
  export let form: ActionData;

  const cellTypes: GridCell['type'][] = ['empty', 'printer', 'stats', 'settings', 'spools', 'inventory', 'products'];

  const cellLabel: Record<string, string> = {
    empty: 'Empty',
    printer: 'Printer',
    stats: 'Stats',
    settings: 'Settings',
    spools: 'Spools',
    inventory: 'Inventory',
    products: 'Products',
  };

  // Full class strings so Tailwind JIT detects them
  const cellColor: Record<string, string> = {
    empty: 'bg-zinc-50 dark:bg-[#161616] text-zinc-400 border-zinc-200 dark:border-[#262626]',
    printer: 'bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/40',
    stats: 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-900/40',
    settings: 'bg-zinc-200 dark:bg-[#2a2a2a] text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-[#333]',
    spools: 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/40',
    inventory: 'bg-teal-100 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/40',
    products: 'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/40',
  };

  // Mini-preview dot colors (single word bg class for dots)
  const dotColor: Record<string, string> = {
    empty: 'bg-zinc-200 dark:bg-zinc-700',
    printer: 'bg-blue-400 dark:bg-blue-600',
    stats: 'bg-violet-400 dark:bg-violet-600',
    settings: 'bg-zinc-400 dark:bg-zinc-500',
    spools: 'bg-amber-400 dark:bg-amber-600',
    inventory: 'bg-teal-400 dark:bg-teal-600',
    products: 'bg-rose-400 dark:bg-rose-600',
  };

  let showGridEditor = false;
  let editingGridId: number | null = null;
  let gridPresetName = '';
  let gridPresetIsDefault = false;
  let gridRows = 3;
  let gridCols = 3;
  let editingGridConfig: GridCell[] = [];

  function generateEmptyGrid(rows: number, cols: number): GridCell[] {
    return Array(rows * cols).fill(null).map(() => ({ type: 'empty' as const }));
  }

  function parseGridConfig(jsonString: string): GridCell[] {
    try { return JSON.parse(jsonString); } catch { return []; }
  }

  function updateGridDimensions() {
    const total = gridRows * gridCols;
    if (total > editingGridConfig.length) {
      editingGridConfig = [
        ...editingGridConfig,
        ...Array(total - editingGridConfig.length).fill(null).map(() => ({ type: 'empty' as const })),
      ];
    } else {
      editingGridConfig = editingGridConfig.slice(0, total);
    }
  }

  function openGridEditor(preset?: any) {
    if (preset) {
      editingGridId = preset.id;
      gridPresetName = preset.name;
      gridPresetIsDefault = preset.is_default === 1;
      gridRows = preset.rows || 3;
      gridCols = preset.cols || 3;
      editingGridConfig = parseGridConfig(preset.grid_config);
    } else {
      editingGridId = null;
      gridPresetName = '';
      gridPresetIsDefault = (data.gridPresets?.length ?? 0) === 0;
      gridRows = 3;
      gridCols = 3;
      editingGridConfig = generateEmptyGrid(3, 3);
    }
    showGridEditor = true;
  }

  function closeGridEditor() {
    showGridEditor = false;
    editingGridId = null;
  }

  function cycleCellType(index: number) {
    const curr = editingGridConfig[index].type;
    const next = cellTypes[(cellTypes.indexOf(curr) + 1) % cellTypes.length];
    editingGridConfig[index] = { type: next };
    editingGridConfig = [...editingGridConfig];
  }

  function setCellPrinter(index: number, value: string) {
    editingGridConfig[index] = { type: 'printer', printerId: Number(value) };
    editingGridConfig = [...editingGridConfig];
  }

  function getPrinterName(printerId?: number): string {
    if (!printerId) return 'Unassigned';
    return (data.printers as any[])?.find((p) => p.id === printerId)?.name ?? `Printer #${printerId}`;
  }

  $: gridConfigJson = JSON.stringify(editingGridConfig);
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
      <h1 class="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Dashboard</h1>
      <p class="text-zinc-400 dark:text-zinc-500 text-sm mt-1">Grid layout presets for the dashboard view</p>
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

    <!-- ── Grid Presets ────────────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-4">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Grid Presets</p>
        <button
          onclick={() => openGridEditor()}
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          aria-label="Create new grid preset"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          New Preset
        </button>
      </div>

      {#if data.gridPresets && data.gridPresets.length > 0}
        <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a]">
          {#each data.gridPresets as preset}
            {@const cells = parseGridConfig(preset.grid_config)}
            {@const cols = preset.cols || 3}
            <div class="px-5 py-4 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">

              <!-- Mini grid preview -->
              <div
                class="shrink-0 grid gap-0.5 rounded-md overflow-hidden border border-zinc-100 dark:border-[#1e1e1e]"
                style="grid-template-columns: repeat({cols}, 1fr); width: {cols * 14}px;"
                aria-hidden="true"
              >
                {#each cells as cell}
                  <div class="h-3.5 {dotColor[cell.type] ?? dotColor.empty}"></div>
                {/each}
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                  {preset.name}
                  {#if preset.is_default}
                    <span class="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">Default</span>
                  {/if}
                </p>
                <p class="text-xs text-zinc-400 mt-0.5">
                  {preset.rows || 3}×{cols} grid · {cells.filter(c => c.type !== 'empty').length} active cells
                </p>
              </div>

              <div class="flex items-center gap-0.5 shrink-0">
                {#if !preset.is_default}
                  <form method="POST" action="?/setDefaultGridPreset" use:enhance={() => async ({ result, update }) => { if (result.type === 'failure') alert((result.data as any)?.error ?? 'Failed'); await update(); }}>
                    <input type="hidden" name="presetId" value={preset.id} />
                    <button type="submit" class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors text-xs">
                      Set default
                    </button>
                  </form>
                {/if}
                <button onclick={() => openGridEditor(preset)} class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors text-xs" aria-label="Edit {preset.name}">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  Edit
                </button>
                <form method="POST" action="?/deleteGridPreset" use:enhance={() => async ({ result, update }) => { if (result.type === 'failure') alert((result.data as any)?.error ?? 'Failed to delete'); await update(); }}>
                  <input type="hidden" name="presetId" value={preset.id} />
                  <button
                    type="submit"
                    class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs"
                    onclick={(e) => { if (!confirm(`Delete preset "${preset.name}"?`)) e.preventDefault(); }}
                    aria-label="Delete {preset.name}"
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
          <p class="text-sm text-zinc-400 mb-3">No grid presets yet</p>
          <button onclick={() => openGridEditor()} class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors">
            Create your first preset
          </button>
        </div>
      {/if}
    </div>

    <p class="text-xs text-zinc-400 px-1">
      The default preset loads automatically when you open the dashboard. Click a cell in the editor to cycle its type; select a printer from the dropdown for Printer cells.
    </p>

  </div>
</div>

<!-- ── Grid Editor Modal ───────────────────────────────────────────────── -->
{#if showGridEditor}
  <div
    class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
    onclick={closeGridEditor}
    onkeydown={(e) => e.key === 'Escape' && closeGridEditor()}
    role="button" tabindex="0" aria-label="Close grid editor"
  >
    <div
      class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog" aria-modal="true" tabindex="-1"
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-zinc-50 dark:border-[#1a1a1a] flex justify-between items-center sticky top-0 bg-white dark:bg-[#111] z-10">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">{editingGridId ? 'Edit Preset' : 'New Preset'}</p>
          <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-0.5">{editingGridId ? 'Edit grid layout' : 'Create a grid layout'}</p>
        </div>
        <button onclick={closeGridEditor} class="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors" aria-label="Close">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <form
        method="POST"
        action={editingGridId ? '?/updateGridPreset' : '?/addGridPreset'}
        use:enhance={() => async ({ result, update }) => { if (result.type === 'success') closeGridEditor(); await update(); }}
      >
        {#if editingGridId}<input type="hidden" name="presetId" value={editingGridId} />{/if}
        <input type="hidden" name="gridConfig" value={gridConfigJson} />
        <input type="hidden" name="rows" value={gridRows} />
        <input type="hidden" name="cols" value={gridCols} />
        <input type="hidden" name="isDefault" value={gridPresetIsDefault ? 'true' : 'false'} />

        <div class="p-6 space-y-6">

          <!-- Name + default -->
          <div class="flex items-start gap-4">
            <div class="flex-1">
              <label for="gridName" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Preset Name *</label>
              <input
                id="gridName"
                type="text"
                name="name"
                bind:value={gridPresetName}
                required
                placeholder="e.g., Main Layout"
                class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
              />
            </div>
            <div class="pt-6">
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <button
                  type="button"
                  onclick={() => gridPresetIsDefault = !gridPresetIsDefault}
                  class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors {gridPresetIsDefault ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}"
                  role="switch"
                  aria-checked={gridPresetIsDefault}
                  aria-label="Set as default"
                >
                  <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform {gridPresetIsDefault ? 'translate-x-4' : 'translate-x-0.5'}"></span>
                </button>
                <span class="text-xs text-zinc-600 dark:text-zinc-400">Default</span>
              </label>
            </div>
          </div>

          <!-- Dimensions -->
          <div>
            <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Grid Dimensions</p>
            <div class="flex items-center gap-3">
              <div>
                <label for="gridRows" class="text-[10px] text-zinc-400 block mb-1">Rows</label>
                <input
                  id="gridRows"
                  type="number"
                  min="1"
                  max="6"
                  bind:value={gridRows}
                  onchange={updateGridDimensions}
                  class="w-20 bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 transition-colors"
                />
              </div>
              <span class="text-zinc-400 pt-4">×</span>
              <div>
                <label for="gridCols" class="text-[10px] text-zinc-400 block mb-1">Columns</label>
                <input
                  id="gridCols"
                  type="number"
                  min="1"
                  max="6"
                  bind:value={gridCols}
                  onchange={updateGridDimensions}
                  class="w-20 bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 transition-colors"
                />
              </div>
            </div>
          </div>

          <!-- Visual grid editor -->
          <div>
            <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Cell Layout</p>
            <p class="text-[11px] text-zinc-400 mb-3">Click a cell to cycle its type. Printer cells show a printer selector.</p>

            <div class="grid gap-2" style="grid-template-columns: repeat({gridCols}, 1fr);">
              {#each editingGridConfig as cell, i}
                <div class="rounded-lg border {cellColor[cell.type] ?? cellColor.empty} p-2 min-h-[76px] flex flex-col gap-1.5">
                  <button
                    type="button"
                    onclick={() => cycleCellType(i)}
                    class="w-full text-left text-xs font-medium hover:opacity-70 transition-opacity"
                    aria-label="Cycle type for cell {i + 1}, currently {cell.type}"
                  >
                    {cellLabel[cell.type] ?? cell.type}
                  </button>
                  {#if cell.type === 'printer'}
                    <select
                      value={cell.printerId ?? ''}
                      onchange={(e) => setCellPrinter(i, e.currentTarget.value)}
                      class="mt-auto w-full bg-white/50 dark:bg-black/20 rounded px-1.5 py-0.5 text-[10px] border-0 focus:outline-none focus:ring-1 focus:ring-current/30"
                      aria-label="Assign printer to cell {i + 1}"
                    >
                      <option value="">— assign printer —</option>
                      {#each (data.printers as any[]) ?? [] as printer}
                        <option value={printer.id}>{printer.name}</option>
                      {/each}
                    </select>
                  {/if}
                </div>
              {/each}
            </div>

            <!-- Legend -->
            <div class="flex flex-wrap gap-1.5 mt-3">
              {#each cellTypes as type}
                <span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full {cellColor[type] ?? cellColor.empty} border">
                  {cellLabel[type]}
                </span>
              {/each}
            </div>
          </div>

        </div>

        <div class="px-6 py-4 border-t border-zinc-50 dark:border-[#1a1a1a] flex justify-end gap-3">
          <button type="button" onclick={closeGridEditor} class="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Cancel</button>
          <button
            type="submit"
            disabled={!gridPresetName.trim()}
            class="bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 dark:text-zinc-100 font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {editingGridId ? 'Save Changes' : 'Create Preset'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
