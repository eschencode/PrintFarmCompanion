<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import type { GridCell } from '$lib/types';
  import { goto } from '$app/navigation';
  import { fileHandlerStore } from '$lib/stores/fileHandler';
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';

  let activeSection = 'printer-models';

  onMount(() => {
    const ids = ['printer-models','printers','spool-presets','grid-presets','shopify','sku-mappings','file-handler'];
    const observers = ids.map(id => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) activeSection = id; },
        { rootMargin: '-20% 0px -70% 0px' }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  });

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

  // SKU Set editor state
  type SetItem = { source_type: 'inventory' | 'storage'; inventory_slug: string; spool_preset_id: number | null; quantity: number };
  let editingSetSku: string | null = null; // null = not editing, '' = new set, 'SKU' = editing existing
  let editingSetSkuInput = '';
  let editingSetItems: SetItem[] = [];
  let skuSearch = '';

  function openSetEditor(sku: string | null) {
    if (sku) {
      editingSetSku = sku;
      editingSetSkuInput = sku;
      const existing = (data.skuMappings || []).filter((m: any) => m.shopify_sku === sku);
      editingSetItems = existing.map((m: any) => ({
        source_type: m.source_type || 'inventory',
        inventory_slug: m.inventory_slug || '',
        spool_preset_id: m.spool_preset_id ?? null,
        quantity: m.quantity
      }));
    } else {
      editingSetSku = '';
      editingSetSkuInput = '';
      editingSetItems = [{ source_type: 'inventory', inventory_slug: '', spool_preset_id: null, quantity: 1 }];
    }
  }

  // Inline inventory item creator
  let showNewInventoryItem = false;
  let newInvName = '';
  let newInvSlug = '';
  let creatingInventoryItem = false;

  function slugify(text: string): string {
    return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  async function createNewInventoryItem() {
    if (!newInvName.trim() || !newInvSlug.trim()) return;
    creatingInventoryItem = true;
    try {
      const res = await fetch('?/addInventoryItem', {
        method: 'POST',
        body: new URLSearchParams({ name: newInvName.trim(), slug: newInvSlug.trim() })
      });
      const result = await res.json();
      if (result.type === 'success') {
        // Add to local data so it appears in dropdowns immediately
        data.inventoryItems = [...(data.inventoryItems || []), { slug: newInvSlug.trim(), name: newInvName.trim(), stock_count: 0 }];
        showNewInventoryItem = false;
        newInvName = '';
        newInvSlug = '';
      }
    } catch (e) {
      console.error('Failed to create inventory item:', e);
    }
    creatingInventoryItem = false;
  }

  function closeSetEditor() {
    editingSetSku = null;
    editingSetItems = [];
    showNewInventoryItem = false;
  }

  function addSetItem() {
    editingSetItems = [...editingSetItems, { source_type: 'inventory', inventory_slug: '', spool_preset_id: null, quantity: 1 }];
  }

  function removeSetItem(index: number) {
    editingSetItems = editingSetItems.filter((_, i) => i !== index);
  }

  function getItemLabel(mapping: any): string {
    if (mapping.source_type === 'storage' && mapping.spool_preset_id) {
      const preset = data.spoolPresets?.find((p: any) => p.id === mapping.spool_preset_id);
      return preset ? `${preset.name} (${preset.brand})` : `Preset #${mapping.spool_preset_id}`;
    }
    const item = (data.inventoryItems || []).find((i: any) => i.slug === mapping.inventory_slug);
    return item ? item.name : mapping.inventory_slug;
  }

  $: groupedMappings = (() => {
    const search = skuSearch.toLowerCase();
    const filtered = (data.skuMappings || []).filter((m: any) =>
      m.shopify_sku.toLowerCase().includes(search) ||
      (m.inventory_slug || '').toLowerCase().includes(search) ||
      getItemLabel(m).toLowerCase().includes(search)
    );
    const groups: Record<string, typeof filtered> = {};
    for (const m of filtered) {
      if (!groups[m.shopify_sku]) groups[m.shopify_sku] = [];
      groups[m.shopify_sku].push(m);
    }
    return groups;
  })();

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
let showPresetEditor = false;
let editingPreset: any = null;


let moduleName = '';
let modulePath = '';
let moduleImage = '';
let moduleModelId: number | string = '';
let modulePresetIds: number[] = [];
let moduleWeight = '';
let moduleTime = '';
let moduleObjects = 1;
let moduleInventorySlug = '';

$: populateFields();
function populateFields() {
  if (editingModule) {
    moduleName = editingModule.name;
    modulePath = editingModule.local_file_handler_path;
    moduleImage = editingModule.image_path || '';
    moduleModelId = editingModule.printer_model_id || '';
    modulePresetIds = editingModule.spool_preset_ids?.length
      ? editingModule.spool_preset_ids
      : (editingModule.default_spool_preset_id ? [editingModule.default_spool_preset_id] : []);
    moduleWeight = editingModule.expected_weight ?? '';
    moduleTime = editingModule.expected_time ?? '';
    moduleObjects = editingModule.objects_per_print || 1;
    moduleInventorySlug = editingModule.inventory_slug || '';
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
  let printerModelId: number | string = '';
  let printerIp = '';
  let printerSerial = '';
  let printerAccessCode = '';

  function openEditPrinter(printer: any) {
    editingPrinter = printer;
    printerName = printer.name;
    printerModelId = printer.printer_model_id || '';
    printerIp = printer.printer_ip || '';
    printerSerial = printer.printer_serial || '';
    printerAccessCode = printer.printer_access_code || '';
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
  }

  // Printer Model editor
  let showPrinterModelEditor = false;
  let editingPrinterModel: any = null;
  let pmName = '';
  let pmDescription = '';
  let pmBuildX = '';
  let pmBuildY = '';
  let pmBuildZ = '';

  function openEditPrinterModel(model: any) {
    editingPrinterModel = model;
    pmName = model.name;
    pmDescription = model.description || '';
    pmBuildX = model.build_volume_x ?? '';
    pmBuildY = model.build_volume_y ?? '';
    pmBuildZ = model.build_volume_z ?? '';
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
  <div class="max-w-5xl mx-auto flex gap-8 items-start">

    <!-- ── Left nav ──────────────────────────────────────────────────── -->
    <nav class="hidden lg:flex flex-col w-32 shrink-0 sticky top-8 bg-black rounded-2xl p-4 gap-0.5">
      {#each [
        { id: 'printer-models', label: 'Printer Models' },
        { id: 'printers',       label: 'Printers' },
        { id: 'spool-presets',  label: 'Spool Presets' },
        { id: 'grid-presets',   label: 'Grid Presets' },
        { id: 'shopify',        label: 'Shopify' },
        { id: 'sku-mappings',   label: 'SKU Mappings' },
        { id: 'file-handler',   label: 'File Handler' },
      ] as section}
        <a
          href="#{section.id}"
          class="text-xs py-1 px-1 transition-colors leading-snug
            {activeSection === section.id
              ? 'text-white'
              : 'text-zinc-500 hover:text-zinc-200'}"
        >
          {section.label}
        </a>
      {/each}
      <a href="/modules" class="text-xs py-1 px-1 transition-colors leading-snug text-zinc-500 hover:text-zinc-200">
        Print Modules
      </a>
    </nav>

    <!-- ── Main content ──────────────────────────────────────────────── -->
    <div class="flex-1 min-w-0">

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

    <!-- ── Printer Models ────────────────────────────────────────────── -->
    <div id="printer-models" class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Printer Models</p>
        <button
          onclick={() => { editingPrinterModel = null; pmName = ''; pmDescription = ''; pmBuildX = ''; pmBuildY = ''; pmBuildZ = ''; showPrinterModelEditor = true; }}
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white text-zinc-900 hover:bg-zinc-100 transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          New Model
        </button>
      </div>
      {#if data.printerModels && data.printerModels.length > 0}
        <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a]">
          {#each data.printerModels as model}
            <div class="px-5 py-3.5 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-[#161616] transition-colors">
              <div class="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200">{model.name}</p>
                <p class="text-xs text-zinc-400">
                  {model.description || 'No description'}
                  {#if model.build_volume_x && model.build_volume_y && model.build_volume_z}
                    · {model.build_volume_x}x{model.build_volume_y}x{model.build_volume_z}mm
                  {/if}
                </p>
              </div>
              <div class="flex items-center gap-0.5">
                <button
                  onclick={() => openEditPrinterModel(model)}
                  class="flex items-center gap-1 px-2 py-1 rounded-md text-amber-50 hover:text-white hover:bg-white/10 transition-colors text-xs"
                  title="Edit"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                  Edit
                </button>
                <form method="POST" action="?/deletePrinterModel" use:enhance={() => {
                  return async ({ result, update }) => {
                    if (result.type === 'success' || result.type === 'redirect') {
                      await update();
                    } else if (result.type === 'failure') {
                      alert(result.data?.error || 'Failed to delete printer model');
                    }
                  };
                }}>
                  <input type="hidden" name="modelId" value={model.id} />
                  <button
                    type="submit"
                    class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-300 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs"
                    title="Delete"
                    onclick={(e) => { if (!confirm(`Delete model ${model.name}?`)) e.preventDefault(); }}
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
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
          <button
            onclick={() => { editingPrinterModel = null; pmName = ''; pmDescription = ''; pmBuildX = ''; pmBuildY = ''; pmBuildZ = ''; showPrinterModelEditor = true; }}
            class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors"
          >Add your first model (e.g., P1S, H2S)</button>
        </div>
      {/if}
    </div>

    <!-- ── Printers ──────────────────────────────────────────────────── -->
    <div id="printers" class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Printers</p>
        <button
          onclick={() => showPrinterEditor = true}
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white text-zinc-900 hover:bg-zinc-100 transition-colors"
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
                <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                  {printer.name}
                  {#if printer.printer_ip && printer.printer_serial && printer.printer_access_code}
                    <span class="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">Pi</span>
                  {/if}
                </p>
                <p class="text-xs text-zinc-400">{printer.printer_model_name || printer.model || 'No model'} · {printer.total_hours?.toFixed(1) || 0}h total</p>
              </div>
              <span class="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md {
                printer.status === 'printing' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' :
                printer.status === 'IDLE' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' :
                'bg-zinc-100 dark:bg-[#1a1a1a] text-zinc-400'
              }">{printer.status}</span>
              <div class="flex items-center gap-0.5">
                <button
                  onclick={() => openEditPrinter(printer)}
                  class="flex items-center gap-1 px-2 py-1 rounded-md text-amber-50 hover:text-white hover:bg-white/10 transition-colors text-xs"
                  title="Edit"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                  Edit
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
                    class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-300 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs"
                    title="Delete"
                    onclick={(e) => { if (!confirm(`Delete ${printer.name}?`)) e.preventDefault(); }}
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
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
          <button
            onclick={() => showPrinterEditor = true}
            class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors"
          >Add your first printer</button>
        </div>
      {/if}
    </div>

    <!-- ── Print Modules (managed at /modules) ──────────────────────── -->
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Print Modules</p>
        <span class="text-[10px] text-zinc-400">{data.printModules.length} module{data.printModules.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="px-5 py-5 flex items-center justify-between">
        <p class="text-sm text-zinc-500 dark:text-zinc-400">Upload .3mf files, browse and manage print modules.</p>
        <a
          href="/modules"
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
        >
          Open Modules
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </a>
      </div>
    </div>

    <!-- ── Spool Presets ─────────────────────────────────────────────── -->
    <div id="spool-presets" class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <details class="group">
        <summary class="px-5 py-4 flex items-center justify-between cursor-pointer list-none border-b border-zinc-50 dark:border-[#1a1a1a]">
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Spool Presets</p>
          <span class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white text-zinc-900 hover:bg-zinc-100 transition-colors">
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
              class="inline-flex items-center h-9 px-4 rounded-lg text-sm font-medium bg-white text-zinc-900 hover:bg-zinc-100 transition-colors">
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
              <div class="flex items-center gap-0.5 shrink-0">
                <button
                  onclick={() => { editingPreset = preset; showPresetEditor = true; }}
                  class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors text-xs"
                  title="Edit"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                  Edit
                </button>
                <form method="POST" action="?/deleteSpoolPreset" use:enhance={() => {
                  return async ({ result, update }) => {
                    if (result.type === 'success' || result.type === 'redirect') {
                      await update();
                    } else if (result.type === 'failure') {
                      alert(result.data?.error || 'Failed to delete preset');
                    }
                  };
                }}>
                  <input type="hidden" name="presetId" value={preset.id} />
                  <button
                    type="submit"
                    class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-300 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs"
                    title="Delete"
                    onclick={(e) => { if (!confirm(`Delete ${preset.name}?`)) e.preventDefault(); }}
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
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

    <!-- ── Dashboard Grid Presets ────────────────────────────────────── -->
    <div id="grid-presets" class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Dashboard Grid Presets</p>
        <button
          onclick={() => openGridEditor()}
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white text-zinc-900 hover:bg-zinc-100 transition-colors"
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
                    <span class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-white text-zinc-900">Default</span>
                  {/if}
                </div>
                <p class="text-xs text-zinc-400 mt-0.5">{presetRows}×{presetCols} grid</p>
              </div>
              <div class="flex items-center gap-0.5">
                <button
                  onclick={() => openGridEditor(preset)}
                  class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors text-xs"
                  title="Edit"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                  Edit
                </button>
                {#if !preset.is_default}
                  <form method="POST" action="?/setDefaultGridPreset" use:enhance>
                    <input type="hidden" name="presetId" value={preset.id}/>
                    <button type="submit"
                      class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-300 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors text-xs"
                      title="Set as default">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                      </svg>
                      Default
                    </button>
                  </form>
                {/if}
                <form method="POST" action="?/deleteGridPreset" use:enhance>
                  <input type="hidden" name="presetId" value={preset.id}/>
                  <button type="submit"
                    class="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-300 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs"
                    title="Delete">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
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
          <button onclick={() => openGridEditor()}
            class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors">
            Create your first preset
          </button>
        </div>
      {/if}
    </div>

    <!-- ── Shopify Integration ───────────────────────────────────────── -->
    <div id="shopify" class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
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
              class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white text-zinc-900 hover:bg-zinc-100 disabled:opacity-40 transition-colors">
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

    <!-- ── Shopify SKU Mappings ──────────────────────────────────────── -->
    <div id="sku-mappings" class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-6">
      <div class="px-5 py-4 flex items-center justify-between border-b border-zinc-50 dark:border-[#1a1a1a]">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Shopify SKU Mappings</p>
          <p class="text-xs text-zinc-400 mt-0.5">{Object.keys(groupedMappings).length} SKUs · {(data.skuMappings || []).length} mappings</p>
        </div>
        <button
          type="button"
          onclick={() => openSetEditor(null)}
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-[#1a1a1a] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-[#222] transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          New Set
        </button>
      </div>

      <div class="p-5">
        <!-- Set Editor -->
        {#if editingSetSku !== null}
          <form method="POST" action="?/saveSkuSet" use:enhance={() => {
            return async ({ update }) => {
              closeSetEditor();
              await update();
            };
          }}>
            <input type="hidden" name="originalSku" value={editingSetSku} />
            <input type="hidden" name="items" value={JSON.stringify(editingSetItems)} />
            <div class="mb-5 p-4 rounded-xl bg-zinc-50 dark:bg-[#161616] border border-zinc-100 dark:border-[#1e1e1e] space-y-4">
              <!-- SKU input -->
              <div>
                <label for="set-sku" class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 block mb-1.5">Shopify SKU</label>
                <input
                  id="set-sku"
                  type="text"
                  name="shopifySku"
                  bind:value={editingSetSkuInput}
                  placeholder="WH/K5/BL"
                  required
                  class="w-full max-w-xs h-9 px-3 rounded-lg text-sm bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#2a2a2a] text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 font-mono"
                />
              </div>

              <!-- Items in the set -->
              <div>
                <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 mb-2">Items in set</p>
                <div class="space-y-2">
                  {#each editingSetItems as item, i}
                    <div class="grid gap-2" style="grid-template-columns: 90px 1fr 56px 32px;">
                      <!-- Source type toggle -->
                      <select
                        bind:value={item.source_type}
                        onchange={() => { item.inventory_slug = ''; item.spool_preset_id = null; }}
                        class="h-9 px-2 rounded-lg text-xs bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#2a2a2a] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
                      >
                        <option value="inventory">Inventory</option>
                        <option value="storage">Storage</option>
                      </select>

                      <!-- Item selector -->
                      {#if item.source_type === 'inventory'}
                        <select
                          bind:value={item.inventory_slug}
                          required
                          class="h-9 px-3 rounded-lg text-sm bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#2a2a2a] text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 min-w-0"
                        >
                          <option value="">Select item...</option>
                          {#each data.inventoryItems || [] as inv}
                            <option value={inv.slug}>{inv.name}</option>
                          {/each}
                        </select>
                      {:else}
                        <select
                          bind:value={item.spool_preset_id}
                          required
                          class="h-9 px-3 rounded-lg text-sm bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#2a2a2a] text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 min-w-0"
                        >
                          <option value={null}>Select preset...</option>
                          {#each data.spoolPresets || [] as preset}
                            <option value={preset.id}>{preset.name} — {preset.brand} {preset.material}{preset.color ? ` (${preset.color})` : ''}</option>
                          {/each}
                        </select>
                      {/if}

                      <!-- Quantity -->
                      <input
                        type="number"
                        bind:value={item.quantity}
                        min="1"
                        class="h-9 px-2 rounded-lg text-sm text-center bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#2a2a2a] text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 tabular-nums"
                      />

                      <!-- Remove item -->
                      <button type="button" aria-label="Remove item" onclick={() => removeSetItem(i)}
                        class="h-9 flex items-center justify-center rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        disabled={editingSetItems.length <= 1}
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>

                <div class="mt-2 flex items-center gap-3">
                  <button type="button" onclick={addSetItem}
                    class="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                    </svg>
                    Add item
                  </button>
                  <button type="button" onclick={() => { showNewInventoryItem = !showNewInventoryItem; newInvName = ''; newInvSlug = ''; }}
                    class="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                    </svg>
                    New inventory item
                  </button>
                </div>

                {#if showNewInventoryItem}
                  <div class="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 space-y-2">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-500 dark:text-blue-400">Create Inventory Item</p>
                    <div class="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        bind:value={newInvName}
                        oninput={() => { newInvSlug = slugify(newInvName); }}
                        placeholder="Item name"
                        class="h-8 px-3 rounded-lg text-sm bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#2a2a2a] text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:focus:ring-blue-600"
                      />
                      <input
                        type="text"
                        bind:value={newInvSlug}
                        placeholder="slug (auto-generated)"
                        class="h-8 px-3 rounded-lg text-sm bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#2a2a2a] text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:focus:ring-blue-600 font-mono"
                      />
                    </div>
                    <div class="flex gap-2">
                      <button type="button" onclick={createNewInventoryItem} disabled={creatingInventoryItem || !newInvName.trim() || !newInvSlug.trim()}
                        class="h-7 px-3 rounded-md text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {creatingInventoryItem ? 'Creating...' : 'Create'}
                      </button>
                      <button type="button" onclick={() => { showNewInventoryItem = false; }}
                        class="h-7 px-3 rounded-md text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-[#1a1a1a] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                {/if}
              </div>

              <!-- Actions -->
              <div class="flex gap-2 pt-1 border-t border-zinc-100 dark:border-[#1e1e1e]">
                <button type="submit" class="h-9 px-4 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors">
                  {editingSetSku ? 'Save Set' : 'Create Set'}
                </button>
                <button type="button" onclick={closeSetEditor}
                  class="h-9 px-3 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-[#1a1a1a] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </form>
        {/if}

        <!-- Search -->
        <div class="mb-4">
          <input
            type="text"
            bind:value={skuSearch}
            placeholder="Search SKUs or items..."
            class="w-full h-9 px-3 rounded-lg text-sm bg-zinc-50 dark:bg-[#161616] border border-zinc-100 dark:border-[#1e1e1e] text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
          />
        </div>

        <!-- Grouped by SKU — scrollable, max 5 visible -->
        {#if Object.keys(groupedMappings).length > 0}
          <div class="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {#each Object.entries(groupedMappings) as [sku, mappings]}
              <div class="rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden">
                <div class="px-4 py-2.5 bg-zinc-50 dark:bg-[#161616] flex items-center justify-between">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-sm font-mono font-medium text-zinc-700 dark:text-zinc-300">{sku}</span>
                    <span class="text-xs text-zinc-400">{mappings.length} item{mappings.length > 1 ? 's' : ''}</span>
                  </div>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onclick={() => openSetEditor(sku)}
                      class="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1a1a1a] transition-colors"
                      title="Edit set"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z"/>
                      </svg>
                    </button>
                    <form method="POST" action="?/deleteSkuSet" use:enhance class="inline">
                      <input type="hidden" name="shopifySku" value={sku} />
                      <button type="submit" class="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete set">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
                        </svg>
                      </button>
                    </form>
                  </div>
                </div>
                <div class="px-4 py-2 flex flex-wrap gap-2">
                  {#each mappings as mapping}
                    <span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e]">
                      <span class="text-zinc-500 tabular-nums font-medium">{mapping.quantity}x</span>
                      {#if mapping.source_type === 'storage'}
                        <span class="text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">spool</span>
                      {/if}
                      <span class="text-zinc-700 dark:text-zinc-300">{getItemLabel(mapping)}</span>
                    </span>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-zinc-400 text-center py-6">{skuSearch ? 'No matches found' : 'No SKU mappings configured'}</p>
        {/if}
      </div>
    </div>

    <!-- ── Local File Handler ────────────────────────────────────────── -->
    <div id="file-handler" class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-10">
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
            class="flex-1 h-9 rounded-lg text-sm font-medium bg-white text-zinc-900 hover:bg-zinc-100 transition-colors">
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

    </div><!-- end main content -->
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
            class="h-9 px-4 rounded-lg text-sm font-medium bg-white text-zinc-900 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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
            <label for="printerModelSelect" class="block text-sm text-zinc-500 mb-2">Printer Model</label>
            <select
              id="printerModelSelect"
              name="printerModelId"
              bind:value={printerModelId}
              class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
            >
              <option value="">No model</option>
              {#each data.printerModels || [] as model}
                <option value={model.id}>{model.name}{model.description ? ` — ${model.description}` : ''}</option>
              {/each}
            </select>
            <p class="text-xs text-zinc-500 mt-1">Assign a printer model preset. Manage models in the section above.</p>
          </div>

          <!-- Pi Bridge credentials -->
          <div class="border border-zinc-200 dark:border-[#262626] rounded-lg overflow-hidden">
            <div class="px-3 py-2 bg-zinc-50 dark:bg-[#1a1a1a] border-b border-zinc-200 dark:border-[#262626]">
              <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Pi Bridge — Bambu Lab LAN credentials</p>
              <p class="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">Required for Pi-initiated prints. Found on the printer touchscreen under Settings → Network.</p>
            </div>
            <div class="p-3 space-y-3">
              <div>
                <label for="printer-ip" class="block text-xs text-zinc-500 mb-1">Printer IP</label>
                <input
                  id="printer-ip"
                  type="text"
                  name="printerIp"
                  bind:value={printerIp}
                  placeholder="192.168.1.50"
                  class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
                />
              </div>
              <div>
                <label for="printer-serial" class="block text-xs text-zinc-500 mb-1">Serial Number</label>
                <input
                  id="printer-serial"
                  type="text"
                  name="printerSerial"
                  bind:value={printerSerial}
                  placeholder="01P00A..."
                  class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
                />
              </div>
              <div>
                <label for="printer-access-code" class="block text-xs text-zinc-500 mb-1">Access Code</label>
                <input
                  id="printer-access-code"
                  type="password"
                  name="printerAccessCode"
                  bind:value={printerAccessCode}
                  placeholder="8-digit code"
                  class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-colors"
                />
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
            class="bg-white hover:bg-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed text-zinc-900 font-medium px-6 py-2.5 rounded-md transition-colors"
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
      class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog" aria-modal="true" tabindex="-1"
    >
      <div class="px-6 py-4 border-b border-zinc-50 dark:border-[#1a1a1a] flex justify-between items-center sticky top-0 bg-white dark:bg-[#111] z-10">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">{editingModule ? 'Edit Module' : 'New Module'}</p>
          <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-0.5">{editingModule ? editingModule.name : 'Add a print module'}</p>
        </div>
        <button
          onclick={() => { showModuleEditor = false; editingModule = null; }}
          class="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors"
          aria-label="Close"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
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
          <label for="editModuleName" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Module Name</label>
          <input id="editModuleName" type="text" name="name" bind:value={moduleName} required
            class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
        </div>

        <!-- printer model -->
        <div>
          <label for="editPrinterModel" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Printer Model</label>
          <select id="editPrinterModel" name="printerModelId" bind:value={moduleModelId}
            class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors">
            <option value="">Any printer</option>
            {#each data.printerModels || [] as model}
              <option value={model.id}>{model.name}{model.description ? ` — ${model.description}` : ''}</option>
            {/each}
          </select>
          <p class="text-xs text-zinc-400 mt-1">Restrict this module to a specific printer model</p>
        </div>

        <!-- inventory item -->
        <div>
          <label for="editInventorySlug" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Inventory Item <span class="font-normal text-zinc-400">(optional)</span></label>
          <select id="editInventorySlug" name="inventorySlug" bind:value={moduleInventorySlug}
            class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors">
            <option value="">No inventory tracking</option>
            {#each data.inventoryItems || [] as item}
              <option value={item.slug}>{item.name} ({item.slug})</option>
            {/each}
          </select>
          <p class="text-xs text-zinc-400 mt-1">Auto-update inventory when print completes</p>
        </div>

        <!-- path -->
        <div>
          <label for="editModulePath" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Local File Handler Path</label>
          <input id="editModulePath" type="text" name="localFileHandlerPath" bind:value={modulePath}
            class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 font-mono focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          <p class="text-xs text-zinc-400 mt-1">Absolute path used by the local file handler to open in Bambu Studio</p>
        </div>

        <!-- image selector -->
        <div>
          <label for="editImagePath" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Module Image <span class="font-normal text-zinc-400">(optional)</span></label>
          <select id="editImagePath" name="imagePath" bind:value={moduleImage}
            onchange={(e) => updateImagePreview(e.currentTarget.value)}
            class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors">
            <option value="">No image</option>
            {#if data.availableImages && data.availableImages.length > 0}
              {#each data.availableImages as img}
                <option value={img}>{img}</option>
              {/each}
            {:else}
              <option value="" disabled>No images available</option>
            {/if}
          </select>
          {#if imagePreviewUrl}
            <div class="mt-2 w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 dark:bg-[#1a1a1a]">
              <img src={imagePreviewUrl} alt="Preview" class="w-full h-full object-cover"
                onerror={(e) => e.currentTarget.style.display = 'none'}/>
            </div>
          {/if}
        </div>

        <!-- spool presets — multi-select via pill toggles -->
        <div>
          <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Spool Presets <span class="font-normal text-zinc-400">(optional — leave empty for any)</span></p>
          {#if data.spoolPresets && data.spoolPresets.length > 0}
            <div class="flex flex-wrap gap-1.5">
              {#each data.spoolPresets as preset}
                <button
                  type="button"
                  onclick={() => {
                    if (modulePresetIds.includes(preset.id)) {
                      modulePresetIds = modulePresetIds.filter(id => id !== preset.id);
                    } else {
                      modulePresetIds = [...modulePresetIds, preset.id];
                    }
                  }}
                  class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors {modulePresetIds.includes(preset.id) ? 'bg-white text-zinc-900 hover:bg-zinc-100' : 'bg-zinc-100 dark:bg-[#1e1e1e] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-[#262626]'}"
                >
                  {preset.name}
                </button>
              {/each}
            </div>
            <!-- hidden inputs for form submission -->
            {#each modulePresetIds as id}
              <input type="hidden" name="spoolPresetIds" value={id} />
            {/each}
          {:else}
            <p class="text-xs text-zinc-400 py-2">No spool presets yet — create some first.</p>
          {/if}
        </div>

        <!-- weight/time/objects -->
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label for="editExpectedWeight" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Weight (g)</label>
            <input id="editExpectedWeight" type="number" name="expectedWeight" bind:value={moduleWeight} required min="0" step="0.1"
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
          <div>
            <label for="editExpectedTime" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Time (min)</label>
            <input id="editExpectedTime" type="number" name="expectedTime" bind:value={moduleTime} required min="0"
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
          <div>
            <label for="editObjectsPerPrint" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Objects ×</label>
            <input id="editObjectsPerPrint" type="number" name="objectsPerPrint" bind:value={moduleObjects} required min="1"
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
        </div>

        <div class="pt-2 flex justify-end gap-2">
          <button type="button" onclick={() => { showModuleEditor = false; editingModule = null; }}
            class="h-9 px-4 rounded-lg text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
            Cancel
          </button>
          <button type="submit"
            class="h-9 px-4 rounded-lg text-sm font-medium bg-white text-zinc-900 hover:bg-zinc-100 transition-colors">
            {editingModule ? 'Save Changes' : 'Add Module'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showPresetEditor && editingPreset}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={() => { showPresetEditor = false; editingPreset = null; }}
      onkeydown={(e) => e.key === 'Escape' && (showPresetEditor = false)}
      role="button" tabindex="-1"></div>
    <div class="relative w-full max-w-lg bg-white dark:bg-[#111] rounded-2xl border border-zinc-200 dark:border-[#1e1e1e] shadow-2xl overflow-hidden">
      <div class="px-6 py-5 border-b border-zinc-100 dark:border-[#1a1a1a]">
        <h2 class="text-xl font-medium text-zinc-900 dark:text-zinc-50">Edit Spool Preset</h2>
        <p class="text-sm text-zinc-500 mt-0.5">Editing {editingPreset.name}</p>
      </div>
      <form method="POST" action="?/updateSpoolPreset"
        use:enhance={() => {
          return async ({ result, update }) => {
            if (result.type === 'success' || result.type === 'redirect') {
              showPresetEditor = false;
              editingPreset = null;
              await update();
            }
          };
        }}
        class="px-6 py-5 space-y-4">
        <input type="hidden" name="presetId" value={editingPreset.id} />
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <label for="editPresetName" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Name</label>
            <input type="text" id="editPresetName" name="name" required value={editingPreset.name}
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
          <div>
            <label for="editPresetBrand" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Brand</label>
            <input type="text" id="editPresetBrand" name="brand" required value={editingPreset.brand}
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
          <div>
            <label for="editPresetMaterial" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Material</label>
            <input type="text" id="editPresetMaterial" name="material" required value={editingPreset.material}
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
          <div>
            <label for="editPresetColor" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Color</label>
            <input type="text" id="editPresetColor" name="color" value={editingPreset.color || ''}
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
          <div>
            <label for="editPresetWeight" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Weight (g)</label>
            <input type="number" id="editPresetWeight" name="defaultWeight" required min="0" value={editingPreset.default_weight}
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
          <div>
            <label for="editPresetCost" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Cost (€)</label>
            <input type="number" id="editPresetCost" name="cost" min="0" step="0.01" value={editingPreset.cost || ''}
              class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" onclick={() => { showPresetEditor = false; editingPreset = null; }}
            class="h-9 px-4 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
            Cancel
          </button>
          <button type="submit"
            class="h-9 px-4 rounded-lg text-sm font-medium bg-white text-zinc-900 hover:bg-zinc-100 transition-colors">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Printer Model editor modal -->
{#if showPrinterModelEditor}
  <div
    class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
    onclick={() => closePrinterModelEditor()}
    onkeydown={(e) => e.key === 'Escape' && closePrinterModelEditor()}
    role="button" tabindex="0" aria-label="Close printer model editor"
  >
    <div
      class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog" aria-modal="true" tabindex="-1"
    >
      <div class="px-6 py-4 border-b border-zinc-50 dark:border-[#1a1a1a] flex justify-between items-center">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">{editingPrinterModel ? 'Edit Model' : 'New Model'}</p>
          <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-0.5">{editingPrinterModel ? editingPrinterModel.name : 'Add a printer model preset'}</p>
        </div>
        <button
          onclick={closePrinterModelEditor}
          class="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] transition-colors"
          aria-label="Close"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <form
        method="POST"
        action={editingPrinterModel ? '?/updatePrinterModel' : '?/addPrinterModel'}
        class="p-6 space-y-4"
        use:enhance={() => {
          return async ({ result, update }) => {
            if (result.type === 'success') {
              closePrinterModelEditor();
            }
            await update();
          };
        }}
      >
        {#if editingPrinterModel}
          <input type="hidden" name="modelId" value={editingPrinterModel.id} />
        {/if}

        <div>
          <label for="pmName" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Model Name *</label>
          <input id="pmName" type="text" name="name" bind:value={pmName} required
            placeholder="e.g., P1S, H2S, X1 Carbon"
            class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
        </div>

        <div>
          <label for="pmDescription" class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Description</label>
          <input id="pmDescription" type="text" name="description" bind:value={pmDescription}
            placeholder="e.g., Bambu Lab P1S, Hevort 2S"
            class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"/>
        </div>

        <div>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">Build Volume (mm)</label>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <input type="number" name="buildVolumeX" bind:value={pmBuildX} placeholder="X" step="0.1"
                class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"/>
              <p class="text-[10px] text-zinc-400 mt-0.5 text-center">X</p>
            </div>
            <div>
              <input type="number" name="buildVolumeY" bind:value={pmBuildY} placeholder="Y" step="0.1"
                class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"/>
              <p class="text-[10px] text-zinc-400 mt-0.5 text-center">Y</p>
            </div>
            <div>
              <input type="number" name="buildVolumeZ" bind:value={pmBuildZ} placeholder="Z" step="0.1"
                class="w-full bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"/>
              <p class="text-[10px] text-zinc-400 mt-0.5 text-center">Z</p>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onclick={closePrinterModelEditor}
            class="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >Cancel</button>
          <button
            type="submit"
            disabled={!pmName.trim()}
            class="bg-white hover:bg-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed text-zinc-900 font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >{editingPrinterModel ? 'Save Changes' : 'Add Model'}</button>
        </div>
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

</style>
