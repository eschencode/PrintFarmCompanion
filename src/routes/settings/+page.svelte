<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import type { GridCell } from '$lib/types';
  import { goto } from '$app/navigation';
  import { fileHandlerStore } from '$lib/stores/fileHandler';
  import { enhance } from '$app/forms';

  export let data: PageData;
  export let form: ActionData;

  // Subscribe to store
  $: fileHandlerState = $fileHandlerStore;

  let fileHandlerToken = '';
  let testingConnection = false;
  let connectionStatus: 'untested' | 'success' | 'failed' = 'untested';

  // Shopify sync state
  let syncingShopify = false;
  let shopifySyncResult: { success: boolean; ordersProcessed?: number; itemsDeducted?: number; skippedOrders?: number; error?: string; errors?: string[] } | null = null;

  // ✅ Image selection
  let selectedImagePath = '';
  let imagePreviewUrl = '';

  // ✅ Grid Preset Editor
  let showGridEditor = false;
  let gridPresetName = '';
  let gridPresetIsDefault = false;
  let editingGridId: number | null = null; // null = creating new, number = editing existing
  let gridRows = 3;
  let gridCols = 3;
  let editingGridConfig: GridCell[] = [];

  // Cell types available for selection
  const cellTypes = ['printer', 'stats', 'settings', 'storage', 'empty'] as const;

  let moduleSearch = '';

  // computed array that we actually render
  $: filteredModules = data.printModules
    ? data.printModules.filter(m =>
        m.name.toLowerCase().includes(moduleSearch.toLowerCase()) ||
        (m.printer_model ?? '').toLowerCase().includes(moduleSearch.toLowerCase())
      )
    : [];


	let showModuleEditor = false;
let editingModule: any = null; // module being edited


let moduleName = '';
let modulePath = '';
let moduleImage = '';
let modulePrinterModel = '';
let modulePresetId: number | '' = '';
let moduleWeight = '';
let moduleTime = '';
let moduleObjects = 1;

$: populateFields();
function populateFields() {
  if (editingModule) {
    moduleName = editingModule.name;
    modulePath = editingModule.path;
    moduleImage = editingModule.image_path || '';
    modulePrinterModel = editingModule.printer_model || '';
    modulePresetId = editingModule.default_spool_preset_id || '';
    moduleWeight = editingModule.expected_weight ?? '';
    moduleTime = editingModule.expected_time ?? '';
    moduleObjects = editingModule.objects_per_print || 1;
  }
}


  // Generate empty grid config based on dimensions
  function generateEmptyGrid(rows: number, cols: number): GridCell[] {
    return Array(rows * cols).fill(null).map(() => ({ type: 'empty' as const }));
  }

  // Handle dimension changes - resize the grid
  function updateGridDimensions() {
    const totalCells = gridRows * gridCols;
    const currentLength = editingGridConfig.length;

    if (totalCells > currentLength) {
      // Add empty cells
      editingGridConfig = [
        ...editingGridConfig,
        ...Array(totalCells - currentLength).fill(null).map(() => ({ type: 'empty' as const }))
      ];
    } else if (totalCells < currentLength) {
      // Trim cells
      editingGridConfig = editingGridConfig.slice(0, totalCells);
    }
  }

  function openGridEditor(preset?: any) {
    showGridEditor = true;

    if (preset) {
      // Edit existing preset
      editingGridId = preset.id;
      gridPresetName = preset.name;
      gridPresetIsDefault = preset.is_default === 1;
      gridRows = preset.rows || 3;
      gridCols = preset.cols || 3;
      editingGridConfig = parseGridConfig(preset.grid_config);
    } else {
      // Create new preset
      editingGridId = null;
      gridPresetName = '';
      gridPresetIsDefault = data.gridPresets.length === 0; // Default if first preset
      gridRows = 3;
      gridCols = 3;
      editingGridConfig = generateEmptyGrid(3, 3);
    }
  }

  function closeGridEditor() {
    showGridEditor = false;
    editingGridId = null;
  }

  function setCellType(index: number, type: GridCell['type']) {
    editingGridConfig[index] = { type };
    editingGridConfig = [...editingGridConfig]; // Trigger reactivity
  }

  function setCellPrinter(index: number, printerId: number) {
    editingGridConfig[index] = { type: 'printer', printerId };
    editingGridConfig = [...editingGridConfig]; // Trigger reactivity
  }

  function getGridConfigJson(): string {
    return JSON.stringify(editingGridConfig);
  }

  // Reactive grid config JSON for form submission
  $: gridConfigJson = JSON.stringify(editingGridConfig);

  function parseGridConfig(jsonString: string): GridCell[] {
    try {
      return JSON.parse(jsonString);
    } catch {
      return [];
    }
  }

  function getPrinterName(printerId: number | undefined): string {
    if (!printerId) return 'Unknown';
    const printer = data.printers?.find((p: any) => p.id === printerId);
    return printer?.name || `Printer #${printerId}`;
  }

  // ✅ Printer Editor
  let showPrinterEditor = false;
  let editingPrinter: any = null;
  let printerName = '';
  let printerModel = '';

  function openEditPrinter(printer: any) {
    editingPrinter = printer;
    printerName = printer.name;
    printerModel = printer.model || '';
    showPrinterEditor = true;
  }

  function closePrinterEditor() {
    showPrinterEditor = false;
    editingPrinter = null;
    printerName = '';
    printerModel = '';
  }

  // Sync local variable with store
  $: fileHandlerToken = fileHandlerState.token;

  function saveFileHandlerToken() {
    fileHandlerStore.setToken(fileHandlerToken);
    connectionStatus = 'untested';
    alert('✅ Token saved! Connection will be tested automatically.');
  }

  async function testConnection() {
    if (!fileHandlerToken) {
      alert('⚠️ Please enter a token first');
      return;
    }

    testingConnection = true;
    connectionStatus = 'untested';

    const connected = await fileHandlerStore.testConnection();

    connectionStatus = connected ? 'success' : 'failed';
    testingConnection = false;
  }

  // ✅ Update image preview when selection changes
  function updateImagePreview(imageName: string) {
    selectedImagePath = imageName;
    if (imageName) {
      imagePreviewUrl = `/images/${imageName}`;
    } else {
      imagePreviewUrl = '';
    }
  }
</script>

<div class="min-h-screen p-6 sm:p-10">
  <div class="max-w-4xl mx-auto">

    <!-- Header -->
    <div class="mb-10">
      <a
        href="/"
        onclick={(e) => { e.preventDefault(); goto('/'); }}
        class="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mb-4 tracking-wide transition-colors"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Dashboard
      </a>
      <h1 class="text-[2rem] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-none">Settings</h1>
      <p class="text-zinc-400 dark:text-zinc-500 text-sm mt-2">Configure your workspace</p>
    </div>

    <!-- Flash messages -->
    {#if form?.success}
      <div class="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-xl px-4 py-3 mb-6">
        <svg class="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
        <p class="text-sm text-emerald-700 dark:text-emerald-400">{form.message || 'Action completed successfully'}</p>
      </div>
    {/if}
    {#if form?.error}
      <div class="flex items-center gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-xl px-4 py-3 mb-6">
        <svg class="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
        <p class="text-sm text-red-700 dark:text-red-400">{form.error}</p>
      </div>
    {/if}

    <!-- ── Printers ──────────────────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Printers</p>
        <button
          onclick={() => showPrinterEditor = true}
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          New Printer
        </button>
      </div>
      {#if data.printers && data.printers.length > 0}
        <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a]">
          {#each data.printers as printer}
            <div class="px-5 py-3.5 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
              <div class="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 17H7a2 2 0 01-2-2V9a2 2 0 012-2h1V5a1 1 0 011-1h6a1 1 0 011 1v2h1a2 2 0 012 2v6a2 2 0 01-2 2zM9 17v2h6v-2M9 12h.01"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200">{printer.name}</p>
                <p class="text-xs text-zinc-400">{printer.model || 'No model'} · {printer.total_hours?.toFixed(1) || 0}h total</p>
              </div>
              <span class="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md {
                printer.status === 'printing' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' :
                printer.status === 'IDLE' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' :
                'bg-zinc-100 dark:bg-[#1a1a1a] text-zinc-400'
              }">{printer.status}</span>
              <div class="flex items-center gap-0.5">
                <button
                  onclick={() => openEditPrinter(printer)}
                  class="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors"
                  title="Edit"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                <form method="POST" action="?/deletePrinter" use:enhance={() => {
                  return async ({ result, update }) => {
                    if (result.type === 'success' || result.type === 'redirect') {
                      await update();
                    } else if (result.type === 'failure') {
                      alert(result.data?.error || 'Failed to delete printer');
                    }
                  };
                }}>
                  <input type="hidden" name="printerId" value={printer.id} />
                  <button
                    type="submit"
                    class="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Delete"
                    onclick={(e) => { if (!confirm(`Delete ${printer.name}?`)) e.preventDefault(); }}
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="px-5 py-10 text-center">
          <p class="text-sm text-zinc-400 mb-3">No printers added yet</p>
          <button
            onclick={() => showPrinterEditor = true}
            class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors"
          >Add your first printer</button>
        </div>
      {/if}
    </div>

    <!-- ── Print Modules ─────────────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Print Modules</p>
        <button
          onclick={() => {
            editingModule = null;
            moduleName = ''; modulePath = ''; moduleImage = '';
            modulePrinterModel = ''; modulePresetId = '';
            moduleWeight = ''; moduleTime = ''; moduleObjects = 1;
            showModuleEditor = true;
          }}
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          New Module
        </button>
      </div>
      <!-- Search -->
      <div class="px-5 py-3 border-b border-zinc-50 dark:border-[#1a1a1a]">
        <input
          type="text"
          placeholder="Search modules..."
          bind:value={moduleSearch}
          class="w-full bg-zinc-50 dark:bg-[#161616] rounded-lg px-3.5 py-2 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 border border-transparent focus:border-zinc-200 dark:focus:border-[#262626] focus:outline-none transition-colors"
        />
      </div>
      {#if filteredModules.length > 0}
        <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a]">
          {#each filteredModules as module}
            {@const linkedPreset = data.spoolPresets.find(p => p.id === module.default_spool_preset_id)}
            <div class="px-5 py-3.5 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
              {#if module.image_path}
                <div class="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 dark:bg-[#1a1a1a] shrink-0">
                  <img src={module.image_path} alt={module.name} class="w-full h-full object-cover"
                    onerror={(e) => e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'} />
                </div>
              {:else}
                <div class="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-[#1a1a1a] shrink-0 flex items-center justify-center">
                  <svg class="w-4 h-4 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                  </svg>
                </div>
              {/if}
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200">{module.name}</p>
                <p class="text-xs text-zinc-400 font-mono truncate">{module.path}</p>
                <div class="flex items-center gap-3 mt-0.5">
                  {#if module.printer_model}<span class="text-[10px] text-zinc-400">{module.printer_model}</span>{/if}
                  <span class="text-[10px] text-zinc-400">{linkedPreset ? linkedPreset.name : 'Any spool'}</span>
                  <span class="text-[10px] text-zinc-400">{module.expected_weight}g · {module.expected_time}min · {module.objects_per_print}×</span>
                </div>
              </div>
              <div class="flex items-center gap-0.5">
                <button
                  onclick={() => { editingModule = module; showModuleEditor = true; populateFields(); }}
                  class="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors"
                  title="Edit"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                <form method="POST" action="?/deleteModule">
                  <input type="hidden" name="moduleId" value={module.id} />
                  <button
                    type="submit"
                    class="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Delete"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="px-5 py-10 text-center">
          <p class="text-sm text-zinc-400">{moduleSearch ? 'No modules match your search.' : 'No print modules yet.'}</p>
        </div>
      {/if}
    </div>

    <!-- ── Spool Presets ─────────────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <details class="group">
        <summary class="px-5 py-4 flex items-center justify-between cursor-pointer list-none border-b border-zinc-50 dark:border-[#1a1a1a]">
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Spool Presets</p>
          <span class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            New Preset
          </span>
        </summary>
        <!-- Add Preset Form -->
        <form method="POST" action="?/addSpoolPreset" class="px-5 py-5 border-b border-zinc-50 dark:border-[#1a1a1a] space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <label for="presetName" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Name</label>
              <input type="text" id="presetName" name="name" required placeholder="e.g., Bambu PLA Basic Black"
                class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
            <div>
              <label for="brand" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Brand</label>
              <input type="text" id="brand" name="brand" required placeholder="Bambu Lab"
                class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
            <div>
              <label for="material" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Material</label>
              <input type="text" id="material" name="material" required placeholder="PLA"
                class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
            <div>
              <label for="color" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Color</label>
              <input type="text" id="color" name="color" placeholder="Black"
                class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
            <div>
              <label for="defaultWeight" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Weight (g)</label>
              <input type="number" id="defaultWeight" name="defaultWeight" required min="0" value="1000"
                class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
            <div>
              <label for="cost" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Cost (€)</label>
              <input type="number" id="cost" name="cost" min="0" step="0.01" placeholder="20.00"
                class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
          </div>
          <div class="flex justify-end">
            <button type="submit"
              class="inline-flex items-center h-9 px-4 rounded-lg text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors">
              Add Spool Preset
            </button>
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
                {#if preset.cost}
                  <span class="text-emerald-600 dark:text-emerald-400">€{preset.cost.toFixed(2)}</span>
                {/if}
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

    <!-- ── Dashboard Grid Presets ────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Dashboard Grid Presets</p>
        <button
          onclick={() => openGridEditor()}
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          New Preset
        </button>
      </div>
      {#if data.gridPresets && data.gridPresets.length > 0}
        <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a]">
          {#each data.gridPresets as preset}
            {@const gridConfig = parseGridConfig(preset.grid_config)}
            {@const presetRows = preset.rows || 3}
            {@const presetCols = preset.cols || 3}
            <div class="px-5 py-4 flex items-center gap-5 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
              <!-- Mini grid preview (colour-coded, no emoji) -->
              <div class="grid gap-0.5 shrink-0" style="grid-template-columns: repeat({presetCols}, minmax(0, 1fr)); width: {presetCols * 14}px;">
                {#each gridConfig as cell}
                  <div class="aspect-square rounded-sm {
                    cell.type === 'printer'  ? 'bg-blue-300 dark:bg-blue-700/70' :
                    cell.type === 'stats'    ? 'bg-emerald-300 dark:bg-emerald-700/70' :
                    cell.type === 'settings' ? 'bg-violet-300 dark:bg-violet-700/70' :
                    cell.type === 'storage'  ? 'bg-amber-300 dark:bg-amber-700/70' :
                    cell.type === 'inventory'? 'bg-orange-300 dark:bg-orange-700/70' :
                    cell.type === 'spools'   ? 'bg-rose-300 dark:bg-rose-700/70' :
                    'bg-zinc-200 dark:bg-[#262626]'
                  }"></div>
                {/each}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200">{preset.name}</p>
                  {#if preset.is_default}
                    <span class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">Default</span>
                  {/if}
                </div>
                <p class="text-xs text-zinc-400 mt-0.5">{presetRows}×{presetCols} grid</p>
              </div>
              <div class="flex items-center gap-0.5">
                <button
                  onclick={() => openGridEditor(preset)}
                  class="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors"
                  title="Edit"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                {#if !preset.is_default}
                  <form method="POST" action="?/setDefaultGridPreset" use:enhance>
                    <input type="hidden" name="presetId" value={preset.id}/>
                    <button type="submit"
                      class="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                      title="Set as default">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                      </svg>
                    </button>
                  </form>
                {/if}
                <form method="POST" action="?/deleteGridPreset" use:enhance>
                  <input type="hidden" name="presetId" value={preset.id}/>
                  <button type="submit"
                    class="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Delete">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="px-5 py-10 text-center">
          <p class="text-sm text-zinc-400 mb-3">No grid presets yet</p>
          <button onclick={() => openGridEditor()}
            class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors">
            Create your first preset
          </button>
        </div>
      {/if}
    </div>

    <!-- ── Shopify Integration ───────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Shopify Integration</p>
        {#if data.shopifyConfigured}
          <form method="POST" action="?/syncShopify" use:enhance={() => {
            syncingShopify = true;
            return async ({ result, update }) => {
              syncingShopify = false;
              if (result.type === 'success' && result.data) {
                shopifySyncResult = result.data as typeof shopifySyncResult;
              } else { shopifySyncResult = null; }
              await update();
            };
          }}>
            <button type="submit" disabled={syncingShopify}
              class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors">
              {#if syncingShopify}
                <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Syncing...
              {:else}
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                Sync Now
              {/if}
            </button>
          </form>
        {/if}
      </div>
      <div class="p-5">
        {#if !data.shopifyConfigured}
          <div class="py-8 text-center space-y-2">
            <p class="text-sm font-medium text-zinc-500">Shopify not configured</p>
            <p class="text-xs text-zinc-400 max-w-sm mx-auto">
              Set <code class="bg-zinc-100 dark:bg-[#1a1a1a] px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-400">SHOPIFY_STORE_DOMAIN</code> and
              <code class="bg-zinc-100 dark:bg-[#1a1a1a] px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-400">SHOPIFY_ACCESS_TOKEN</code> in your environment.
            </p>
            <a href="https://admin.shopify.com/store/dilemma-studio/settings/apps/development" target="_blank"
              class="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
              Open Shopify Admin
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
            </a>
          </div>
        {:else}
          {#if shopifySyncResult}
            <div class="mb-4 px-4 py-3 rounded-lg {shopifySyncResult.success ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40' : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40'}">
              {#if shopifySyncResult.success}
                <p class="text-sm font-medium text-emerald-700 dark:text-emerald-400">Sync complete</p>
                <p class="text-xs text-zinc-500 mt-1">{shopifySyncResult.ordersProcessed} orders · {shopifySyncResult.itemsDeducted} items deducted{(shopifySyncResult.skippedOrders ?? 0) > 0 ? ` · ${shopifySyncResult.skippedOrders} skipped` : ''}</p>
              {:else}
                <p class="text-sm font-medium text-red-700 dark:text-red-400">Sync failed</p>
                <p class="text-xs text-zinc-500 mt-1">{shopifySyncResult.error}</p>
              {/if}
              {#if shopifySyncResult.errors?.length}
                <div class="mt-2 space-y-0.5">
                  {#each shopifySyncResult.errors as error}
                    <p class="text-xs text-amber-600 dark:text-amber-400">· {error}</p>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
          <div class="grid grid-cols-3 gap-3 mb-5">
            {#each [
              { label: 'Last Sync', value: data.shopifySyncState?.last_sync_at ? new Date(data.shopifySyncState.last_sync_at).toLocaleString() : 'Never' },
              { label: 'Orders Processed', value: String(data.shopifySyncState?.orders_processed ?? 0) },
              { label: 'Items Deducted', value: String(data.shopifySyncState?.items_deducted ?? 0) },
            ] as stat}
              <div class="bg-zinc-50 dark:bg-[#161616] rounded-lg px-4 py-3">
                <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 mb-1.5">{stat.label}</p>
                <p class="text-sm font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">{stat.value}</p>
              </div>
            {/each}
          </div>
          {#if data.shopifyRecentOrders?.length > 0}
            <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 mb-2">Recent Orders</p>
            <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden">
              {#each data.shopifyRecentOrders as order}
                <div class="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
                  <span class="text-sm text-zinc-700 dark:text-zinc-300 font-mono">#{order.shopify_order_number}</span>
                  <span class="text-xs text-zinc-400">{order.total_items} items</span>
                  <span class="text-xs text-zinc-400">{new Date(order.processed_at).toLocaleString()}</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-zinc-400 text-center py-4">No orders synced yet</p>
          {/if}
        {/if}
      </div>
    </div>

    <!-- ── Local File Handler ────────────────────────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-10">
      <div class="px-5 py-4 border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Local File Handler</p>
        <p class="text-xs text-zinc-400 mt-1">Enables automatic file opening on print start</p>
      </div>
      <div class="p-5 space-y-4">
        <div>
          <label for="fileHandlerToken" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Auth Token</label>
          <input
            type="text"
            id="fileHandlerToken"
            bind:value={fileHandlerToken}
            placeholder="Paste your AUTH_TOKEN here"
            class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 font-mono focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
          />
          <p class="text-xs text-zinc-400 mt-1.5">Stored locally in your browser. Find it in <code class="bg-zinc-100 dark:bg-[#1a1a1a] px-1.5 py-0.5 rounded">local-file-handler/.env</code></p>
        </div>
        <div class="flex gap-2">
          <button onclick={saveFileHandlerToken}
            class="flex-1 h-9 rounded-lg text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors">
            Save Token
          </button>
          <button onclick={testConnection} disabled={testingConnection || !fileHandlerToken}
            class="flex-1 h-9 rounded-lg text-sm font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {testingConnection ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
        {#if connectionStatus === 'success'}
          <div class="flex items-center gap-2.5 px-3.5 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-lg">
            <svg class="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span class="text-sm text-emerald-700 dark:text-emerald-400">Connection successful — file handler is online</span>
          </div>
        {:else if connectionStatus === 'failed'}
          <div class="px-3.5 py-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-lg">
            <p class="text-sm font-medium text-red-700 dark:text-red-400">Connection failed</p>
            <p class="text-xs text-zinc-400 mt-1">Make sure the handler is running: <code class="bg-zinc-100 dark:bg-[#1a1a1a] px-1.5 py-0.5 rounded">cd local-file-handler && bun run start</code></p>
          </div>
        {/if}
      </div>
    </div>

  </div>
</div>

<!-- Grid Editor Modal -->
{#if showGridEditor}
  <div
    class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
    onclick={closeGridEditor}
    onkeydown={(e) => e.key === 'Escape' && closeGridEditor()}
    role="button" tabindex="0" aria-label="Close grid editor"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      role="dialog" aria-modal="true"
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-zinc-50 dark:border-[#1a1a1a] flex justify-between items-center sticky top-0 bg-white dark:bg-[#111] z-10">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">{editingGridId ? 'Edit Grid Preset' : 'New Grid Preset'}</p>
          <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-0.5">Configure your dashboard layout</p>
        </div>
        <button onclick={closeGridEditor}
          class="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors"
          aria-label="Close">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <form method="POST" action={editingGridId ? '?/updateGridPreset' : '?/addGridPreset'} use:enhance={() => {
        return async ({ result, update }) => {
          if (result.type === 'success') { closeGridEditor(); }
          await update();
        };
      }}>
        <div class="p-6 space-y-6">
          {#if editingGridId}
            <input type="hidden" name="presetId" value={editingGridId} />
          {/if}

          <div>
            <label for="gridPresetName" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Preset Name</label>
            <input type="text" id="gridPresetName" name="name" bind:value={gridPresetName} required
              placeholder="e.g., Main Dashboard, Large Grid"
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="gridRows" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Rows</label>
              <input type="number" id="gridRows" name="rows" bind:value={gridRows} onchange={updateGridDimensions} min="1" max="10"
                class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
            <div>
              <label for="gridCols" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Columns</label>
              <input type="number" id="gridCols" name="cols" bind:value={gridCols} onchange={updateGridDimensions} min="1" max="10"
                class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
            </div>
          </div>

          <p class="text-xs text-zinc-400">{gridRows}×{gridCols} = {gridRows * gridCols} cells</p>

          <div class="flex items-center gap-3">
            <input type="checkbox" id="gridIsDefault" name="isDefault" bind:checked={gridPresetIsDefault} value="true"
              class="w-4 h-4 rounded bg-zinc-50 dark:bg-[#161616] border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-900 dark:focus:ring-zinc-50"/>
            <label for="gridIsDefault" class="text-sm text-zinc-600 dark:text-zinc-400">Set as default dashboard grid</label>
          </div>

          <input type="hidden" name="gridConfig" value={gridConfigJson} />

          <div>
            <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-3">Grid Layout ({gridRows}×{gridCols})</p>
            <div class="grid gap-2" style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr));">
              {#each editingGridConfig as cell, index}
                <div class="bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-xl p-2.5 flex flex-col min-h-[120px]">
                  <p class="text-[10px] text-zinc-400 mb-1.5">Cell {index + 1}</p>
                  <select
                    class="bg-white dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 mb-1.5 focus:outline-none focus:border-zinc-400 transition-colors"
                    value={cell.type}
                    onchange={(e) => setCellType(index, e.currentTarget.value as GridCell['type'])}
                  >
                    <option value="empty">Empty</option>
                    <option value="printer">Printer</option>
                    <option value="stats">Stats</option>
                    <option value="settings">Settings</option>
                    <option value="storage">Storage</option>
                    <option value="spools">Materials</option>
                    <option value="inventory">Inventory</option>
                  </select>
                  {#if cell.type === 'printer'}
                    <select
                      class="bg-white dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-400 transition-colors"
                      value={cell.printerId || ''}
                      onchange={(e) => setCellPrinter(index, Number(e.currentTarget.value))}
                    >
                      <option value="">Select Printer</option>
                      {#each data.printers as printer}
                        <option value={printer.id}>{printer.name}</option>
                      {/each}
                    </select>
                  {/if}
                  <div class="flex-1 flex items-center justify-center mt-1">
                    <div class="w-6 h-6 rounded-md {
                      cell.type === 'printer'  ? 'bg-blue-300 dark:bg-blue-700/70' :
                      cell.type === 'stats'    ? 'bg-emerald-300 dark:bg-emerald-700/70' :
                      cell.type === 'settings' ? 'bg-violet-300 dark:bg-violet-700/70' :
                      cell.type === 'storage'  ? 'bg-amber-300 dark:bg-amber-700/70' :
                      cell.type === 'inventory'? 'bg-orange-300 dark:bg-orange-700/70' :
                      cell.type === 'spools'   ? 'bg-rose-300 dark:bg-rose-700/70' :
                      'bg-zinc-200 dark:bg-[#262626]'
                    }">
                      {#if cell.type === 'printer' && cell.printerId}
                        <p class="text-[8px] text-blue-800 dark:text-blue-200 truncate px-1 pt-1">{getPrinterName(cell.printerId)}</p>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-zinc-50 dark:border-[#1a1a1a] flex justify-end gap-2 sticky bottom-0 bg-white dark:bg-[#111]">
          <button type="button" onclick={closeGridEditor}
            class="h-9 px-4 rounded-lg text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={!gridPresetName.trim()}
            class="h-9 px-4 rounded-lg text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {editingGridId ? 'Save Changes' : 'Create Preset'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}


<!-- Printer Editor Modal -->
{#if showPrinterEditor}
  <div
    class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
    onclick={closePrinterEditor}
    onkeydown={(e) => e.key === 'Escape' && closePrinterEditor()}
    role="button"
    tabindex="0"
    aria-label="Close printer editor"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg max-w-md w-full"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-zinc-200 dark:border-[#262626] bg-zinc-50 dark:bg-[#111111] flex justify-between items-center">
        <div>
          <h2 class="text-xl font-medium">{editingPrinter ? 'Edit Printer' : 'Add Printer'}</h2>
          <p class="text-sm text-zinc-500 mt-1">
            {editingPrinter ? `Editing ${editingPrinter.name}` : 'Add a new 3D printer'}
          </p>
        </div>
        <button
          onclick={closePrinterEditor}
          class="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors p-2"
          aria-label="Close"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form
        method="POST"
        action={editingPrinter ? '?/updatePrinter' : '?/addPrinter'}
        use:enhance={() => {
          return async ({ result, update }) => {
            if (result.type === 'success') {
              closePrinterEditor();
            }
            await update();
          };
        }}
      >
        <div class="p-6 space-y-4">
          {#if editingPrinter}
            <input type="hidden" name="printerId" value={editingPrinter.id} />
          {/if}

          <!-- Printer Name -->
          <div>
            <label for="printerName" class="block text-sm text-zinc-500 mb-2">Printer Name *</label>
            <input
              type="text"
              id="printerName"
              name="name"
              bind:value={printerName}
              required
              placeholder="e.g., P1S #1, Bambu Lab X1C"
              class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
            />
          </div>

          <!-- Printer Model -->
          <div>
            <label for="printerModel" class="block text-sm text-zinc-500 mb-2">Model (Optional)</label>
            <input
              type="text"
              id="printerModel"
              name="model"
              bind:value={printerModel}
              placeholder="e.g., P1S, X1 Carbon, A1 Mini"
              class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
            />
            <p class="text-xs text-zinc-500 mt-1">Used to display the correct printer image</p>
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

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-zinc-200 dark:border-[#262626] bg-zinc-50 dark:bg-[#111111] flex justify-end gap-3">
          <button
            type="button"
            onclick={closePrinterEditor}
            class="px-6 py-2.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!printerName.trim()}
            class="bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white dark:text-zinc-900 font-medium px-6 py-2.5 rounded-md transition-colors"
          >
            {editingPrinter ? 'Save Changes' : 'Add Printer'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}


<!-- Module editor modal -->
{#if showModuleEditor}
  <div
    class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
    onclick={() => {
      showModuleEditor = false;
      editingModule = null;
    }}
    onkeydown={(e) => e.key === 'Escape' && (showModuleEditor = false)}
    role="button" tabindex="0" aria-label="Close module editor"
  >
    <!-- stop background clicks bubbling to outer div -->
    <div
      class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg max-w-lg w-full overflow-y-auto"
      onclick={(e) => e.stopPropagation()}
      role="dialog" aria-modal="true"
    >
      <div class="px-6 py-4 border-b border-zinc-200 dark:border-[#262626] bg-zinc-50 dark:bg-[#111111] flex justify-between items-center">
        <h2 class="text-xl font-medium">
          {editingModule ? 'Edit print module' : 'Add print module'}
        </h2>
        <button
          onclick={() => {
            showModuleEditor = false;
            editingModule = null;
          }}
          class="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 p-2"
          aria-label="Close"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form
        method="POST"
        action={editingModule ? '?/updateModule' : '?/addModule'}
        class="p-6 space-y-4"
        use:enhance={() => {
          return async ({ result, update }) => {
            if (result.type === 'success') {
              showModuleEditor = false;
              editingModule = null;
            }
            await update();
          };
        }}
      >
        {#if editingModule}
          <input type="hidden" name="moduleId" value={editingModule.id} />
        {/if}

        <!-- module name -->
        <div>
          <label for="editModuleName" class="block text-sm text-zinc-500 mb-2">Module
            Name</label>
          <input
            id="editModuleName"
            type="text"
            name="name"
            bind:value={moduleName}
            required
            class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
          />
        </div>

        <!-- printer model -->
        <div>
          <label for="editPrinterModel" class="block text-sm text-zinc-500 mb-2">Printer
            Model</label>
          <input
            id="editPrinterModel"
            type="text"
            name="printerModel"
            bind:value={modulePrinterModel}
            placeholder="e.g. P1S, H2S"
            class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
          />
          <p class="text-xs text-zinc-500 mt-1">
            Restrict this module to a specific printer model.
          </p>
        </div>

        <!-- path -->
        <div>
          <label for="editModulePath" class="block text-sm text-zinc-500 mb-2">File
            Path</label>
          <input
            id="editModulePath"
            type="text"
            name="path"
            bind:value={modulePath}
            required
            class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors font-mono text-sm"
          />
          <p class="text-xs text-zinc-500 mt-1">Must be an absolute path</p>
        </div>

        <!-- image selector -->
        <div>
          <label for="editImagePath" class="block text-sm text-zinc-500 mb-2">
            Module Image (Optional)
          </label>
          <select
            id="editImagePath"
            name="imagePath"
            bind:value={moduleImage}
            onchange={(e) => updateImagePreview(e.currentTarget.value)}
            class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
          >
            <option value="">No image</option>
            {#if data.availableImages && data.availableImages.length > 0}
              {#each data.availableImages as img}
                <option value={img}>{img}</option>
              {/each}
            {:else}
              <option value="" disabled>No images available</option>
            {/if}
          </select>
        </div>

        <!-- spool preset dropdown -->
        <div>
          <label for="editDefaultSpoolPresetId" class="block text-sm text-zinc-500 mb-2">
            Preferred Spool Preset (Optional)
          </label>
          <select
            id="editDefaultSpoolPresetId"
            name="defaultSpoolPresetId"
            bind:value={modulePresetId}
            class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
          >
            <option value="">Any spool (no preference)</option>
            {#if data.spoolPresets && data.spoolPresets.length > 0}
              {#each data.spoolPresets as preset}
                <option value={preset.id}>
                  {preset.name} ({preset.brand} {preset.material})
                </option>
              {/each}
            {/if}
          </select>
          <p class="text-xs text-zinc-500 mt-1">
            This module will only appear when a matching spool is loaded
          </p>
        </div>

        <!-- weight/time/objects grid -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="editExpectedWeight" class="block text-sm text-zinc-500 mb-2">Weight
              (g)</label>
            <input
              id="editExpectedWeight"
              type="number"
              name="expectedWeight"
              bind:value={moduleWeight}
              required
              min="0"
              step="0.1"
              class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
            />
          </div>
          <div>
            <label for="editExpectedTime" class="block text-sm text-zinc-500 mb-2">Time
              (min)</label>
            <input
              id="editExpectedTime"
              type="number"
              name="expectedTime"
              bind:value={moduleTime}
              required
              min="0"
              class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
            />
          </div>
        </div>
        <div>
          <label for="editObjectsPerPrint" class="block text-sm text-zinc-500 mb-2">
            Objects Per Print</label>
          <input
            id="editObjectsPerPrint"
            type="number"
            name="objectsPerPrint"
            bind:value={moduleObjects}
            required
            min="1"
            class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
          />
        </div>

        <button
          type="submit"
          class="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-medium py-3 rounded-md transition-colors"
        >
          {editingModule ? 'Save Changes' : 'Add Module'}
        </button>
      </form>
    </div>
  </div>
{/if}


<style>
  label {
    display: block;
    font-weight: bold;
    margin-bottom: 0.25rem;
    color: #333;
  }

  input, select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  input:focus, select:focus {
    outline: none;
    border-color: #2196F3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
  }

  button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 1rem;
    transition: background 0.2s;
  }

  .btn-primary {
    background: #2196F3;
    color: white;
    width: 100%;
  }

  .btn-primary:hover {
    background: #1976D2;
  }

  .btn-danger {
    background: #f44336;
    color: white;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }

  .btn-danger:hover {
    background: #d32f2f;
  }

  ul {
    list-style: none;
    padding: 0;
  }

  li {
    padding: 1rem;
    margin: 0.5rem 0;
    background: #f5f5f5;
    border-radius: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .module-list li {
    flex-direction: column;
    align-items: stretch;
  }

  .module-info {
    margin-bottom: 1rem;
  }

  .module-details {
    display: flex;
    gap: 1rem;
    margin-top: 0.5rem;
    font-size: 0.9rem;
    color: #666;
  }

  .success {
    background: #d4edda;
    border: 2px solid #28a745;
    padding: 1rem;
    border-radius: 8px;
    margin: 1rem 0;
  }

  .error {
    background: #f8d7da;
    border: 2px solid #dc3545;
    padding: 1rem;
    border-radius: 8px;
    margin: 1rem 0;
  }
</style>
