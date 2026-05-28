<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';

  export let data: PageData;
  export let form: ActionData;

  // ── Printer editor ──────────────────────────────────────────────────────────
  let showPrinterEditor = false;
  let editingPrinter: any = null;
  let printerName = '';
  let printerModelId: number | string = '';
  let printerIp = '';
  let printerSerial = '';
  let printerAccessCode = '';
  let printerSlotCount: number | string = 1;

  function openEditPrinter(printer: any) {
    editingPrinter = printer;
    printerName = printer.name;
    printerModelId = printer.printer_preset_id || '';
    printerIp = printer.secrets?.printer_ip || '';
    printerSerial = printer.secrets?.serial || '';
    printerAccessCode = printer.secrets?.access_code || '';
    printerSlotCount = printer.slot_count ?? 1;
    showPrinterEditor = true;
  }

  function closePrinterEditor() {
    showPrinterEditor = false;
    editingPrinter = null;
    printerName = '';
    printerModelId = '';
    printerIp = '';
    printerSerial = '';
    printerAccessCode = '';
    printerSlotCount = 1;
  }

  // ── Printer model editor ────────────────────────────────────────────────────
  let showPrinterModelEditor = false;
  let editingPrinterModel: any = null;
  let pmName = '';
  let pmDescription = '';
  let pmBuildX = '';
  let pmBuildY = '';
  let pmBuildZ = '';

  function openEditPrinterModel(model: any) {
    editingPrinterModel = model;
    pmName = model.model;
    pmDescription = model.brand || '';
    pmBuildX = model.dimension_x ?? '';
    pmBuildY = model.dimension_y ?? '';
    pmBuildZ = model.dimension_z ?? '';
    showPrinterModelEditor = true;
  }

  function closePrinterModelEditor() {
    showPrinterModelEditor = false;
    editingPrinterModel = null;
    pmName = '';
    pmDescription = '';
    pmBuildX = '';
    pmBuildY = '';
    pmBuildZ = '';
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
      <h1 class="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Printers</h1>
      <p class="text-zinc-400 dark:text-zinc-500 text-sm mt-1">Printer models and individual printer configuration</p>
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

    <!-- ── Printer Models ──────────────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Printer Models</p>
        <button
          onclick={() => { editingPrinterModel = null; pmName = ''; pmDescription = ''; pmBuildX = ''; pmBuildY = ''; pmBuildZ = ''; showPrinterModelEditor = true; }}
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          New Model
        </button>
      </div>
      {#if data.printerModels && data.printerModels.length > 0}
        <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a]">
          {#each data.printerModels as model}
            <div class="px-5 py-3.5 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
              <div class="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200">{model.brand} {model.model}</p>
                <p class="text-xs text-zinc-400">{model.dimension_x && model.dimension_y && model.dimension_z ? `${model.dimension_x}×${model.dimension_y}×${model.dimension_z}mm` : 'No dimensions set'}</p>
              </div>
              <div class="flex items-center gap-0.5">
                <button onclick={() => openEditPrinterModel(model)} class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors text-xs">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  Edit
                </button>
                <form method="POST" action="?/deletePrinterModel" use:enhance={() => async ({ result, update }) => { if (result.type === 'failure') alert((result.data as any)?.error || 'Failed to delete'); await update(); }}>
                  <input type="hidden" name="modelId" value={model.id} />
                  <button type="submit" class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs" onclick={(e) => { if (!confirm(`Delete model ${model.brand} ${model.model}?`)) e.preventDefault(); }}>
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
          <p class="text-sm text-zinc-400 mb-3">No printer models defined yet</p>
          <button onclick={() => { editingPrinterModel = null; pmName = ''; pmDescription = ''; pmBuildX = ''; pmBuildY = ''; pmBuildZ = ''; showPrinterModelEditor = true; }} class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors">Add your first model (e.g., P1S, H2S)</button>
        </div>
      {/if}
    </div>

    <!-- ── Printers ────────────────────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Printers</p>
        <button onclick={() => { editingPrinter = null; printerName = ''; printerModelId = ''; printerIp = ''; printerSerial = ''; printerAccessCode = ''; showPrinterEditor = true; }} class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          New Printer
        </button>
      </div>
      {#if data.printers && data.printers.length > 0}
        <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a]">
          {#each data.printers as printer}
            <div class="px-5 py-3.5 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
              <div class="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 17H7a2 2 0 01-2-2V9a2 2 0 012-2h1V5a1 1 0 011-1h6a1 1 0 011 1v2h1a2 2 0 012 2v6a2 2 0 01-2 2zM9 17v2h6v-2M9 12h.01"/></svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                  {printer.name}
                  {#if printer.secrets?.printer_ip && printer.secrets?.serial && printer.secrets?.access_code}
                    <span class="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">Pi</span>
                  {/if}
                </p>
                <p class="text-xs text-zinc-400">{printer.preset ? `${printer.preset.brand} ${printer.preset.model}` : 'No model'}</p>
              </div>
              <span class="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md {
                printer.active ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-[#1a1a1a] text-zinc-400'
              }">{printer.active ? 'Active' : 'Inactive'}</span>
              <div class="flex items-center gap-0.5">
                <button onclick={() => openEditPrinter(printer)} class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors text-xs">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  Edit
                </button>
                <form method="POST" action="?/deletePrinter" use:enhance={() => async ({ result, update }) => { if (result.type === 'failure') alert((result.data as any)?.error || 'Failed to delete'); await update(); }}>
                  <input type="hidden" name="printerId" value={printer.id} />
                  <button type="submit" class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs" onclick={(e) => { if (!confirm(`Delete ${printer.name}?`)) e.preventDefault(); }}>
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
          <p class="text-sm text-zinc-400 mb-3">No printers added yet</p>
          <button onclick={() => { editingPrinter = null; printerName = ''; printerModelId = ''; printerIp = ''; printerSerial = ''; printerAccessCode = ''; showPrinterEditor = true; }} class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors">Add your first printer</button>
        </div>
      {/if}
    </div>

  </div>
</div>

<!-- Printer Model Editor Modal -->
{#if showPrinterModelEditor}
  <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onclick={() => closePrinterModelEditor()} onkeydown={(e) => e.key === 'Escape' && closePrinterModelEditor()} role="button" tabindex="0" aria-label="Close printer model editor">
    <div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <div class="px-6 py-4 border-b border-zinc-50 dark:border-[#1a1a1a] flex justify-between items-center">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">{editingPrinterModel ? 'Edit Model' : 'New Model'}</p>
          <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-0.5">{editingPrinterModel ? editingPrinterModel.name : 'Add a printer model preset'}</p>
        </div>
        <button onclick={closePrinterModelEditor} class="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors" aria-label="Close">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <form method="POST" action={editingPrinterModel ? '?/updatePrinterModel' : '?/addPrinterModel'} class="p-6 space-y-4"
        use:enhance={() => async ({ result, update }) => { if (result.type === 'success') closePrinterModelEditor(); await update(); }}>
        {#if editingPrinterModel}<input type="hidden" name="modelId" value={editingPrinterModel.id} />{/if}
        <div>
          <label for="pmName" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Model Name *</label>
          <input id="pmName" type="text" name="name" bind:value={pmName} required placeholder="e.g., P1S, H2S, X1 Carbon" class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
        </div>
        <div>
          <label for="pmDescription" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Description</label>
          <input id="pmDescription" type="text" name="description" bind:value={pmDescription} placeholder="e.g., Bambu Lab P1S" class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
        </div>
        <div>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Build Volume (mm)</label>
          <div class="grid grid-cols-3 gap-3">
            <div><input type="number" name="buildVolumeX" bind:value={pmBuildX} placeholder="X" step="0.1" class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"/><p class="text-[10px] text-zinc-400 mt-0.5 text-center">X</p></div>
            <div><input type="number" name="buildVolumeY" bind:value={pmBuildY} placeholder="Y" step="0.1" class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"/><p class="text-[10px] text-zinc-400 mt-0.5 text-center">Y</p></div>
            <div><input type="number" name="buildVolumeZ" bind:value={pmBuildZ} placeholder="Z" step="0.1" class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"/><p class="text-[10px] text-zinc-400 mt-0.5 text-center">Z</p></div>
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" onclick={closePrinterModelEditor} class="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Cancel</button>
          <button type="submit" disabled={!pmName.trim()} class="bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 dark:text-zinc-100 font-medium px-5 py-2 rounded-lg text-sm transition-colors">{editingPrinterModel ? 'Save Changes' : 'Add Model'}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Printer Editor Modal -->
{#if showPrinterEditor}
  <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onclick={closePrinterEditor} onkeydown={(e) => e.key === 'Escape' && closePrinterEditor()} role="button" tabindex="0" aria-label="Close printer editor">
    <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg max-w-md w-full" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <div class="px-6 py-4 border-b border-zinc-200 dark:border-[#262626] flex justify-between items-center">
        <div>
          <h2 class="text-xl font-medium text-zinc-900 dark:text-zinc-50">{editingPrinter ? 'Edit Printer' : 'Add Printer'}</h2>
          <p class="text-sm text-zinc-500 mt-1">{editingPrinter ? `Editing ${editingPrinter.name}` : 'Add a new 3D printer'}</p>
        </div>
        <button onclick={closePrinterEditor} class="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors p-2" aria-label="Close">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <form method="POST" action={editingPrinter ? '?/updatePrinter' : '?/addPrinter'} use:enhance={() => async ({ result, update }) => { if (result.type === 'success') closePrinterEditor(); await update(); }}>
        <div class="p-6 space-y-4">
          {#if editingPrinter}<input type="hidden" name="printerId" value={editingPrinter.id} />{/if}
          <div>
            <label for="printerName" class="block text-sm text-zinc-500 mb-2">Printer Name *</label>
            <input type="text" id="printerName" name="name" bind:value={printerName} required placeholder="e.g., P1S #1" class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"/>
          </div>
          <div>
            <label for="printerModelSelect" class="block text-sm text-zinc-500 mb-2">Printer Model</label>
            <select id="printerModelSelect" name="printerModelId" bind:value={printerModelId} class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors">
              <option value="">No model</option>
              {#each data.printerModels || [] as model}
                <option value={model.id}>{model.brand} {model.model}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="slotCount" class="block text-sm text-zinc-500 mb-2">Filament Slots</label>
            <input
              type="number"
              id="slotCount"
              name="slotCount"
              bind:value={printerSlotCount}
              min="1"
              max="16"
              class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
            />
            <p class="text-xs text-zinc-400 mt-1">1 for single-colour · 4 for AMS · 8 for dual AMS</p>
          </div>
          <div class="border border-zinc-200 dark:border-[#262626] rounded-lg overflow-hidden">
            <div class="px-3 py-2 bg-zinc-50 dark:bg-[#1a1a1a] border-b border-zinc-200 dark:border-[#262626]">
              <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Pi Bridge — Bambu Lab LAN credentials</p>
              <p class="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">Required for Pi-initiated prints. Found on printer touchscreen under Settings → Network.</p>
            </div>
            <div class="p-3 space-y-3">
              <div>
                <label for="printer-ip" class="block text-xs text-zinc-500 mb-1">Printer IP</label>
                <input id="printer-ip" type="text" name="printerIp" bind:value={printerIp} placeholder="192.168.1.50" class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"/>
              </div>
              <div>
                <label for="printer-serial" class="block text-xs text-zinc-500 mb-1">Serial Number</label>
                <input id="printer-serial" type="text" name="printerSerial" bind:value={printerSerial} placeholder="01P00A..." class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"/>
              </div>
              <div>
                <label for="printer-access-code" class="block text-xs text-zinc-500 mb-1">Access Code</label>
                <input id="printer-access-code" type="password" name="printerAccessCode" bind:value={printerAccessCode} placeholder="8-digit code" class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"/>
              </div>
              {#if printerIp && printerSerial && printerAccessCode}
                <p class="text-[10px] text-emerald-600 dark:text-emerald-400">Pi-capable — Start Print will be enabled for this printer</p>
              {:else}
                <p class="text-[10px] text-zinc-400">Leave blank to use local file handler only</p>
              {/if}
            </div>
          </div>
          {#if editingPrinter}
            <div class="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-[#262626] rounded-md p-3">
              <div class="flex items-center justify-between text-sm">
                <span class="text-zinc-500">Printer ID:</span>
                <span class="text-blue-600 dark:text-blue-400 font-mono">#{editingPrinter.id}</span>
              </div>
              <p class="text-xs text-zinc-500 mt-2">Use this ID when configuring grid presets</p>
            </div>
          {/if}
        </div>
        <div class="px-6 py-4 border-t border-zinc-200 dark:border-[#262626] flex justify-end gap-3">
          <button type="button" onclick={closePrinterEditor} class="px-6 py-2.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Cancel</button>
          <button type="submit" disabled={!printerName.trim()} class="bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 dark:text-zinc-100 font-medium px-6 py-2.5 rounded-md transition-colors">{editingPrinter ? 'Save Changes' : 'Add Printer'}</button>
        </div>
      </form>
    </div>
  </div>
{/if}
