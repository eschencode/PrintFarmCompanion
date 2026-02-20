<script lang="ts">
  import type { PageData } from './$types';
  import type { GridCell } from '$lib/types';
  import p1sImage from '$lib/assets/p1s.png';
  import h2sImgae from '$lib/assets/H2S.png';
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
  let selectedFailureReason: string = ''; // ✅ This stores "deduct" or "keep"
  let customFailureReason: string = ''; // ✅ This stores the actual failure reason text
  let showCustomInput: boolean = false; // ✅ NEW: Track if "Custom" was selected
  
  $: fileHandlerState = $fileHandlerStore;
  
  async function openFileLocally(filePath: string, moduleName: string, printerId: number) {
    return await fileHandlerStore.openFile(filePath, moduleName, printerId);
  }

  // Predefined failure reasons
  const failureReasons = [
    'Spaghetti / Layer Adhesion Failure',
    'Werkzeug kopf abgefallen',
    'Filament Runout',
    'Poor quality',
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
    showCustomInput = false; // ✅ Reset custom input visibility
  }

  // ✅ ADD THIS FUNCTION
  function selectFailureReason(choice: string) {
    selectedFailureReason = choice;
  }

  function getPrinterImage(model: any) {
    if (!model){
		const modelLower = model.toLowerCase();
		if(modelLower.includes('h2s'))
			return h2sImgae;
		if (modelLower.includes('p1s'))
      		return p1sImage;
	}
    return p1sImage;
  }

  // Default Grid Configuration (fallback if no preset exists)
  const defaultGridLayout: GridCell[] = [
    { type: 'printer', printerId: 1 },
    { type: 'printer', printerId: 2 },
    { type: 'printer', printerId: 3 },
    { type: 'printer', printerId: 4 },
    { type: 'printer', printerId: 5 },
    { type: 'printer', printerId: 6 },
    { type: 'printer', printerId: 7 },
    { type: 'stats' },
    { type: 'settings' },
  ];

  // Grid switching state
  let currentGridIndex = 0;
  let gridContainer: HTMLElement;

  // Get all available grids (from presets or default)
  function getAllGrids(): { name: string; config: GridCell[]; rows: number; cols: number }[] {
    if (data.gridPresets && data.gridPresets.length > 0) {
      // Sort to put default first
      const sorted = [...data.gridPresets].sort((a, b) => (b.is_default || 0) - (a.is_default || 0));
      return sorted.map(preset => ({
        name: preset.name,
        config: parseGridConfig(preset.grid_config),
        rows: preset.rows || 3,
        cols: preset.cols || 3
      }));
    }
    return [{ name: 'Default', config: defaultGridLayout, rows: 3, cols: 3 }];
  }

  function parseGridConfig(jsonString: string): GridCell[] {
    try {
      return JSON.parse(jsonString);
    } catch {
      return defaultGridLayout;
    }
  }

  // Reactive grids list
  $: allGrids = getAllGrids();
  $: currentGrid = allGrids[currentGridIndex] || allGrids[0];
  $: gridLayout = currentGrid?.config || defaultGridLayout;
  $: gridRows = currentGrid?.rows || 3;
  $: gridCols = currentGrid?.cols || 3;

  // Grid navigation
  function goToGrid(index: number) {
    if (index >= 0 && index < allGrids.length) {
      currentGridIndex = index;
    }
  }

  function nextGrid() {
    if (currentGridIndex < allGrids.length - 1) {
      currentGridIndex++;
    }
  }

  function prevGrid() {
    if (currentGridIndex > 0) {
      currentGridIndex--;
    }
  }

  // Keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    // Only handle if no modal is open
    if (selectedPrinter) return;
    
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      nextGrid();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      prevGrid();
    }
  }

  // Touch/swipe handling
  let touchStartX = 0;
  let touchStartY = 0;

  function handleTouchStart(event: TouchEvent) {
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  }

  function handleTouchEnd(event: TouchEvent) {
    const touchEndX = event.changedTouches[0].clientX;
    const touchEndY = event.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Only handle horizontal swipes (ignore vertical)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX < 0) {
        nextGrid();
      } else {
        prevGrid();
      }
    }
  }

  // Wheel/trackpad handling - simple swipe with black edge reveal
  let resetTimeout: ReturnType<typeof setTimeout> | null = null;
  let swipeOffset = 0; // Pixel offset for visual feedback
  let accumulatedDelta = 0;
  let isSwiping = false;
  const SWIPE_THRESHOLD = 100; // Pixels to trigger switch

  function handleWheel(event: WheelEvent) {
    if (selectedPrinter) return;

    // Only handle horizontal scrolling
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && Math.abs(event.deltaX) > 1) {
      event.preventDefault();
      event.stopPropagation();
      
      isSwiping = true;
      
      // Accumulate the swipe
      accumulatedDelta += event.deltaX;
      
      // Check if we can navigate in that direction
      const canGoNext = currentGridIndex < allGrids.length - 1;
      const canGoPrev = currentGridIndex > 0;
      
      // Only allow offset if we can navigate that direction
      if (accumulatedDelta > 0 && canGoNext) {
        // Swiping left (going to next) - show black on right
        swipeOffset = -Math.min(accumulatedDelta * 0.4, 150);
      } else if (accumulatedDelta < 0 && canGoPrev) {
        // Swiping right (going to prev) - show black on left
        swipeOffset = -Math.max(accumulatedDelta * 0.4, -150);
      } else {
        // Can't navigate, no offset
        swipeOffset = 0;
      }
      
      // Clear existing timeout
      if (resetTimeout) clearTimeout(resetTimeout);
      
      // Check if we crossed threshold - switch immediately!
      if (Math.abs(accumulatedDelta) > SWIPE_THRESHOLD) {
        if (accumulatedDelta > 0 && canGoNext) {
          currentGridIndex++;
        } else if (accumulatedDelta < 0 && canGoPrev) {
          currentGridIndex--;
        }
        // Reset immediately after switch
        swipeOffset = 0;
        accumulatedDelta = 0;
        isSwiping = false;
        return;
      }
      
      // Reset after gesture ends
      resetTimeout = setTimeout(() => {
        isSwiping = false;
        swipeOffset = 0;
        accumulatedDelta = 0;
      }, 100);
    }
  }

  // Reference for cleanup
  let mainContainer: HTMLElement;

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    document.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('wheel', handleWheel);
      if (resetTimeout) clearTimeout(resetTimeout);
    };
  });

  function getPrinterForPosition(printerId: number | undefined) {
    if (!printerId) return null;
    // Use == for type coercion since printerId from JSON might be string
    return data.printers.find(p => Number(p.id) === Number(printerId));
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
      job.printer_id === printerId && job.status !== 'printing'
    );
    
    if (completedJobs.length === 0) return null;
    
    // Sort by end_time descending and return the most recent
    return completedJobs.sort((a: any, b: any) => b.end_time - a.end_time)[0];
  }

  // Enhanced module filtering and sorting
  function getCategorizedModules() {
    if (!selectedPrinter || !selectedPrinter.loaded_spool_id) return {
      compatiblePrintable: [],
      compatibleInsufficientMaterial: [],
      anySpoolPrintable: [],
      anySpoolInsufficientMaterial: []
    };
    
    const loadedSpool = getLoadedSpool(selectedPrinter.loaded_spool_id);
    if (!loadedSpool) return {
      compatiblePrintable: [],
      compatibleInsufficientMaterial: [],
      anySpoolPrintable: [],
      anySpoolInsufficientMaterial: []
    };

    const categories = {
      compatiblePrintable: [] as any[],
      compatibleInsufficientMaterial: [] as any[],
      anySpoolPrintable: [] as any[],
      anySpoolInsufficientMaterial: [] as any[]
    };

    data.printModules.forEach((module: any) => {
      const hasEnoughMaterial = loadedSpool.remaining_weight >= module.expected_weight;
      const moduleHasPreference = module.default_spool_preset_id !== null;
      const presetMatches = loadedSpool.preset_id === module.default_spool_preset_id;

      if (moduleHasPreference) {
        // Module has a preset preference
        if (presetMatches) {
          // Preset matches loaded spool
          if (hasEnoughMaterial) {
            categories.compatiblePrintable.push(module);
          } else {
            categories.compatibleInsufficientMaterial.push(module);
          }
        }
        // If preset doesn't match, we don't show it (🔴 Wrong Preset - hidden)
      } else {
        // Module works with any spool (no preset preference)
        if (hasEnoughMaterial) {
          categories.anySpoolPrintable.push(module);
        } else {
          categories.anySpoolInsufficientMaterial.push(module);
        }
      }
    });

    // Sort each category by weight (descending)
    const sortByWeight = (a: any, b: any) => b.expected_weight - a.expected_weight;
    categories.compatiblePrintable.sort(sortByWeight);
    categories.compatibleInsufficientMaterial.sort(sortByWeight);
    categories.anySpoolPrintable.sort(sortByWeight);
    categories.anySpoolInsufficientMaterial.sort(sortByWeight);

    return categories;
  }

	async function startSuggestedPrint(printItem) {
	// You can call your startPrint action here, e.g.:
	const response = await fetch('/?/startPrint', {
		method: 'POST',
		body: new URLSearchParams({
		printerId: selectedPrinter.id,
		moduleId: printItem.module_id
		})
	});
	const result = await response.json();
	// Optionally update UI or reload data
	if (result.success) {
		closePrinterModal();
		window.location.reload();
	}
	}
  // Modal handlers
  function handleLoadSpool() {
    showSpoolSelector = true;
  }

  function closeSpoolSelector() {
    showSpoolSelector = false;
    selectedPresetId = null;
  }

  function selectSpoolPreset(presetId: number) {
    selectedPresetId = presetId;
  }

  async function handleStartPrint() {
    if (!selectedPrinter?.loaded_spool_id) {
      alert('Please load a spool first');
      return;
    }
	// Only generate queue if empty or all items are DONE
  const queue = selectedPrinter.suggested_queue;
  const shouldGenerateQueue =
    !queue ||
    queue.length === 0 ||
    queue.every(item => item.status === 'DONE');

  if (shouldGenerateQueue) {
    const response = await fetch(`/api/ai-recommendations?type=queue&printerId=${selectedPrinter.id}`);
    const result = await response.json();
    if (result && Array.isArray(result)) {
      selectedPrinter.suggested_queue = result;
    }
  }

  showModuleSelector = true;
}

  function closeModuleSelector() {
    showModuleSelector = false;
    selectedModuleId = null;
  }

  function selectModule(moduleId: number) {
    selectedModuleId = moduleId;
  }

  function handlePrintFailed() {
    showFailureReasonModal = true;
  }

  // Time formatting helpers
  function formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  // ✅ FIXED: Use milliseconds consistently
  function getElapsedTimeMinutes(startTime: number): number {
    return Math.floor((Date.now() - startTime) / 1000 / 60);
  }

  function getElapsedTime(startTime: number): string {
    const elapsed = getElapsedTimeMinutes(startTime);
    return formatTime(elapsed);
  }

  function getRemainingTime(startTime: number, expectedMinutes: number): string {
    const elapsed = getElapsedTimeMinutes(startTime);
    const remaining = Math.max(0, expectedMinutes - elapsed);
    return formatTime(remaining);
  }

  function getProgress(startTime: number, expectedMinutes: number): number {
    const elapsed = getElapsedTimeMinutes(startTime);
    return Math.min(100, Math.round((elapsed / expectedMinutes) * 100));
  }



</script>

<div 
  bind:this={mainContainer}
  class="h-screen w-screen bg-black p-6 overflow-hidden"
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
  role="region"
  aria-label="Grid navigation area"
>
  <!-- Header -->
  <div class="mb-6 flex justify-between items-center">
    <div class="flex items-center gap-4">
      <h1 class="text-3xl font-light text-white tracking-wide">Print Farm</h1>
      {#if allGrids.length > 1}
        <span class="text-sm text-slate-500 font-light">
          {currentGrid?.name || 'Dashboard'}
        </span>
      {/if}
    </div>
    <div class="flex items-center gap-4">
      <div class="text-xs text-slate-500 font-light">
        {data.printers.length} Printers • {data.activePrintJobs.length} Active
      </div>
    </div>
  </div>

  <!-- Swipeable Grid Container -->
  <div class="relative overflow-hidden h-[calc(100vh-120px)]">
    <!-- Current Grid (with swipe transform) -->
    <div 
      class="absolute inset-0 ease-out"
      class:transition-transform={!isSwiping}
      class:duration-300={!isSwiping}
      style="transform: translateX({swipeOffset}px);"
    >
      <!-- Dynamic Grid -->
      <div 
        class="grid gap-4 h-full"
        style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr)); grid-template-rows: repeat({gridRows}, minmax(0, 1fr));"
      >
    
    {#each gridLayout as cell, i}
      
      {#if cell.type === 'printer'}
        {@const printer = getPrinterForPosition(cell.printerId)}
        
        {#if printer}
          <!-- Active Printer Card -->
          <button
            onclick={() => selectPrinter(printer)}
            class="group relative bg-slate-900/50 border border-slate-800 
                   rounded-xl p-2 hover:border-slate-700 hover:bg-slate-900/80 
                   transition-all duration-300 hover:scale-[1.02]
                   flex flex-col items-center justify-center overflow-hidden min-h-0"
          >
            <!-- Status Indicator -->
            <div class="absolute top-2 right-2">
              {#if printer.status === 'printing'}
                {@const activePrintForDot = getActivePrintJob(Number(printer.id))}
                {@const progressForDot = activePrintForDot ? getProgress(Number(activePrintForDot.start_time), Number(activePrintForDot.expected_time)) : 0}
                {#if progressForDot >= 100}
                  <!-- Print time complete - purple indicator -->
                  <div class="w-2 h-2 bg-violet-500 rounded-full animate-pulse"></div>
                {:else}
                  <!-- Still printing - blue indicator -->
                  <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                {/if}
              {:else if printer.status === 'IDLE'}
                {@const loadedSpoolForDot = printer.loaded_spool_id ? getLoadedSpool(printer.loaded_spool_id) : null}
                {@const remainingWeight = loadedSpoolForDot ? (loadedSpoolForDot as any).remaining_weight : 0}
                {@const compatibleModules = data.printModules.filter((m: any) => {
                  const moduleHasPresetPreference = m.default_spool_preset_id !== null;
                  const presetMatches = loadedSpoolForDot && (loadedSpoolForDot as any).preset_id === m.default_spool_preset_id;
                  // Module is compatible if: no preset preference OR preset matches
                  return !moduleHasPresetPreference || presetMatches;
                })}
                {@const minModuleWeight = compatibleModules.length > 0 
                  ? Math.min(...compatibleModules.map((m: any) => m.expected_weight)) 
                  : Infinity}
                {@const maxPrintsPossible = minModuleWeight > 0 && minModuleWeight !== Infinity 
                  ? Math.floor(remainingWeight / minModuleWeight) 
                  : 0}
                {#if !loadedSpoolForDot}
                  <!-- No spool loaded - red indicator -->
                  <div class="w-2 h-2 bg-red-500 rounded-full"></div>
                {:else if maxPrintsPossible === 0}
                  <!-- No prints possible - red indicator -->
                  <div class="w-2 h-2 bg-red-500 rounded-full"></div>
                {:else if maxPrintsPossible === 1}
                  <!-- Only 1 print possible - yellow indicator -->
                  <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
                {:else}
                  <!-- 2+ prints possible - green indicator -->
                  <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                {/if}
              {:else}
                <div class="w-2 h-2 bg-slate-600 rounded-full"></div>
              {/if}
            </div>

            <!-- Printer Image - scales with container -->
            <div class="flex-1 flex items-center justify-center min-h-0 w-full group-hover:scale-105 transition-transform">
              <img 
                src={getPrinterImage(printer.model)} 
                alt="Printer"
                class="max-h-full max-w-full object-contain opacity-90 group-hover:opacity-100 transition-opacity"
              />
            </div>

            <!-- Printer Name & Progress - compact for smaller cells -->
            <div class="w-full text-center border-t border-slate-800/50 pt-1 mt-1 min-h-0 flex-shrink-0">
              <h3 class="text-[clamp(0.5rem,2vw,0.875rem)] font-medium text-white truncate px-1">{printer.name}</h3>
              <p class="text-[clamp(0.4rem,1.5vw,0.75rem)] text-slate-500 font-light">
                {#if printer.status === 'printing'}
                  <span class="text-blue-400">Printing</span>
                {:else if printer.status === 'IDLE'}
                  <span class="text-green-400">Idle</span>
                {:else}
                  <span class="text-slate-500">{printer.status}</span>
                {/if}
              </p>
              
              <!-- Progress Bar for Active Prints -->
              {#if printer.status === 'printing'}
                {@const activePrint = getActivePrintJob(Number(printer.id))}
                {#if activePrint}
                  {@const progress = getProgress(Number(activePrint.start_time), Number(activePrint.expected_time))}
                  <div class="mt-1 px-1">
                    <div class="w-full bg-slate-700/50 rounded-full h-1 overflow-hidden">
                      <div 
                        class="{progress >= 100 ? 'bg-violet-500' : 'bg-blue-500'} h-full rounded-full transition-all duration-300" 
                        style="width: {Math.min(progress, 100)}%"
                      ></div>
                    </div>
                  </div>
                {/if}
              {/if}
            </div>
          </button>
        {:else}
          <!-- Empty Printer Slot -->
          <div class="bg-slate-950/30 border border-slate-900/50 border-dashed
                      rounded-xl p-2 flex items-center justify-center overflow-hidden">
            <div class="text-center text-slate-700">
              <div class="text-[clamp(1rem,3vw,2rem)] opacity-30">📦</div>
              <p class="text-[clamp(0.4rem,1.5vw,0.75rem)] font-light">Empty</p>
            </div>
          </div>
        {/if}

      {:else if cell.type === 'settings'}
        <!-- Settings Card -->
        <a
          href="/settings"
          class="group bg-slate-900/50 border border-slate-800 
                 rounded-xl p-2 hover:border-violet-900/50 hover:bg-slate-900/80
                 transition-all duration-300 hover:scale-[1.02]
                 flex flex-col items-center justify-center overflow-hidden"
        >
          <div class="text-[clamp(1.5rem,4vw,3rem)] opacity-70 group-hover:opacity-100 group-hover:rotate-90 transition-all duration-500">
            ⚙️
          </div>
          <h3 class="text-[clamp(0.5rem,2vw,0.875rem)] font-medium text-white mt-1">Settings</h3>
          <p class="text-[clamp(0.4rem,1.5vw,0.75rem)] text-slate-500 font-light">Configure</p>
        </a>

      {:else if cell.type === 'stats'}
        <!-- Stats Card -->
        <a
          href="/stats"
          class="group bg-slate-900/50 border border-slate-800 
                 rounded-xl p-2 hover:border-emerald-900/50 hover:bg-slate-900/80
                 transition-all duration-300 hover:scale-[1.02]
                 flex flex-col items-center justify-center overflow-hidden"
        >
          <div class="text-[clamp(1.5rem,4vw,3rem)] opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all">
            📈
          </div>
          <h3 class="text-[clamp(0.5rem,2vw,0.875rem)] font-medium text-white mt-1">Stats</h3>
          <p class="text-[clamp(0.4rem,1.5vw,0.75rem)] text-slate-500 font-light">Inspect Data</p>
        </a>

      {:else if cell.type === 'storage'}
        <!-- Storage Card -->
        <a
          href="/storage"
          class="group bg-slate-900/50 border border-slate-800 
                 rounded-xl p-2 hover:border-amber-900/50 hover:bg-slate-900/80
                 transition-all duration-300 hover:scale-[1.02]
                 flex flex-col items-center justify-center overflow-hidden"
        >
          <div class="text-[clamp(1.5rem,4vw,3rem)] opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all">
            📦
          </div>
          <h3 class="text-[clamp(0.5rem,2vw,0.875rem)] font-medium text-white mt-1">Storage</h3>
          <p class="text-[clamp(0.4rem,1.5vw,0.75rem)] text-slate-500 font-light">Inventory</p>
        </a>

      {:else if cell.type === 'spools'}
        <!-- Materials/Spools Card -->
        <a
          href="/spools"
          class="group bg-slate-900/50 border border-slate-800 
                 rounded-xl p-2 hover:border-orange-900/50 hover:bg-slate-900/80
                 transition-all duration-300 hover:scale-[1.02]
                 flex flex-col items-center justify-center overflow-hidden"
        >
          <div class="text-[clamp(1.5rem,4vw,3rem)] opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all">
            🎨
          </div>
          <h3 class="text-[clamp(0.5rem,2vw,0.875rem)] font-medium text-white mt-1">Materials</h3>
          <p class="text-[clamp(0.4rem,1.5vw,0.75rem)] text-slate-500 font-light">{data.spools.length} spools</p>
        </a>

      {:else if cell.type === 'inventory'}
        <!-- Inventory Card -->
        <a
          href="/inventory"
          class="group bg-slate-900/50 border border-slate-800 
                 rounded-xl p-2 hover:border-green-900/50 hover:bg-slate-900/80
                 transition-all duration-300 hover:scale-[1.02]
                 flex flex-col items-center justify-center overflow-hidden"
        >
          <div class="text-[clamp(1.5rem,4vw,3rem)] opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all">
            🛒
          </div>
          <h3 class="text-[clamp(0.5rem,2vw,0.875rem)] font-medium text-white mt-1">Inventory</h3>
          <p class="text-[clamp(0.4rem,1.5vw,0.75rem)] text-slate-500 font-light">Products</p>
        </a>

      {:else}
        <!-- Empty/Unknown Slot -->
        <div class="bg-slate-950/30 border border-slate-900/50 border-dashed
                    rounded-xl p-2 flex items-center justify-center overflow-hidden">
          <div class="text-center text-slate-700">
            <div class="text-[clamp(1rem,3vw,2rem)] opacity-30">❓</div>
            <p class="text-[clamp(0.4rem,1.5vw,0.75rem)] font-light">Empty</p>
          </div>
        </div>
      {/if}

    {/each}

      </div>
    </div>
  </div>

  <!-- Grid Navigation Indicators -->
  {#if allGrids.length > 1}
    <div class="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2">
      <!-- Left Arrow -->
      <button 
        onclick={prevGrid}
        disabled={currentGridIndex === 0}
        class="p-1.5 rounded-full text-slate-600 hover:text-slate-400 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        aria-label="Previous grid"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
      </button>

      <!-- Dots -->
      <div class="flex items-center gap-1.5">
        {#each allGrids as grid, i}
          <button
            onclick={() => goToGrid(i)}
            class="w-1.5 h-1.5 rounded-full transition-all duration-300 {i === currentGridIndex ? 'bg-slate-400 scale-125' : 'bg-slate-700 hover:bg-slate-600'}"
            aria-label="Go to grid {grid.name}"
          ></button>
        {/each}
      </div>

      <!-- Right Arrow -->
      <button 
        onclick={nextGrid}
        disabled={currentGridIndex === allGrids.length - 1}
        class="p-1.5 rounded-full text-slate-600 hover:text-slate-400 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        aria-label="Next grid"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </button>
    </div>
  {/if}
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
          {#if selectedPrinter.status === 'printing'}
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
        {#if selectedPrinter.status === 'printing' && activePrintJob}
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
               <button 
                onclick={handlePrintFailed}
                class="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-3 rounded-lg transition-colors font-medium"
              >
                ✗ Print Failed
              </button>
				
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
                  {#if lastPrintJob.status == 'success'}
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

			<!-- Next Suggested Print -->
			{#if selectedPrinter?.suggested_queue}
  {@const nextPrint = selectedPrinter.suggested_queue.find(item => item.status !== 'DONE')}
  {#if nextPrint}
    {@const allModules = data.printModules}
    {@const matchingModule = allModules.find(m => m.id === nextPrint.module_id)}
    <form
      method="POST"
      action="?/startPrint"
      use:enhance={() => {
        return async ({ result }) => {
          if (result.type === 'success') {
            // Optionally open file locally if path exists
			console.log('matchingModule:', matchingModule);
            if (matchingModule && matchingModule.path) {
				 console.log('Opening file:', matchingModule.path);
              await openFileLocally(
                matchingModule.path,
                matchingModule.name,
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
      <input type="hidden" name="moduleId" value={nextPrint.module_id} />
      <button
        type="submit"
        class="w-full text-left bg-green-500/10 border border-green-500/20 rounded-xl p-4 mt-3 hover:bg-green-500/20 transition-colors"
      >
        <div class="flex items-center gap-3">
          <span class="text-2xl">➡️</span>
          <div>
            <div class="text-xs text-slate-400 mb-1">Next Suggested Print</div>
            <div class="text-base text-white font-medium">{nextPrint.module_name}</div>
            <div class="text-xs text-slate-400">
              {nextPrint.weight_of_print}g • {nextPrint.priority}
            </div>
          </div>
        </div>
      </button>
    </form>
  {/if}
{/if}
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

<!-- Spool Selector Modal - UPDATED with sticky footer -->
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
      class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <!-- ✅ Scrollable Content Area -->
      <div class="overflow-y-auto flex-1">
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
            <div class="grid grid-cols-2 gap-3">
              {#each data.spoolPresets as preset}
                <button
                  type="button"
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
                    <p class="text-slate-500 {(preset.storage_count || 0) === 0 ? 'text-red-400' : (preset.storage_count || 0) <= 2 ? 'text-amber-400' : ''}">
                      Stock: {preset.storage_count || 0}
                    </p>
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
            <div class="bg-slate-800/50 rounded-xl p-8 text-center">
              <p class="text-slate-400 mb-4">No spool presets available</p>
              <a 
                href="/settings" 
                class="inline-block bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-4 py-2 rounded-lg transition-colors text-sm"
              >
                Create Spool Preset
              </a>
            </div>
          {/if}
        </div>
      </div>

      <!-- ✅ STICKY Footer with Action Buttons -->
      <div class="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-6">
        <div class="flex gap-3">
          <button 
            type="button"
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
					// Trigger queue generation after loading spool
					const response = await fetch(`/api/ai-recommendations?type=queue&printerId=${selectedPrinter.id}`);
					const queueResult = await response.json();
					if (queueResult && Array.isArray(queueResult)) {
					selectedPrinter.suggested_queue = queueResult;
					}
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

<!-- Module Selector Modal - UPDATED with sticky footer -->
{#if selectedPrinter && showModuleSelector}
  {@const categorizedModules = getCategorizedModules()}
  {@const loadedSpool = getLoadedSpool(selectedPrinter.loaded_spool_id)}
  {@const totalPrintable = categorizedModules.compatiblePrintable.length + categorizedModules.anySpoolPrintable.length}
  
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
      class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <!-- ✅ Scrollable Content Area -->
      <div class="overflow-y-auto flex-1">
        <div class="p-6">
          <!-- Header -->
          <div class="flex justify-between items-start mb-6">
            <div>
              <h2 class="text-2xl font-medium text-white mb-1">Start Print</h2>
              <p class="text-sm text-slate-400">Select a module for {selectedPrinter.name}</p>
              {#if loadedSpool}
                {@const loadedPreset = data.spoolPresets.find(p => p.id === loadedSpool.preset_id)}
                <p class="text-xs text-slate-500 mt-1">
                  Using: {loadedSpool.brand} {loadedSpool.material} - {loadedSpool.color} ({loadedSpool.remaining_weight}g)
                  {#if loadedPreset}
                    <span class="text-blue-400 ml-1">(Preset: {loadedPreset.name})</span>
                  {/if}
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

          {#if selectedPrinter?.suggested_queue && selectedPrinter.suggested_queue.length > 0}
  <div class="mb-6 bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-xl p-4">
    <div class="flex items-start gap-3">
      <div class="text-2xl">📝</div>
      <div class="flex-1">
        <h3 class="text-white font-medium mb-2 flex items-center gap-2">
          Saved Print Queue
        </h3>
        <div class="space-y-2">
          {#each selectedPrinter.suggested_queue as item, i}
            <div class="flex items-center justify-between text-sm">
              <span class="text-slate-300">
                {i + 1}. {item.module_name}
                {#if item.status === 'DONE'}
                  <span class="ml-2 text-green-400 text-xs">✓ Done</span>
                {/if}
              </span>
              <span class="text-slate-500">
                {item.weight_of_print}g ({item.priority})
              </span>
            </div>
          {/each}
        </div>
        <!-- Waste/leftover display -->
        {#if selectedPrinter.suggested_queue.length > 0 && loadedSpool}
          {@const lastPrint = selectedPrinter.suggested_queue[selectedPrinter.suggested_queue.length - 1]}
          <div class="mt-4 text-xs text-slate-400">
            <span>
              Waste after queue: 
              <span class="text-orange-400 font-semibold">
                {lastPrint.spool_weight_after_print}g
              </span>
              / Start: {loadedSpool.remaining_weight}g
            </span>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
                 
					

          <!-- Module Categories -->
          <div class="space-y-6">
            
            <!-- Category 1: 🟢 Compatible & Printable (PRIORITY) -->
            {#if categorizedModules.compatiblePrintable.length > 0}
              <div>
                <div class="flex items-center gap-2 mb-3">
                  <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                  <h3 class="text-sm font-medium text-green-400">
                    Recommended for this Spool ({categorizedModules.compatiblePrintable.length})
                  </h3>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  {#each categorizedModules.compatiblePrintable as module}
                    {@const modulePreset = module.default_spool_preset_id ? data.spoolPresets.find(p => p.id === module.default_spool_preset_id) : null}
                    <button
                      type="button"
                      onclick={() => selectModule(module.id)}
                      class="text-left bg-slate-800/50 border-2 rounded-xl p-3 transition-all hover:bg-slate-800 cursor-pointer
                             {selectedModuleId === module.id ? 'border-green-500 bg-slate-800' : 'border-transparent'}"
                    >
                      <!-- Module card content -->
                      {#if module.image_path}
                        <div class="mb-2 rounded-lg overflow-hidden bg-slate-700/50 aspect-square flex items-center justify-center">
                          <img 
                            src={module.image_path} 
                            alt={module.name}
                            class="max-w-full max-h-full object-contain"
                          />
                        </div>
                      {:else}
                        <div class="mb-2 rounded-lg overflow-hidden bg-slate-700/50 aspect-square flex items-center justify-center">
                          <span class="text-3xl opacity-50">📦</span>
                        </div>
                      {/if}

                      <div class="flex items-start justify-between mb-1">
                        <h4 class="text-sm font-medium text-white">{module.name}</h4>
                        {#if selectedModuleId === module.id}
                          <div class="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                            <svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        {/if}
                      </div>

                      <div class="space-y-0.5 text-xs">
                        {#if modulePreset}
                          <div class="flex justify-between items-center text-blue-400">
                            <span class="text-slate-500">Preset:</span>
                            <span>{modulePreset.name}</span>
                          </div>
                        {/if}
                        <div class="flex justify-between items-center">
                          <span class="text-slate-500">Weight:</span>
                          <span class="text-white font-medium">{module.expected_weight}g</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-slate-500">Time:</span>
                          <span class="text-slate-400">{formatTime(module.expected_time)}</span>
                        </div>
                        {#if loadedSpool}
                          <div class="flex justify-between items-center pt-1 border-t border-slate-700/50">
                            <span class="text-slate-500">After print:</span>
                            <span class="text-green-400">{loadedSpool.remaining_weight - module.expected_weight}g</span>
                          </div>
                        {/if}
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Category 2: 🟠 Compatible but Insufficient Material -->
            {#if categorizedModules.compatibleInsufficientMaterial.length > 0}
              <div>
                <div class="flex items-center gap-2 mb-3">
                  <div class="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <h3 class="text-sm font-medium text-orange-400">
                    Compatible - Needs More Material ({categorizedModules.compatibleInsufficientMaterial.length})
                  </h3>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  {#each categorizedModules.compatibleInsufficientMaterial as module}
                    {@const modulePreset = module.default_spool_preset_id ? data.spoolPresets.find(p => p.id === module.default_spool_preset_id) : null}
                    {@const shortfall = module.expected_weight - (loadedSpool?.remaining_weight || 0)}
                    <button
                      type="button"
                      onclick={() => selectModule(module.id)}
                      class="text-left bg-slate-800/30 border-2 rounded-xl p-3 transition-all hover:bg-slate-800/50 cursor-pointer
                             {selectedModuleId === module.id ? 'border-orange-500 bg-slate-800/50' : 'border-transparent'}"
                    >
                      <!-- Module card content -->
                      {#if module.image_path}
                        <div class="mb-2 rounded-lg overflow-hidden bg-slate-700/30 aspect-square flex items-center justify-center">
                          <img 
                            src={module.image_path} 
                            alt={module.name}
                            class="max-w-full max-h-full object-contain opacity-60"
                          />
                        </div>
                      {:else}
                        <div class="mb-2 rounded-lg overflow-hidden bg-slate-700/30 aspect-square flex items-center justify-center">
                          <span class="text-3xl opacity-30">📦</span>
                        </div>
                      {/if}

                      <div class="flex items-start justify-between mb-1">
                        <h4 class="text-sm font-medium text-white">{module.name}</h4>
                        {#if selectedModuleId === module.id}
                          <div class="w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                            <svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        {/if}
                      </div>

                      <div class="space-y-0.5 text-xs">
                        {#if modulePreset}
                          <div class="flex justify-between items-center text-blue-400">
                            <span class="text-slate-500">Preset:</span>
                            <span>{modulePreset.name}</span>
                          </div>
                        {/if}
                        <div class="flex justify-between items-center">
                          <span class="text-slate-500">Needs:</span>
                          <span class="text-white font-medium">{module.expected_weight}g</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-slate-500">Short by:</span>
                          <span class="text-orange-400 font-medium">{shortfall}g</span>
                        </div>
                      </div>
                      <div class="mt-2 pt-2 border-t border-orange-500/20">
                        <p class="text-xs text-orange-400">⚠️ Not enough material</p>
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Category 3: 🔵 Any Spool & Printable -->
            {#if categorizedModules.anySpoolPrintable.length > 0}
              <div>
                <div class="flex items-center gap-2 mb-3">
                  <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <h3 class="text-sm font-medium text-blue-400">
                    Universal Modules ({categorizedModules.anySpoolPrintable.length})
                  </h3>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  {#each categorizedModules.anySpoolPrintable as module}
                    <button
                      type="button"
                      onclick={() => selectModule(module.id)}
                      class="text-left bg-slate-800/50 border-2 rounded-xl p-3 transition-all hover:bg-slate-800 cursor-pointer
                             {selectedModuleId === module.id ? 'border-blue-500 bg-slate-800' : 'border-transparent'}"
                    >
                      <!-- Module card content -->
                      {#if module.image_path}
                        <div class="mb-2 rounded-lg overflow-hidden bg-slate-700/50 aspect-square flex items-center justify-center">
                          <img 
                            src={module.image_path} 
                            alt={module.name}
                            class="max-w-full max-h-full object-contain"
                          />
                        </div>
                      {:else}
                        <div class="mb-2 rounded-lg overflow-hidden bg-slate-700/50 aspect-square flex items-center justify-center">
                          <span class="text-3xl opacity-50">📦</span>
                        </div>
                      {/if}

                      <div class="flex items-start justify-between mb-1">
                        <h4 class="text-sm font-medium text-white">{module.name}</h4>
                        {#if selectedModuleId === module.id}
                          <div class="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                            <svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        {/if}
                      </div>

                      <div class="space-y-0.5 text-xs">
                        <div class="flex justify-between items-center text-slate-500">
                          <span>Preset:</span>
                          <span class="text-slate-600">Any</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-slate-500">Weight:</span>
                          <span class="text-white font-medium">{module.expected_weight}g</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-slate-500">Time:</span>
                          <span class="text-slate-400">{formatTime(module.expected_time)}</span>
                        </div>
                        {#if loadedSpool}
                          <div class="flex justify-between items-center pt-1 border-t border-slate-700/50">
                            <span class="text-slate-500">After print:</span>
                            <span class="text-green-400">{loadedSpool.remaining_weight - module.expected_weight}g</span>
                          </div>
                        {/if}
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Category 4: ⚫ Any Spool but Insufficient Material -->
            {#if categorizedModules.anySpoolInsufficientMaterial.length > 0}
              <div>
                <div class="flex items-center gap-2 mb-3">
                  <div class="w-2 h-2 bg-slate-500 rounded-full"></div>
                  <h3 class="text-sm font-medium text-slate-400">
                    Universal - Needs More Material ({categorizedModules.anySpoolInsufficientMaterial.length})
                  </h3>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  {#each categorizedModules.anySpoolInsufficientMaterial as module}
                    {@const shortfall = module.expected_weight - (loadedSpool?.remaining_weight || 0)}
                    <div class="text-left bg-slate-800/20 border border-slate-700/30 rounded-xl p-3 opacity-50 cursor-not-allowed">
                      <!-- Module card content -->
                      {#if module.image_path}
                        <div class="mb-2 rounded-lg overflow-hidden bg-slate-700/20 aspect-square flex items-center justify-center">
                          <img 
                            src={module.image_path} 
                            alt={module.name}
                            class="max-w-full max-h-full object-contain opacity-40"
                          />
                        </div>
                      {:else}
                        <div class="mb-2 rounded-lg overflow-hidden bg-slate-700/20 aspect-square flex items-center justify-center">
                          <span class="text-3xl opacity-20">📦</span>
                        </div>
                      {/if}

                      <h4 class="text-sm font-medium text-white mb-1">{module.name}</h4>
                      <div class="space-y-0.5 text-xs">
                        <div class="flex justify-between items-center">
                          <span class="text-slate-500">Needs:</span>
                          <span class="text-white">{module.expected_weight}g</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-slate-500">Short by:</span>
                          <span class="text-slate-400">{shortfall}g</span>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- No modules message -->
            {#if totalPrintable === 0 && categorizedModules.compatibleInsufficientMaterial.length === 0}
              <div class="bg-slate-800/50 rounded-xl p-8 text-center">
                <p class="text-slate-400 mb-4">No compatible modules found</p>
                <a 
                  href="/settings" 
                  class="inline-block bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  Create Print Module
                </a>
              </div>
            {/if}

          </div>
        </div>
      </div>

      <!-- ✅ STICKY Footer with Action Buttons -->
      <div class="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-6">
        <div class="flex gap-3">
          <button 
            type="button"
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
                  const allModules = [
                    ...categorizedModules.compatiblePrintable,
                    ...categorizedModules.compatibleInsufficientMaterial,
                    ...categorizedModules.anySpoolPrintable
                  ];
                  const selectedModule = allModules.find(m => m.id === selectedModuleId);
                  
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
              {#if selectedModuleId}
                {@const allModules = [
                  ...categorizedModules.compatiblePrintable,
                  ...categorizedModules.compatibleInsufficientMaterial,
                  ...categorizedModules.anySpoolPrintable
                ]}
                {@const selectedModule = allModules.find(m => m.id === selectedModuleId)}
                {#if selectedModule && loadedSpool && selectedModule.expected_weight > loadedSpool.remaining_weight}
                  <span class="flex items-center justify-center gap-2">
                    ⚠️ Start Print (Low Material)
                  </span>
                {:else}
                  Start Print Job
                {/if}
              {:else}
                Start Print Job
              {/if}
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Failure Reason Modal - UPDATED -->
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
                type="button"
                onclick={() => selectedFailureReason = 'deduct'}
                class="text-left bg-slate-700/50 hover:bg-slate-700 border-2 rounded-lg p-3 transition-all
                       {selectedFailureReason === 'deduct' ? 'border-orange-500 bg-slate-700' : 'border-transparent'}"
              >
                <div class="flex items-start justify-between mb-2">
                  <span class="text-white text-sm font-medium">Yes, Material Used</span>
                  {#if selectedFailureReason === 'deduct'}
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
                type="button"
                onclick={() => selectedFailureReason = 'keep'}
                class="text-left bg-slate-700/50 hover:bg-slate-700 border-2 rounded-lg p-3 transition-all
                       {selectedFailureReason === 'keep' ? 'border-blue-500 bg-slate-700' : 'border-transparent'}"
              >
                <div class="flex items-start justify-between mb-2">
                  <span class="text-white text-sm font-medium">No, Keep Weight</span>
                  {#if selectedFailureReason === 'keep'}
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

        <!-- ✅ UPDATED: Failure Reasons List -->
        <div class="mb-4">
          <p class="text-sm text-slate-400 mb-3">What caused the failure?</p>
          <div class="space-y-2">
            {#each failureReasons as reason}
              <button
                type="button"
                onclick={() => {
                  if (reason === 'Custom') {
                    showCustomInput = true;
                    customFailureReason = '';
                  } else {
                    showCustomInput = false;
                    customFailureReason = reason;
                  }
                }}
                class="w-full text-left bg-slate-800/50 hover:bg-slate-800 border-2 rounded-lg p-3 transition-all
                       {(customFailureReason === reason && !showCustomInput) || (reason === 'Custom' && showCustomInput) ? 'border-red-500 bg-slate-800' : 'border-transparent'}"
              >
                <div class="flex items-center justify-between">
                  <span class="text-white text-sm">{reason}</span>
                  {#if (customFailureReason === reason && !showCustomInput) || (reason === 'Custom' && showCustomInput)}
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

        <!-- ✅ FIXED: Only show custom input when "Custom" is clicked -->
        {#if showCustomInput}
          <div class="mb-6 p-4 bg-slate-800/50 rounded-lg">
            <label for="customReason" class="block text-sm text-slate-400 mb-2">
              Enter custom failure reason:
            </label>
            <input
              id="customReason"
              type="text"
              bind:value={customFailureReason}
              placeholder="e.g., User cancelled, Testing issue..."
              class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
              autofocus
            />
          </div>
        {/if}

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button 
            type="button"
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
					// Trigger queue generation after print failure
					const response = await fetch(`/api/ai-recommendations?type=queue&printerId=${selectedPrinter.id}`);
					const queueResult = await response.json();
					if (queueResult && Array.isArray(queueResult)) {
					selectedPrinter.suggested_queue = queueResult;
					}
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
              {#if selectedFailureReason === 'deduct'}
                <input type="hidden" name="actualWeight" value={activePrintJob.expected_weight} />
              {:else}
                <input type="hidden" name="actualWeight" value="0" />
              {/if}
              
              <!-- Build failure reason string -->
              <input type="hidden" name="failureReason" value={customFailureReason || 'Unknown failure'} />
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