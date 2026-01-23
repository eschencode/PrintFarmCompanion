<script lang="ts">
  import type { PageData } from './$types';
  import p1sImage from '$lib/assets/p1s.png';
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import { fileHandlerStore } from '$lib/stores/fileHandler';
  
  export let data: PageData;
  
  let selectedPrinter: any = null;
  let showSpoolSelector: boolean = false;
  let showModuleSelector: boolean = false;
  let showFailureReasonModal: boolean = false;
  let selectedPresetId: number | null = null;
  let selectedModuleId: number | null = null;
  let selectedFailureReason: string = '';
  let customFailureReason: string = '';
  
  $: fileHandlerState = $fileHandlerStore;
  
  async function openFileLocally(filePath: string, moduleName: string, printerId: number) {
    return await fileHandlerStore.openFile(filePath, moduleName, printerId);
  }

  // Predefined failure reasons
  const failureReasons = [
    'Spaghetti / Layer Adhesion Failure',
    'Warping / Bed Adhesion Issue',
    'Filament Runout',
    'Nozzle Clog',
    'Power Outage',
    'Poor First Layer',
    'Stringing / Oozing',
    'Custom' // This will show the custom input field
  ];

  function selectPrinter(printer: any) {
    selectedPrinter = printer;
  }
  
  function closePrinterModal() {
    selectedPrinter = null;
    showSpoolSelector = false;
    showModuleSelector = false;
    showFailureReasonModal = false;
    selectedPresetId = null;
    selectedModuleId = null;
    selectedFailureReason = '';
    customFailureReason = '';
  }

  function closeFailureReasonModal() {
    showFailureReasonModal = false;
    selectedFailureReason = '';
    customFailureReason = '';
  }

 

  function getPrinterImage(model: any) {
    if (!model) return p1sImage;
    const modelLower = model.toLowerCase();
    if (modelLower.includes('p1s'))
      return p1sImage;
    return p1sImage;
  }

  // Grid Configuration - customize your layout here!
  const gridLayout = [
    { type: 'printer', printerId: 4 },
    { type: 'printer', printerId: 5 },
    { type: 'printer', printerId: 6 },
    { type: 'printer', printerId: 1 },
    { type: 'printer', printerId: 2 },
    { type: 'printer', printerId: 3 },
    { type: 'printer', printerId: 7 },
    { type: 'stats' },
    { type: 'settings' },
  ];

  function getPrinterForPosition(printerId: number | undefined) {
    if (!printerId) return null;
    return data.printers.find(p => p.id === printerId);
  }

  // Get active print job for selected printer
  function getActivePrintJob(printerId: number) {
    return data.activePrintJobs.find((job: any) => job.printer_id === printerId);
  }

  // Get spool info for printer
  function getLoadedSpool(spoolId: number | null) {
    if (!spoolId) return null;
    return data.spools.find((s: any) => s.id === spoolId);
  }

  // Get last completed print job for printer
  function getLastPrintJob(printerId: number) {
    if (!data.printJobs || data.printJobs.length === 0) return null;

    const completedJobs = data.printJobs.filter((job: any) => 
      job.printer_id === printerId && job.end_time !== null
    );
    
    if (completedJobs.length === 0) return null;
    
    // Sort by end_time descending and return the most recent
    return completedJobs.sort((a: any, b: any) => b.end_time - a.end_time)[0];
  }

  // Get available modules for loaded spool
  function getAvailableModules() {
    if (!selectedPrinter || !selectedPrinter.loaded_spool_id) return [];
    
    const loadedSpool = getLoadedSpool(selectedPrinter.loaded_spool_id);
    if (!loadedSpool || !loadedSpool.preset_id) {
      // If no preset, show all modules
      return data.printModules;
    }

    // Filter modules by matching preset_id or show all if module has no preset preference
    return data.printModules.filter((module: any) => 
      !module.default_spool_preset_id || module.default_spool_preset_id === loadedSpool.preset_id
    );
  }

  // Format time in minutes to hours:minutes
  function formatTime(minutes: number | null) {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  // Calculate elapsed time based on start_time
  function getElapsedTime(startTime: number) {
    const now = Math.floor(Date.now() / 1000);
    const elapsedSeconds = now - startTime;
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    return formatTime(elapsedMinutes);
  }

  // Calculate remaining time
  function getRemainingTime(startTime: number, expectedTime: number) {
    const now = Math.floor(Date.now() / 1000);
    const elapsedSeconds = now - startTime;
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const remainingMinutes = Math.max(0, expectedTime - elapsedMinutes);
    return formatTime(remainingMinutes);
  }

  // Calculate progress percentage
  function getProgress(startTime: number, expectedTime: number) {
    if (!expectedTime) return 0;
    const now = Math.floor(Date.now() / 1000);
    const elapsedSeconds = now - startTime;
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const progress = Math.min(100, (elapsedMinutes / expectedTime) * 100);
    return Math.round(progress);
  }

  function handleStartPrint() {
    const loadedSpool = getLoadedSpool(selectedPrinter?.loaded_spool_id);
    if (!loadedSpool) {
      alert('Please load a spool first!');
      return;
    }
    showModuleSelector = true;
  }

  function handleLoadSpool() {
    showSpoolSelector = true;
  }

  function closeSpoolSelector() {
    showSpoolSelector = false;
    selectedPresetId = null;
  }

  function closeModuleSelector() {
    showModuleSelector = false;
    selectedModuleId = null;
  }



  function selectSpoolPreset(presetId: number) {
    selectedPresetId = presetId;
  }

  function selectModule(moduleId: number) {
    selectedModuleId = moduleId;
  }

  function selectFailureReason(reason: string) {
    selectedFailureReason = reason;
    if (reason !== 'Custom') {
      customFailureReason = reason;
    } else {
      customFailureReason = 'Custom';
    }
  }

  function handlePrintFailed() {
    showFailureReasonModal = true;
  }

  function handleViewDetails() {
    console.log('Viewing details for:', selectedPrinter?.name);
    // Navigate to printer details page
  }

  function getModuleImage(imagePath: string | null) {
    // Return the image path or a placeholder
    return imagePath || p1sImage;
  }

  function getFinalFailureReason() {
    if (selectedFailureReason === 'Custom') {
      return customFailureReason || 'No reason provided';
    }
    return selectedFailureReason || 'No reason selected';
  }

   
  
  
  // Removed onMount as it's no longer needed
</script>

<div class="h-screen w-screen bg-black p-6 overflow-hidden">
  <!-- Header -->
  <div class="mb-6 flex justify-between items-center">
    <h1 class="text-3xl font-light text-white tracking-wide">Print Farm</h1>
    <div class="text-xs text-slate-500 font-light">
      {data.printers.length} Printers • {data.activePrintJobs.length} Active
    </div>
  </div>

  <!-- 3x3 Grid -->
  <div class="grid grid-cols-3 grid-rows-3 gap-4 h-[calc(100vh-120px)]">
    
    {#each gridLayout as cell, i}
      
      {#if cell.type === 'printer'}
        {@const printer = getPrinterForPosition(cell.printerId)}
        
        {#if printer}
          <!-- Active Printer Card -->
          <button
            onclick={() => selectPrinter(printer)}
            class="group relative bg-slate-900/50 border border-slate-800 
                   rounded-xl p-4 hover:border-slate-700 hover:bg-slate-900/80 
                   transition-all duration-300 hover:scale-[1.02]
                   flex flex-col items-center justify-center"
          >
            <!-- Status Indicator -->
            <div class="absolute top-3 right-3">
              {#if printer.status === 'PRINTING'}
                <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              {:else if printer.status === 'IDLE'}
                <div class="w-2 h-2 bg-green-500 rounded-full"></div>
              {:else}
                <div class="w-2 h-2 bg-slate-600 rounded-full"></div>
              {/if}
            </div>

            <!-- Printer Image -->
            <div class="mb-3 group-hover:scale-105 transition-transform flex-1 flex items-center justify-center">
              <img 
                src={getPrinterImage(printer.model)} 
                alt="Printer"
                class="w-42 h-42 object-contain opacity-90 group-hover:opacity-100 transition-opacity"
              />
            </div>

            <!-- Printer Name -->
            <div class="w-full text-center space-y-1 border-t border-slate-800/50 pt-3">
              <h3 class="text-sm font-medium text-white">{printer.name}</h3>
              <p class="text-xs text-slate-500 font-light">
                {#if printer.status === 'PRINTING'}
                  <span class="text-blue-400">Printing</span>
                {:else if printer.status === 'IDLE'}
                  <span class="text-green-400">Idle</span>
                {:else}
                  <span class="text-slate-500">{printer.status}</span>
                {/if}
              </p>
            </div>
          </button>
        {:else}
          <!-- Empty Printer Slot -->
          <div class="bg-slate-950/30 border border-slate-900/50 border-dashed
                      rounded-xl p-4 flex items-center justify-center">
            <div class="text-center text-slate-700">
              <div class="text-3xl mb-2 opacity-30">📦</div>
              <p class="text-xs font-light">Empty</p>
            </div>
          </div>
        {/if}

      {:else if cell.type === 'settings'}
        <!-- Settings Card -->
        <a
          href="/settings"
          class="group bg-slate-900/50 border border-slate-800 
                 rounded-xl p-4 hover:border-violet-900/50 hover:bg-slate-900/80
                 transition-all duration-300 hover:scale-[1.02]
                 flex flex-col items-center justify-center"
        >
          <div class="text-5xl mb-3 opacity-70 group-hover:opacity-100 group-hover:rotate-90 transition-all duration-500">
            ⚙️
          </div>
          <h3 class="text-sm font-medium text-white">Settings</h3>
          <p class="text-xs text-slate-500 mt-1 font-light">Configure</p>
        </a>

      {:else if cell.type === 'stats'}
        <!-- Stats Card -->
        <a
          href="/stats"
          class="group bg-slate-900/50 border border-slate-800 
                 rounded-xl p-4 hover:border-emerald-900/50 hover:bg-slate-900/80
                 transition-all duration-300 hover:scale-[1.02]
                 flex flex-col items-center justify-center"
        >
          <div class="text-5xl mb-3 opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all">
            📈
          </div>
          <h3 class="text-sm font-medium text-white">Stats</h3>
          <p class="text-xs text-slate-500 mt-1 font-light">Inspect Data</p>
        </a>

      {:else if cell.type === 'spools'}
        <!-- Materials/Spools Card -->
        <a
          href="/spools"
          class="group bg-slate-900/50 border border-slate-800 
                 rounded-xl p-4 hover:border-orange-900/50 hover:bg-slate-900/80
                 transition-all duration-300 hover:scale-[1.02]
                 flex flex-col items-center justify-center"
        >
          <div class="text-5xl mb-3 opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all">
            🎨
          </div>
          <h3 class="text-sm font-medium text-white">Materials</h3>
          <p class="text-xs text-slate-500 mt-1 font-light">{data.spools.length} spools</p>
        </a>

      {:else}
        <!-- Empty/Unknown Slot -->
        <div class="bg-slate-950/30 border border-slate-900/50 border-dashed
                    rounded-xl p-4 flex items-center justify-center">
          <div class="text-center text-slate-700">
            <div class="text-3xl mb-2 opacity-30">❓</div>
            <p class="text-xs font-light">Empty</p>
          </div>
        </div>
      {/if}

    {/each}

  </div>
</div>

<!-- Printer Detail Modal -->
{#if selectedPrinter && !showSpoolSelector && !showModuleSelector}
  {@const activePrintJob = getActivePrintJob(selectedPrinter.id)}
  {@const loadedSpool = getLoadedSpool(selectedPrinter.loaded_spool_id)}
  
  <div
    class="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-6 border-0 cursor-default"
    onclick={closePrinterModal}
    onkeydown={(e) => e.key === 'Escape' && closePrinterModal()}
    role="button"
    tabindex="0"
    aria-label="Close modal (press Escape)"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div 
      class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div class="p-6">
        <!-- Modal Header -->
        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="text-2xl font-medium text-white mb-1">{selectedPrinter.name}</h2>
            <p class="text-sm text-slate-400">{selectedPrinter.model}</p>
          </div>
          <button 
            onclick={closePrinterModal}
            class="text-slate-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Status Badge -->
        <div class="mb-6">
          {#if selectedPrinter.status === 'PRINTING'}
            <span class="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
              <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              Printing
            </span>
          {:else if selectedPrinter.status === 'IDLE'}
            <span class="inline-flex items-center gap-2 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
              <div class="w-2 h-2 bg-green-500 rounded-full"></div>
              Idle
            </span>
          {/if}
        </div>

        <!-- Conditional Content Based on Status -->
        {#if selectedPrinter.status === 'PRINTING' && activePrintJob}
          <!-- PRINTING STATUS MENU -->
          <div class="space-y-4">
            <!-- Module Name -->
            <div class="bg-slate-800/50 rounded-xl p-4">
              <p class="text-xs text-slate-500 mb-1">Print Module</p>
              <p class="text-xl text-white font-medium">{activePrintJob.module_name}</p>
            </div>

            <!-- Print Progress -->
            <div class="bg-slate-800/50 rounded-xl p-4">
              <div class="flex justify-between text-sm text-slate-400 mb-2">
                <span>Progress</span>
                <span class="text-white font-medium">{getProgress(activePrintJob.start_time, activePrintJob.expected_time)}%</span>
              </div>
              <div class="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <div 
                  class="bg-blue-500 h-full rounded-full transition-all duration-300" 
                  style="width: {getProgress(activePrintJob.start_time, activePrintJob.expected_time)}%"
                ></div>
              </div>
              <div class="flex justify-between text-xs text-slate-500 mt-2">
                <span>{getElapsedTime(activePrintJob.start_time)} elapsed</span>
                <span>{getRemainingTime(activePrintJob.start_time, activePrintJob.expected_time)} remaining</span>
              </div>
            </div>

            <!-- Time Info -->
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-slate-800/50 rounded-lg p-3">
                <p class="text-xs text-slate-500 mb-1">Total Print Time</p>
                <p class="text-lg text-white font-medium">{formatTime(activePrintJob.expected_time)}</p>
              </div>
              <div class="bg-slate-800/50 rounded-lg p-3">
                <p class="text-xs text-slate-500 mb-1">Remaining Time</p>
                <p class="text-lg text-white font-medium">{getRemainingTime(activePrintJob.start_time, activePrintJob.expected_time)}</p>
              </div>
            </div>

            <!-- Spool Weight Info -->
            {#if loadedSpool}
              <div class="bg-slate-800/50 rounded-xl p-4">
                <p class="text-xs text-slate-500 mb-3">Spool Weight</p>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <p class="text-xs text-slate-400 mb-1">Before Print</p>
                    <p class="text-xl text-white font-medium">{loadedSpool.remaining_weight}g</p>
                  </div>
                  <div>
                    <p class="text-xs text-slate-400 mb-1">Expected After</p>
                    <p class="text-xl text-blue-400 font-medium">{Math.max(0, loadedSpool.remaining_weight - activePrintJob.expected_weight)}g</p>
                  </div>
                </div>
                <div class="mt-3 pt-3 border-t border-slate-700/50">
                  <div class="flex justify-between text-xs">
                    <span class="text-slate-400">Material Usage</span>
                    <span class="text-orange-400 font-medium">{activePrintJob.expected_weight}g</span>
                  </div>
                </div>
              </div>
            {:else}
              <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <p class="text-sm text-red-400">No spool loaded</p>
              </div>
            {/if}

            <!-- Action Buttons -->
            <div class="grid grid-cols-2 gap-3 pt-2">
              <form 
                method="POST" 
                action="?/completePrint" 
                use:enhance={() => {
                  return async ({ result }) => {
                    if (result.type === 'success') {
                      closePrinterModal();
                      window.location.reload();
                    }
                  };
                }}
              >
                <input type="hidden" name="jobId" value={activePrintJob.id} />
                <input type="hidden" name="success" value="true" />
                <input type="hidden" name="actualWeight" value={activePrintJob.expected_weight} />
                <button 
                  type="submit"
                  class="w-full bg-green-500/20 hover:bg-green-500/30 text-green-400 px-4 py-3 rounded-lg transition-colors font-medium"
                >
                  ✓ Print Successful
                </button>
              </form>
              
              <button 
                onclick={handlePrintFailed}
                class="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-3 rounded-lg transition-colors font-medium"
              >
                ✗ Print Failed
              </button>
            </div>
          </div>

        {:else if selectedPrinter.status === 'IDLE'}
          <!-- IDLE STATUS MENU -->
          {@const lastPrintJob = getLastPrintJob(selectedPrinter.id)}
          <div class="space-y-4">
            
            <!-- Loaded Spool Info -->
            {#if loadedSpool}
              <div class="bg-slate-800/50 rounded-xl p-4">
                <p class="text-xs text-slate-500 mb-3">Loaded Spool</p>
                <div class="space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-sm text-slate-400">Name</span>
                    <span class="text-base text-white font-medium">
                      {loadedSpool.brand} {loadedSpool.material}
                    </span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-sm text-slate-400">Color</span>
                    <span class="text-base text-white">{loadedSpool.color || 'N/A'}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-sm text-slate-400">Remaining Weight</span>
                    <span class="text-lg text-green-400 font-medium">{loadedSpool.remaining_weight}g</span>
                  </div>
                </div>
              </div>
            {:else}
              <div class="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
                <p class="text-sm text-orange-400"> No spool loaded</p>
                <p class="text-xs text-slate-500 mt-1">Load a spool to start printing</p>
              </div>
            {/if}

            <!-- Last Print Info -->
            {#if lastPrintJob}
              <div class="bg-slate-800/50 rounded-xl p-4">
                <p class="text-xs text-slate-500 mb-2">Last Printed Module</p>
                <div class="flex justify-between items-center">
                  <span class="text-base text-white font-medium">{lastPrintJob.module_name || 'Unknown'}</span>
                  {#if lastPrintJob.success}
                    <span class="text-green-400 text-xs">✓ Success</span>
                  {:else}
                    <span class="text-red-400 text-xs">✗ Failed</span>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="bg-slate-800/50 rounded-xl p-4">
                <p class="text-xs text-slate-500 mb-2">Last Printed Module</p>
                <p class="text-sm text-slate-600">No previous prints</p>
              </div>
            {/if}

            <!-- Printer Stats -->
            <div class="bg-slate-800/50 rounded-xl p-4 space-y-2">
              <div class="flex justify-between">
                <span class="text-slate-400 text-sm">Total Runtime</span>
                <span class="text-white text-sm">{selectedPrinter.total_hours.toFixed(1)}h</span>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="grid grid-cols-2 gap-3 pt-2">
              <button 
                onclick={handleLoadSpool}
                class="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-4 py-3 rounded-lg transition-colors font-medium"
              >
                Load Spool
              </button>
              <button 
                onclick={handleStartPrint}
                class="bg-green-500/20 hover:bg-green-500/30 text-green-400 px-4 py-3 rounded-lg transition-colors font-medium"
              >
                Start Print
              </button>
            </div>
          </div>

        {:else}
          <!-- Fallback for other statuses -->
          <div class="bg-slate-800/50 rounded-xl p-4 text-center">
            <p class="text-slate-400">Status: {selectedPrinter.status}</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Spool Selector Modal -->
{#if selectedPrinter && showSpoolSelector}
  <div
    class="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-6"
    onclick={closeSpoolSelector}
    onkeydown={(e) => e.key === 'Escape' && closeSpoolSelector()}
    role="button"
    tabindex="0"
    aria-label="Close spool selector"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div 
      class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div class="p-6">
        <!-- Header -->
        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="text-2xl font-medium text-white mb-1">Load Spool</h2>
            <p class="text-sm text-slate-400">Select a spool preset for {selectedPrinter.name}</p>
          </div>
          <button 
            onclick={closeSpoolSelector}
            class="text-slate-400 hover:text-white transition-colors"
            aria-label="Close spool selector"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Spool Presets Grid -->
        {#if data.spoolPresets && data.spoolPresets.length > 0}
          <div class="grid grid-cols-2 gap-3 mb-6">
            {#each data.spoolPresets as preset}
              <button
                onclick={() => selectSpoolPreset(preset.id)}
                class="text-left bg-slate-800/50 hover:bg-slate-800 border-2 rounded-xl p-4 transition-all
                       {selectedPresetId === preset.id ? 'border-blue-500 bg-slate-800' : 'border-transparent'}"
              >
                <div class="flex items-start justify-between mb-2">
                  <h3 class="text-base font-medium text-white">{preset.name}</h3>
                  {#if selectedPresetId === preset.id}
                    <div class="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  {/if}
                </div>
                <div class="space-y-1 text-sm">
                  <p class="text-slate-400">{preset.brand} • {preset.material}</p>
                  {#if preset.color}
                    <p class="text-slate-500">Color: {preset.color}</p>
                  {/if}
                  <div class="flex justify-between items-center mt-2 pt-2 border-t border-slate-700/50">
                    <span class="text-slate-500">Weight:</span>
                    <span class="text-white font-medium">{preset.default_weight}g</span>
                  </div>
                  {#if preset.cost}
                    <div class="flex justify-between items-center">
                      <span class="text-slate-500">Cost:</span>
                      <span class="text-green-400">${preset.cost.toFixed(2)}</span>
                    </div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <div class="bg-slate-800/50 rounded-xl p-8 text-center mb-6">
            <p class="text-slate-400 mb-4">No spool presets available</p>
            <a 
              href="/settings" 
              class="inline-block bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Create Spool Preset
            </a>
          </div>
        {/if}

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button 
            onclick={closeSpoolSelector}
            class="flex-1 bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <form 
            method="POST" 
            action="?/loadSpool" 
            class="flex-1" 
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === 'success') {
                  closePrinterModal();
                  // Reload page data
                  window.location.reload();
                }
              };
            }}
          >
            <input type="hidden" name="printerId" value={selectedPrinter.id} />
            {#if selectedPresetId}
              {@const selectedPreset = data.spoolPresets.find(p => p.id === selectedPresetId)}
              {#if selectedPreset}
                <input type="hidden" name="presetId" value={selectedPreset.id} />
                <input type="hidden" name="brand" value={selectedPreset.brand} />
                <input type="hidden" name="material" value={selectedPreset.material} />
                <input type="hidden" name="color" value={selectedPreset.color || ''} />
                <input type="hidden" name="initialWeight" value={selectedPreset.default_weight} />
                <input type="hidden" name="remainingWeight" value={selectedPreset.default_weight} />
                <input type="hidden" name="cost" value={selectedPreset.cost || ''} />
              {/if}
            {/if}
            <button 
              type="submit"
              disabled={!selectedPresetId}
              class="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded-lg transition-colors font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-500"
            >
              Load Selected Spool
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Module Selector Modal -->
{#if selectedPrinter && showModuleSelector}
  {@const availableModules = getAvailableModules()}
  {@const loadedSpool = getLoadedSpool(selectedPrinter.loaded_spool_id)}
  
  <div
    class="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-6"
    onclick={closeModuleSelector}
    onkeydown={(e) => e.key === 'Escape' && closeModuleSelector()}
    role="button"
    tabindex="0"
    aria-label="Close module selector"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div 
      class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div class="p-6">
        <!-- Header -->
        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="text-2xl font-medium text-white mb-1">Start Print</h2>
            <p class="text-sm text-slate-400">Select a module for {selectedPrinter.name}</p>
            {#if loadedSpool}
              <p class="text-xs text-slate-500 mt-1">
                Using: {loadedSpool.brand} {loadedSpool.material} - {loadedSpool.color}
              </p>
            {/if}
          </div>
          <button 
            onclick={closeModuleSelector}
            class="text-slate-400 hover:text-white transition-colors"
            aria-label="Close module selector"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Module Grid -->
        {#if availableModules.length > 0}
          <div class="grid grid-cols-2 gap-3 mb-6">
            {#each availableModules as module}
              {@const canPrint = loadedSpool && loadedSpool.remaining_weight >= module.expected_weight}
              <button
                onclick={() => selectModule(module.id)}
                disabled={!canPrint}
                class="text-left bg-slate-800/50 hover:bg-slate-800 border-2 rounded-xl p-4 transition-all
                       {selectedModuleId === module.id ? 'border-green-500 bg-slate-800' : 'border-transparent'}
                       {!canPrint ? 'opacity-50 cursor-not-allowed' : ''}"
              >
                <!-- Module Image -->
                {#if module.image_path}
                  <div class="mb-3 rounded-lg overflow-hidden bg-slate-700/50 aspect-square flex items-center justify-center">
                    <img 
                      src={module.image_path} 
                      alt={module.name}
                      class="max-w-full max-h-full object-contain"
                    />
                  </div>
                {:else}
                  <div class="mb-3 rounded-lg overflow-hidden bg-slate-700/50 aspect-square flex items-center justify-center">
                    <span class="text-4xl opacity-50">📦</span>
                  </div>
                {/if}

                <div class="flex items-start justify-between mb-2">
                  <h3 class="text-base font-medium text-white">{module.name}</h3>
                  {#if selectedModuleId === module.id}
                    <div class="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  {/if}
                </div>

                <div class="space-y-1 text-sm">
                  <div class="flex justify-between items-center">
                    <span class="text-slate-500">Weight:</span>
                    <span class="text-white font-medium">{module.expected_weight}g</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-500">Time:</span>
                    <span class="text-slate-400">{formatTime(module.expected_time)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-500">Objects:</span>
                    <span class="text-slate-400">{module.objects_per_print}</span>
                  </div>

                  {#if !canPrint}
                    <div class="mt-2 pt-2 border-t border-red-500/20">
                      <p class="text-xs text-red-400">⚠️ Not enough material</p>
                    </div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <div class="bg-slate-800/50 rounded-xl p-8 text-center mb-6">
            <p class="text-slate-400 mb-4">No compatible modules found for this spool</p>
            <a 
              href="/settings" 
              class="inline-block bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Create Print Module
            </a>
          </div>
        {/if}

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button 
            onclick={closeModuleSelector}
            class="flex-1 bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <form 
            method="POST" 
            action="?/startPrint" 
            class="flex-1" 
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === 'success') {
                  // Get the selected module details
                  const selectedModule = availableModules.find(m => m.id === selectedModuleId);
                  
                  // Try to open file locally (fails silently if handler not available)
                  if (selectedModule && selectedModule.path) {
                    await openFileLocally(
                      selectedModule.path, 
                      selectedModule.name,
                      selectedPrinter.id
                    );
                  }
                  
                  closePrinterModal();
                  window.location.reload();
                }
              };
            }}
          >
            <input type="hidden" name="printerId" value={selectedPrinter.id} />
            {#if selectedModuleId}
              <input type="hidden" name="moduleId" value={selectedModuleId} />
            {/if}
            <button 
              type="submit"
              disabled={!selectedModuleId}
              class="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-lg transition-colors font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-500"
            >
              Start Print Job
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Failure Reason Modal - FIX THE BUTTON LOGIC -->
{#if selectedPrinter && showFailureReasonModal}
  {@const activePrintJob = getActivePrintJob(selectedPrinter.id)}
  {@const loadedSpool = getLoadedSpool(selectedPrinter.loaded_spool_id)}
  
  <div
    class="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-6"
    onclick={closeFailureReasonModal}
    onkeydown={(e) => e.key === 'Escape' && closeFailureReasonModal()}
    role="button"
    tabindex="0"
    aria-label="Close failure reason selector"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div 
      class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div class="p-6">
        <!-- Header -->
        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="text-2xl font-medium text-white mb-1">Print Failed</h2>
            <p class="text-sm text-slate-400">What went wrong?</p>
          </div>
          <button 
            onclick={closeFailureReasonModal}
            class="text-slate-400 hover:text-white transition-colors"
            aria-label="Close failure reason selector"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Material Usage Decision -->
        {#if loadedSpool && activePrintJob}
          <div class="mb-6 bg-slate-800/50 rounded-xl p-4">
            <p class="text-sm text-slate-400 mb-3">Did the print consume material before failing?</p>
            <div class="grid grid-cols-2 gap-3">
              <button
                onclick={() => selectFailureReason('Failed - Deduct Material')}
                class="text-left bg-slate-700/50 hover:bg-slate-700 border-2 rounded-lg p-3 transition-all
                       {selectedFailureReason === 'Failed - Deduct Material' ? 'border-orange-500 bg-slate-700' : 'border-transparent'}"
              >
                <div class="flex items-start justify-between mb-2">
                  <span class="text-white text-sm font-medium">Yes, Material Used</span>
                  {#if selectedFailureReason === 'Failed - Deduct Material'}
                    <div class="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  {/if}
                </div>
                <p class="text-xs text-slate-500">
                  Deduct {activePrintJob.expected_weight}g from spool
                </p>
              </button>

              <button
                onclick={() => selectFailureReason('Failed - Keep Material')}
                class="text-left bg-slate-700/50 hover:bg-slate-700 border-2 rounded-lg p-3 transition-all
                       {selectedFailureReason === 'Failed - Keep Material' ? 'border-blue-500 bg-slate-700' : 'border-transparent'}"
              >
                <div class="flex items-start justify-between mb-2">
                  <span class="text-white text-sm font-medium">No, Keep Weight</span>
                  {#if selectedFailureReason === 'Failed - Keep Material'}
                    <div class="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  {/if}
                </div>
                <p class="text-xs text-slate-500">
                  Spool stays at {loadedSpool.remaining_weight}g
                </p>
              </button>
            </div>
          </div>
        {/if}

        <!-- Failure Reasons List -->
        <div class="mb-4">
          <p class="text-sm text-slate-400 mb-3">What caused the failure?</p>
          <div class="space-y-2">
            {#each failureReasons as reason}
              <button
                onclick={() => {
                  if (reason === 'Custom') {
                    customFailureReason = '';
                  } else {
                    customFailureReason = reason;
                  }
                }}
                class="w-full text-left bg-slate-800/50 hover:bg-slate-800 border-2 rounded-lg p-3 transition-all
                       {customFailureReason === reason || (reason === 'Custom' && customFailureReason !== '' && !failureReasons.includes(customFailureReason)) ? 'border-red-500 bg-slate-800' : 'border-transparent'}"
              >
                <div class="flex items-center justify-between">
                  <span class="text-white text-sm">{reason}</span>
                  {#if (customFailureReason === reason && reason !== 'Custom') || (reason === 'Custom' && customFailureReason !== '' && !failureReasons.includes(customFailureReason))}
                    <div class="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Custom Reason Input -->
        {#if !failureReasons.includes(customFailureReason) && customFailureReason !== ''}
          <div class="mb-6 p-4 bg-slate-800/50 rounded-lg">
            <label for="customReason" class="block text-sm text-slate-400 mb-2">
              Custom failure reason:
            </label>
            <input
              id="customReason"
              type="text"
              bind:value={customFailureReason}
              placeholder="e.g., User cancelled, Testing issue..."
              class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>
        {/if}

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button 
            onclick={closeFailureReasonModal}
            class="flex-1 bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <form 
            method="POST" 
            action="?/completePrint" 
            class="flex-1"
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === 'success') {
                  closeFailureReasonModal();
                  closePrinterModal();
                  window.location.reload();
                }
              };
            }}
          >
            {#if activePrintJob}
              <input type="hidden" name="jobId" value={activePrintJob.id} />
              <input type="hidden" name="success" value="false" />
              
              <!-- Determine actual weight based on user choice -->
              {#if selectedFailureReason === 'Failed - Deduct Material'}
                <input type="hidden" name="actualWeight" value={activePrintJob.expected_weight} />
              {:else if selectedFailureReason === 'Failed - Keep Material'}
                <input type="hidden" name="actualWeight" value="0" />
              {:else}
                <input type="hidden" name="actualWeight" value="0" />
              {/if}
              
              <!-- Build failure reason string -->
              <input type="hidden" name="failureReason" value="{selectedFailureReason}: {customFailureReason}" />
            {/if}
            
            <button 
              type="submit"
              disabled={!selectedFailureReason || !customFailureReason}
              class="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-lg transition-colors font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-500"
            >
              Confirm Print Failed
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Status Indicator (Top-right corner) -->
<div class="fixed top-4 right-4 z-50 flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-lg px-3 py-2">
  {#if fileHandlerState.checking}
    <div class="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></div>
    <span class="text-xs text-slate-400">Checking...</span>
  {:else if fileHandlerState.connected}
    <div class="w-2 h-2 rounded-full bg-green-400"></div>
    <span class="text-xs text-slate-400">File Handler Online</span>
  {:else if fileHandlerState.token}
    <div class="w-2 h-2 rounded-full bg-orange-400"></div>
    <span class="text-xs text-slate-400">File Handler Offline</span>
  {:else}
    <div class="w-2 h-2 rounded-full bg-slate-600"></div>
    <span class="text-xs text-slate-500">Not Configured</span>
  {/if}
</div>