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

<div class="min-h-screen bg-black text-white p-6">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-center mb-8">
      <div>
        <h1 class="text-3xl font-light tracking-wide mb-2">Settings</h1>
        <p class="text-slate-400 text-sm">Manage print modules and spool presets</p>
      </div>
      <button 
        onclick={() => goto('/')}
        class="text-slate-400 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Dashboard
      </button>
    </div>

    <!-- Messages -->
    {#if form?.success}
      <div class="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
        <svg class="w-5 h-5 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
        <p class="text-green-400">{form.message || 'Action completed successfully'}</p>
      </div>
    {/if}

    {#if form?.error}
      <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
        <svg class="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>
        <p class="text-red-400">{form.error}</p>
      </div>
    {/if}

    <!-- File Handler Configuration -->
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
        <h2 class="text-xl font-medium flex items-center gap-2">
          <span class="text-2xl">🔧</span>
          Local File Handler Configuration
        </h2>
        <p class="text-sm text-slate-500 mt-1">Configure automatic file opening on print start</p>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="fileHandlerToken" class="block text-sm text-slate-400 mb-2">
            Auth Token
            <span class="text-slate-600">(from local-file-handler/.env)</span>
          </label>
          <input 
            type="text" 
            id="fileHandlerToken"
            bind:value={fileHandlerToken}
            placeholder="Paste your AUTH_TOKEN here"
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
          />
          <p class="text-xs text-slate-500 mt-2">
            💡 This token is stored locally in your browser and never sent to the server.
          </p>
          <p class="text-xs text-slate-600 mt-1">
            Find your token in: <code class="text-blue-400">local-file-handler/.env</code>
          </p>
        </div>
        
        <div class="flex gap-3">
          <button 
            onclick={saveFileHandlerToken}
            class="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 rounded-lg transition-colors"
          >
            Save Token
          </button>
          <button 
            onclick={testConnection}
            disabled={testingConnection || !fileHandlerToken}
            class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-lg transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if testingConnection}
              Testing...
            {:else}
              Test Connection
            {/if}
          </button>
        </div>
        
        {#if connectionStatus === 'success'}
          <div class="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-2">
            <svg class="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <span class="text-green-400 text-sm">✅ Connection successful! File handler is online.</span>
          </div>
        {:else if connectionStatus === 'failed'}
          <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
            <svg class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
            </svg>
            <div class="text-sm">
              <p class="text-red-400 font-medium">❌ Connection failed</p>
              <p class="text-slate-500 mt-1">Make sure the file handler is running:</p>
              <code class="text-xs bg-slate-800 px-2 py-1 rounded mt-1 inline-block text-blue-400">
                cd local-file-handler && bun run start
              </code>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Grid Presets Section - Full Width -->
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
        <div>
          <h2 class="text-xl font-medium flex items-center gap-2">
            <span class="text-2xl">🎛️</span>
            Dashboard Grid Presets
          </h2>
          <p class="text-sm text-slate-500 mt-1">Configure your dashboard layouts with custom dimensions</p>
        </div>
        <button 
          onclick={() => openGridEditor()}
          class="bg-blue-500 hover:bg-blue-600 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          New Grid Preset
        </button>
      </div>
      
      <div class="p-6">
        {#if data.gridPresets && data.gridPresets.length > 0}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each data.gridPresets as preset}
              {@const gridConfig = parseGridConfig(preset.grid_config)}
              {@const presetRows = preset.rows || 3}
              {@const presetCols = preset.cols || 3}
              <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 {preset.is_default ? 'ring-2 ring-blue-500' : ''}">
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h3 class="text-white font-medium flex items-center gap-2">
                      {preset.name}
                      {#if preset.is_default}
                        <span class="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Default</span>
                      {/if}
                    </h3>
                    <p class="text-xs text-slate-500 mt-1">{presetRows}×{presetCols} grid</p>
                  </div>
                  <div class="flex gap-1">
                    <!-- Edit Button -->
                    <button 
                      onclick={() => openGridEditor(preset)}
                      class="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
                      title="Edit preset"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    {#if !preset.is_default}
                      <form method="POST" action="?/setDefaultGridPreset" use:enhance>
                        <input type="hidden" name="presetId" value={preset.id} />
                        <button 
                          type="submit"
                          class="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
                          title="Set as default"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      </form>
                    {/if}
                    <form method="POST" action="?/deleteGridPreset" use:enhance>
                      <input type="hidden" name="presetId" value={preset.id} />
                      <button 
                        type="submit"
                        class="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                        title="Delete preset"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </form>
                  </div>
                </div>
                
                <!-- Mini Grid Preview (dynamic based on rows/cols) -->
                <div class="grid gap-1" style="grid-template-columns: repeat({presetCols}, minmax(0, 1fr));">
                  {#each gridConfig as cell, i}
                    <div class="aspect-square rounded flex items-center justify-center text-xs
                      {cell.type === 'printer' ? 'bg-blue-500/30 text-blue-300' : ''}
                      {cell.type === 'stats' ? 'bg-green-500/30 text-green-300' : ''}
                      {cell.type === 'settings' ? 'bg-purple-500/30 text-purple-300' : ''}
                      {cell.type === 'spools' ? 'bg-orange-500/30 text-orange-300' : ''}
                      {cell.type === 'storage' ? 'bg-amber-500/30 text-amber-300' : ''}
                      {cell.type === 'empty' ? 'bg-slate-700/30 text-slate-500' : ''}
                    ">
                      {#if cell.type === 'printer'}
                        🖨️
                      {:else if cell.type === 'stats'}
                        📊
                      {:else if cell.type === 'settings'}
                        ⚙️
                      {:else if cell.type === 'spools'}
                        🎨
                      {:else if cell.type === 'storage'}
                        📦
                      {:else}
                        ∅
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-8">
            <p class="text-slate-500 mb-4">No grid presets yet. Create your first one!</p>
            <button 
              onclick={() => openGridEditor()}
              class="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Create Grid Preset
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Printer Management Section - Full Width -->
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
        <div>
          <h2 class="text-xl font-medium flex items-center gap-2">
            <span class="text-2xl">🖨️</span>
            Printer Management
          </h2>
          <p class="text-sm text-slate-500 mt-1">Add, edit, and manage your 3D printers</p>
        </div>
        <button 
          onclick={() => showPrinterEditor = true}
          class="bg-blue-500 hover:bg-blue-600 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Printer
        </button>
      </div>
      
      <div class="p-6">
        {#if data.printers && data.printers.length > 0}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {#each data.printers as printer}
              <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors">
                <div class="flex justify-between items-start mb-3">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <span class="text-xl">🖨️</span>
                    </div>
                    <div>
                      <h3 class="text-white font-medium">{printer.name}</h3>
                      <p class="text-xs text-slate-500">{printer.model || 'No model specified'}</p>
                    </div>
                  </div>
                </div>
                
                <div class="flex items-center justify-between text-sm">
                  <div class="flex items-center gap-2">
                    <span class="text-slate-400">ID:</span>
                    <span class="text-blue-400 font-mono">#{printer.id}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded text-xs {
                      printer.status === 'printing' ? 'bg-blue-500/20 text-blue-400' :
                      printer.status === 'IDLE' ? 'bg-green-500/20 text-green-400' :
                      'bg-slate-500/20 text-slate-400'
                    }">
                      {printer.status}
                    </span>
                  </div>
                </div>
                
                <div class="mt-3 pt-3 border-t border-slate-700 flex justify-between items-center">
                  <span class="text-xs text-slate-500">{printer.total_hours?.toFixed(1) || 0}h total</span>
                  <div class="flex gap-1">
                    <button 
                      onclick={() => openEditPrinter(printer)}
                      class="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
                      title="Edit printer"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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
                        class="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                        title="Delete printer"
                        onclick={(e) => {
                          if (!confirm(`Delete ${printer.name}? This cannot be undone.`)) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-8">
            <p class="text-slate-500 mb-4">No printers yet. Add your first printer!</p>
            <button 
              onclick={() => showPrinterEditor = true}
              class="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Add Printer
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Rest of settings page - Print Modules and Spool Presets -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      <!-- Print Modules Section -->
      <div class="space-y-6">
        <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
            <h2 class="text-xl font-medium">Print Modules</h2>
            <p class="text-sm text-slate-500 mt-1">Define your print configurations</p>
          </div>
          
          <!-- Add Module Form -->
          <form method="POST" action="?/addModule" class="p-6 space-y-4">
            <div>
              <label for="moduleName" class="block text-sm text-slate-400 mb-2">Module Name</label>
              <input 
                type="text" 
                id="moduleName"
                name="name"
                required
                placeholder="e.g., Small Gear Print"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            
            <div>
              <label for="modulePath" class="block text-sm text-slate-400 mb-2">File Path</label>
              <input 
                type="text" 
                id="modulePath"
                name="path"
                required
                placeholder="/Users/username/Documents/3d-models/file.3mf"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
              />
              <p class="text-xs text-slate-600 mt-1">Must be an absolute path</p>
            </div>

            <!-- ✅ UPDATED: Dropdown Image Selector -->
            <div>
              <label for="imagePath" class="block text-sm text-slate-400 mb-2">
                Module Image (Optional)
              </label>
              <select 
                id="imagePath"
                name="imagePath"
                bind:value={selectedImagePath}
                onchange={(e) => updateImagePreview(e.currentTarget.value)}
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="">No image</option>
                {#if data.availableImages && data.availableImages.length > 0}
                  {#each data.availableImages as imageName}
                    <option value={imageName}>{imageName}</option>
                  {/each}
                {:else}
                  <option value="" disabled>No images available</option>
                {/if}
              </select>
              <p class="text-xs text-slate-600 mt-1">
                📁 Images are loaded from: <code class="text-blue-400">static/images/</code>
              </p>
              <p class="text-xs text-slate-600 mt-0.5">
                💡 To add more images, place them in the static/images/ folder and restart the server
              </p>
              
              <!-- ✅ Image Preview -->
              {#if imagePreviewUrl}
                <div class="mt-3 p-3 bg-slate-800/50 rounded-lg">
                  <p class="text-xs text-slate-400 mb-2">Preview:</p>
                  <div class="w-32 h-32 rounded-lg overflow-hidden bg-slate-700/50 flex items-center justify-center">
                    <img 
                      src={imagePreviewUrl} 
                      alt="Preview"
                      class="max-w-full max-h-full object-contain"
                      onerror={(e) => {
                        e.currentTarget.style.display = 'none';
                        const errorDiv = e.currentTarget.nextElementSibling as HTMLElement;
                        if (errorDiv) errorDiv.style.display = 'block';
                      }}
                    />
                    <div style="display: none;" class="text-red-400 text-xs text-center px-4">
                      ❌ Image not found
                      <p class="text-slate-600 mt-1">Make sure the file exists in static/images/</p>
                    </div>
                  </div>
                </div>
              {/if}
            </div>

            <div>
              <label for="defaultSpoolPresetId" class="block text-sm text-slate-400 mb-2">
                Preferred Spool Preset (Optional)
              </label>
              <select 
                id="defaultSpoolPresetId"
                name="defaultSpoolPresetId"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="">Any spool (no preference)</option>
                {#if data.spoolPresets && data.spoolPresets.length > 0}
                  {#each data.spoolPresets as preset}
                    <option value={preset.id}>
                      {preset.name} ({preset.brand} {preset.material})
                    </option>
                  {/each}
                {:else}
                  <option value="" disabled>No presets available - create one first</option>
                {/if}
              </select>
              <p class="text-xs text-slate-600 mt-1">
                This module will only appear when a matching spool is loaded
              </p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="expectedWeight" class="block text-sm text-slate-400 mb-2">Weight (g)</label>
                <input 
                  type="number" 
                  id="expectedWeight"
                  name="expectedWeight"
                  required
                  min="0"
                  step="0.1"
                  placeholder="25"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label for="expectedTime" class="block text-sm text-slate-400 mb-2">Time (min)</label>
                <input 
                  type="number" 
                  id="expectedTime"
                  name="expectedTime"
                  required
                  min="0"
                  placeholder="120"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label for="objectsPerPrint" class="block text-sm text-slate-400 mb-2">Objects Per Print</label>
              <input 
                type="number" 
                id="objectsPerPrint"
                name="objectsPerPrint"
                required
                min="1"
                value="1"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <button 
              type="submit"
              class="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-3 rounded-lg transition-colors"
            >
              Add Module
            </button>
          </form>
        </div>

        <!-- Modules List -->
        {#if data.printModules && data.printModules.length > 0}
          <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
              <h3 class="text-lg font-medium">Existing Modules ({data.printModules.length})</h3>
            </div>
            <div class="divide-y divide-slate-800">
              {#each data.printModules as module}
                {@const linkedPreset = data.spoolPresets.find(p => p.id === module.default_spool_preset_id)}
                <div class="p-4 hover:bg-slate-800/30 transition-colors">
                  <div class="flex gap-4">
                    <!-- ✅ NEW: Show module image if available -->
                    {#if module.image_path}
                      <div class="w-20 h-20 rounded-lg overflow-hidden bg-slate-700/50 flex-shrink-0 flex items-center justify-center">
                        <img 
                          src={module.image_path} 
                          alt={module.name}
                          class="max-w-full max-h-full object-contain"
                          onerror={(e) => e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'} 
                        />
                      </div>
                    {:else}
                      <div class="w-20 h-20 rounded-lg overflow-hidden bg-slate-700/50 flex-shrink-0 flex items-center justify-center">
                        <span class="text-3xl opacity-50">📦</span>
                      </div>
                    {/if}

                    <div class="flex-1">
                      <div class="flex justify-between items-start mb-2">
                        <h4 class="text-white font-medium">{module.name}</h4>
                        <form method="POST" action="?/deleteModule">
                          <input type="hidden" name="moduleId" value={module.id} />
                          <button 
                            type="submit"
                            class="text-red-400 hover:text-red-300 text-sm"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                      <div class="space-y-1 text-sm">
                        <p class="text-slate-400 font-mono text-xs truncate">{module.path}</p>
                        {#if module.image_path}
                          <p class="text-slate-600 font-mono text-xs truncate">🖼️ {module.image_path}</p>
                        {/if}
                        {#if linkedPreset}
                          <p class="text-blue-400 text-xs">
                            🎯 Preset: {linkedPreset.name}
                          </p>
                        {:else}
                          <p class="text-slate-600 text-xs">
                            ✨ Any spool
                          </p>
                        {/if}
                        <div class="flex gap-4 text-slate-500">
                          <span>{module.expected_weight}g</span>
                          <span>{module.expected_time}min</span>
                          <span>{module.objects_per_print} objects</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Spool Presets Section -->
      <div class="space-y-6">
        <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
            <h2 class="text-xl font-medium">Spool Presets</h2>
            <p class="text-sm text-slate-500 mt-1">Create reusable spool configurations</p>
          </div>
          
          <!-- Add Preset Form -->
          <form method="POST" action="?/addSpoolPreset" class="p-6 space-y-4">
            <div>
              <label for="presetName" class="block text-sm text-slate-400 mb-2">Preset Name</label>
              <input 
                type="text" 
                id="presetName"
                name="name"
                required
                placeholder="e.g., Bambu PLA Basic Black"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="brand" class="block text-sm text-slate-400 mb-2">Brand</label>
                <input 
                  type="text" 
                  id="brand"
                  name="brand"
                  required
                  placeholder="Bambu Lab"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label for="material" class="block text-sm text-slate-400 mb-2">Material</label>
                <input 
                  type="text" 
                  id="material"
                  name="material"
                  required
                  placeholder="PLA"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="color" class="block text-sm text-slate-400 mb-2">Color</label>
                <input 
                  type="text" 
                  id="color"
                  name="color"
                  placeholder="Black"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label for="defaultWeight" class="block text-sm text-slate-400 mb-2">Weight (g)</label>
                <input 
                  type="number" 
                  id="defaultWeight"
                  name="defaultWeight"
                  required
                  min="0"
                  value="1000"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label for="cost" class="block text-sm text-slate-400 mb-2">Cost ($)</label>
              <input 
                type="number" 
                id="cost"
                name="cost"
                min="0"
                step="0.01"
                placeholder="20.00"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <button 
              type="submit"
              class="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-3 rounded-lg transition-colors"
            >
              Add Spool Preset
            </button>
          </form>
        </div>

        <!-- Presets List -->
        {#if data.spoolPresets && data.spoolPresets.length > 0}
          <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
              <h3 class="text-lg font-medium">Existing Presets ({data.spoolPresets.length})</h3>
            </div>
            <div class="divide-y divide-slate-800">
              {#each data.spoolPresets as preset}
                <div class="p-4 hover:bg-slate-800/30 transition-colors">
                  <div class="flex justify-between items-start">
                    <div>
                      <h4 class="text-white font-medium mb-1">{preset.name}</h4>
                      <p class="text-sm text-slate-400">{preset.brand} • {preset.material}</p>
                      {#if preset.color}
                        <p class="text-xs text-slate-500 mt-1">{preset.color}</p>
                      {/if}
                      <div class="flex gap-4 mt-2 text-sm">
                        <span class="text-slate-500">{preset.default_weight}g</span>
                        {#if preset.cost}
                          <span class="text-green-400">${preset.cost.toFixed(2)}</span>
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

    </div>
  </div>
</div>

<!-- Grid Editor Modal -->
{#if showGridEditor}
  <div
    class="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-6"
    onclick={closeGridEditor}
    onkeydown={(e) => e.key === 'Escape' && closeGridEditor()}
    role="button"
    tabindex="0"
    aria-label="Close grid editor"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div 
      class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h2 class="text-xl font-medium">{editingGridId ? 'Edit Grid Preset' : 'Create Grid Preset'}</h2>
          <p class="text-sm text-slate-500 mt-1">Configure your dashboard layout with custom dimensions</p>
        </div>
        <button 
          onclick={closeGridEditor}
          class="text-slate-400 hover:text-white transition-colors p-2"
          aria-label="Close"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form method="POST" action={editingGridId ? '?/updateGridPreset' : '?/addGridPreset'} use:enhance={() => {
        return async ({ result, update }) => {
          if (result.type === 'success') {
            closeGridEditor();
          }
          await update();
        };
      }}>
        <div class="p-6 space-y-6">
          <!-- Hidden ID for updates -->
          {#if editingGridId}
            <input type="hidden" name="presetId" value={editingGridId} />
          {/if}

          <!-- Preset Name -->
          <div>
            <label for="gridPresetName" class="block text-sm text-slate-400 mb-2">Preset Name</label>
            <input 
              type="text" 
              id="gridPresetName"
              name="name"
              bind:value={gridPresetName}
              required
              placeholder="e.g., Main Dashboard, Large Grid, Secondary View"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <!-- Grid Dimensions -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="gridRows" class="block text-sm text-slate-400 mb-2">Rows</label>
              <input 
                type="number" 
                id="gridRows"
                name="rows"
                bind:value={gridRows}
                onchange={updateGridDimensions}
                min="1"
                max="10"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label for="gridCols" class="block text-sm text-slate-400 mb-2">Columns</label>
              <input 
                type="number" 
                id="gridCols"
                name="cols"
                bind:value={gridCols}
                onchange={updateGridDimensions}
                min="1"
                max="10"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <p class="text-xs text-slate-500">Grid: {gridRows}×{gridCols} = {gridRows * gridCols} cells</p>

          <!-- Set as Default -->
          <div class="flex items-center gap-3">
            <input 
              type="checkbox" 
              id="gridIsDefault"
              name="isDefault"
              bind:checked={gridPresetIsDefault}
              value="true"
              class="w-5 h-5 rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-blue-500"
            />
            <label for="gridIsDefault" class="text-sm text-slate-300">Set as default dashboard grid</label>
          </div>

          <!-- Hidden field for grid config -->
          <input type="hidden" name="gridConfig" value={gridConfigJson} />

          <!-- Grid Editor -->
          <div>
            <p class="text-sm text-slate-400 mb-3">Grid Layout ({gridRows}×{gridCols})</p>
            <div class="grid gap-2" style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr));">
              {#each editingGridConfig as cell, index}
                <div class="bg-slate-800 border border-slate-700 rounded-lg p-2 flex flex-col min-h-[120px]">
                  <div class="text-xs text-slate-500 mb-1">Cell {index + 1}</div>
                  
                  <!-- Cell Type Selector -->
                  <select
                    class="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white mb-1 focus:outline-none focus:border-blue-500"
                    value={cell.type}
                    onchange={(e) => setCellType(index, e.currentTarget.value as GridCell['type'])}
                  >
                    <option value="empty">Empty</option>
                    <option value="printer">Printer</option>
                    <option value="stats">Stats</option>
                    <option value="settings">Settings</option>
                    <option value="storage">Storage</option>
                    <option value="spools">Materials</option>
                  </select>

                  <!-- Printer Selector (if printer type) -->
                  {#if cell.type === 'printer'}
                    <select
                      class="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                      value={cell.printerId || ''}
                      onchange={(e) => setCellPrinter(index, Number(e.currentTarget.value))}
                    >
                      <option value="">Select Printer</option>
                      {#each data.printers as printer}
                        <option value={printer.id}>{printer.name}</option>
                      {/each}
                    </select>
                  {/if}

                  <!-- Visual Preview -->
                  <div class="flex-1 flex items-center justify-center mt-1">
                    {#if cell.type === 'printer'}
                      <div class="text-center">
                        <span class="text-lg">🖨️</span>
                        {#if cell.printerId}
                          <p class="text-[10px] text-blue-400 truncate max-w-full">{getPrinterName(cell.printerId)}</p>
                        {/if}
                      </div>
                    {:else if cell.type === 'stats'}
                      <span class="text-lg">📊</span>
                    {:else if cell.type === 'settings'}
                      <span class="text-lg">⚙️</span>
                    {:else if cell.type === 'storage'}
                      <span class="text-lg">📦</span>
                    {:else if cell.type === 'spools'}
                      <span class="text-lg">🎨</span>
                    {:else}
                      <span class="text-slate-600 text-xs">Empty</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3 sticky bottom-0">
          <button 
            type="button"
            onclick={closeGridEditor}
            class="px-6 py-2.5 text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit"
            disabled={!gridPresetName.trim()}
            class="bg-green-500 hover:bg-green-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            {editingGridId ? 'Save Changes' : 'Create Grid Preset'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Printer Editor Modal -->
{#if showPrinterEditor}
  <div
    class="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-6"
    onclick={closePrinterEditor}
    onkeydown={(e) => e.key === 'Escape' && closePrinterEditor()}
    role="button"
    tabindex="0"
    aria-label="Close printer editor"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div 
      class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
        <div>
          <h2 class="text-xl font-medium">{editingPrinter ? 'Edit Printer' : 'Add Printer'}</h2>
          <p class="text-sm text-slate-500 mt-1">
            {editingPrinter ? `Editing ${editingPrinter.name}` : 'Add a new 3D printer'}
          </p>
        </div>
        <button 
          onclick={closePrinterEditor}
          class="text-slate-400 hover:text-white transition-colors p-2"
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
            <label for="printerName" class="block text-sm text-slate-400 mb-2">Printer Name *</label>
            <input 
              type="text" 
              id="printerName"
              name="name"
              bind:value={printerName}
              required
              placeholder="e.g., P1S #1, Bambu Lab X1C"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <!-- Printer Model -->
          <div>
            <label for="printerModel" class="block text-sm text-slate-400 mb-2">Model (Optional)</label>
            <input 
              type="text" 
              id="printerModel"
              name="model"
              bind:value={printerModel}
              placeholder="e.g., P1S, X1 Carbon, A1 Mini"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p class="text-xs text-slate-600 mt-1">Used to display the correct printer image</p>
          </div>

          {#if editingPrinter}
            <div class="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <div class="flex items-center justify-between text-sm">
                <span class="text-slate-400">Printer ID:</span>
                <span class="text-blue-400 font-mono">#{editingPrinter.id}</span>
              </div>
              <p class="text-xs text-slate-600 mt-2">Use this ID when configuring grid presets</p>
            </div>
          {/if}
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
          <button 
            type="button"
            onclick={closePrinterEditor}
            class="px-6 py-2.5 text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit"
            disabled={!printerName.trim()}
            class="bg-green-500 hover:bg-green-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            {editingPrinter ? 'Save Changes' : 'Add Printer'}
          </button>
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