<script lang="ts">
  import { formatTime } from '$lib/utils/time';
  import type { DashboardPrinter, SpoolWithPreset, PrintModuleFull, SpoolPreset } from '$lib/types';

  /**
   * Modal for picking a print module before starting a job.
   * Modules are grouped into four categories by spool compatibility and material quantity.
   */
  export let printer: DashboardPrinter;
  export let loadedSpool: SpoolWithPreset | null;
  /** Pre-categorised modules from getCategorizedModules(). */
  export let categorizedModules: {
    compatiblePrintable: PrintModuleFull[];
    compatibleInsufficientMaterial: PrintModuleFull[];
    anySpoolPrintable: PrintModuleFull[];
    anySpoolInsufficientMaterial: PrintModuleFull[];
  };
  export let spoolPresets: SpoolPreset[];
  /** Set of printer serials currently being started — disables the Start button. */
  export let startingSerials: Set<string>;
  export let onClose: () => void;
  export let onEnqueue: (module: PrintModuleFull, printer: DashboardPrinter) => void;

  // Local state — resets automatically when modal is destroyed
  let selectedModuleId: number | null = null;

  $: totalPrintable = categorizedModules.compatiblePrintable.length + categorizedModules.anySpoolPrintable.length;
</script>

<div
  class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="button"
  tabindex="0"
  aria-label="Close module selector"
>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-panel bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-2xl max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl shadow-black/20"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
  >
    <!-- Scrollable Content Area -->
    <div class="overflow-y-auto flex-1">
      <div class="p-8">
        <!-- Header -->
        <div class="flex justify-between items-start mb-8">
          <div>
            <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">Start Print</h2>
            <p class="text-sm text-zinc-400 dark:text-zinc-600 mt-1 tracking-wide">Select a module for {printer.name}</p>
            {#if loadedSpool}
              {@const loadedPreset = spoolPresets.find((p: any) => p.id === loadedSpool.preset_id)}
              <p class="text-xs text-zinc-400 dark:text-zinc-600 mt-2">
                Using: {loadedSpool.preset?.brand ?? ''} {loadedSpool.preset?.material ?? ''} - {loadedSpool.preset?.color ?? ''} ({loadedSpool.remaining_weight}g)
                {#if loadedPreset}
                  <span class="text-blue-500 dark:text-blue-400 ml-1">(Preset: {loadedPreset.name})</span>
                {/if}
              </p>
            {/if}
          </div>
          <button
            onclick={onClose}
            class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
            aria-label="Close module selector"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
          </button>
        </div>

        {#if printer?.suggested_queue && printer.suggested_queue.length > 0}
  <div class="mb-8 bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-5">
    <div class="flex items-start gap-4">
      <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      </div>
      <div class="flex-1">
        <h3 class="text-zinc-900 dark:text-zinc-100 font-medium mb-3 text-sm tracking-wide">
          Saved Print Queue
        </h3>
        <div class="space-y-2">
          {#each printer.suggested_queue as item, i}
            <div class="flex items-center justify-between text-sm">
              <span class="text-zinc-700 dark:text-zinc-300">
                {i + 1}. {item.module_name}
                {#if item.status === 'DONE'}
                  <span class="ml-2 text-green-600 dark:text-green-400 text-xs">✓ Done</span>
                {/if}
              </span>
              <span class="text-zinc-500">
                {item.weight_of_print}g ({item.priority})
              </span>
            </div>
          {/each}
        </div>
        <!-- Waste/leftover display -->
        {#if printer.suggested_queue.length > 0 && loadedSpool}
          {@const lastPrint = printer.suggested_queue[printer.suggested_queue.length - 1]}
          <div class="mt-4 text-xs text-zinc-500">
            <span>
              Waste after queue:
              <span class="text-orange-400 font-medium">
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

          <!-- Category 1: Compatible & Printable (PRIORITY) -->
          {#if categorizedModules.compatiblePrintable.length > 0}
            <div>
              <div class="flex items-center gap-2 mb-3">
                <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                <h3 class="text-sm font-medium text-green-600 dark:text-green-400">
                  Recommended for this Spool ({categorizedModules.compatiblePrintable.length})
                </h3>
              </div>
              <div class="grid grid-cols-3 gap-3">
                {#each categorizedModules.compatiblePrintable as module}
                  {@const modulePreset = module.default_spool_preset_id ? spoolPresets.find((p: any) => p.id === module.default_spool_preset_id) : null}
                  <button
                    type="button"
                    onclick={() => selectedModuleId = module.id}
                    class="text-left bg-zinc-50 dark:bg-[#111114] border-2 rounded-xl p-4 transition-all duration-200 hover:bg-zinc-100 dark:hover:bg-[#151518] cursor-pointer
                           {selectedModuleId === module.id ? 'border-green-500 bg-zinc-100 dark:bg-zinc-800' : 'border-transparent'}"
                  >
                    {#if module.thumbnail}
                      <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                        <img src={module.thumbnail} alt={module.name} class="max-w-full max-h-full object-contain" />
                      </div>
                    {:else}
                      <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                        <span class="text-3xl opacity-50">📦</span>
                      </div>
                    {/if}
                    <div class="flex items-start justify-between mb-1">
                      <h4 class="text-sm font-medium text-zinc-900 dark:text-zinc-50">{module.name}</h4>
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
                        <div class="flex justify-between items-center text-blue-600 dark:text-blue-400">
                          <span class="text-zinc-500">Preset:</span>
                          <span>{modulePreset.name}</span>
                        </div>
                      {/if}
                      <div class="flex justify-between items-center">
                        <span class="text-zinc-500">Weight:</span>
                        <span class="text-zinc-900 dark:text-zinc-50 font-medium">{module.weight}g</span>
                      </div>
                      <div class="flex justify-between items-center">
                        <span class="text-zinc-500">Time:</span>
                        <span class="text-zinc-500">{formatTime(module.expected_time_minutes ?? 0)}</span>
                      </div>
                      {#if loadedSpool}
                        <div class="flex justify-between items-center pt-1 border-t border-zinc-200/60 dark:border-[#1a1a22]">
                          <span class="text-zinc-500">After print:</span>
                          <span class="text-green-600 dark:text-green-400">{loadedSpool.remaining_weight - (module.weight ?? 0)}g</span>
                        </div>
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Category 2: Compatible but Insufficient Material -->
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
                  {@const modulePreset = module.default_spool_preset_id ? spoolPresets.find((p: any) => p.id === module.default_spool_preset_id) : null}
                  {@const shortfall = (module.weight ?? 0) - (loadedSpool?.remaining_weight ?? 0)}
                  <button
                    type="button"
                    onclick={() => selectedModuleId = module.id}
                    class="text-left bg-zinc-50 dark:bg-[#111114] border-2 rounded-xl p-4 transition-all duration-200 hover:bg-zinc-100 dark:hover:bg-[#151518] cursor-pointer
                           {selectedModuleId === module.id ? 'border-orange-500 bg-zinc-100 dark:bg-zinc-800' : 'border-transparent'}"
                  >
                    {#if module.thumbnail}
                      <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                        <img src={module.thumbnail} alt={module.name} class="max-w-full max-h-full object-contain opacity-60" />
                      </div>
                    {:else}
                      <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                        <span class="text-3xl opacity-30">📦</span>
                      </div>
                    {/if}
                    <div class="flex items-start justify-between mb-1">
                      <h4 class="text-sm font-medium text-zinc-900 dark:text-zinc-50">{module.name}</h4>
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
                        <div class="flex justify-between items-center text-blue-600 dark:text-blue-400">
                          <span class="text-zinc-500">Preset:</span>
                          <span>{modulePreset.name}</span>
                        </div>
                      {/if}
                      <div class="flex justify-between items-center">
                        <span class="text-zinc-500">Needs:</span>
                        <span class="text-zinc-900 dark:text-zinc-50 font-medium">{module.weight}g</span>
                      </div>
                      <div class="flex justify-between items-center">
                        <span class="text-zinc-500">Short by:</span>
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

          <!-- Category 3: Any Spool & Printable -->
          {#if categorizedModules.anySpoolPrintable.length > 0}
            <div>
              <div class="flex items-center gap-2 mb-3">
                <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                <h3 class="text-sm font-medium text-blue-600 dark:text-blue-400">
                  Universal Modules ({categorizedModules.anySpoolPrintable.length})
                </h3>
              </div>
              <div class="grid grid-cols-3 gap-3">
                {#each categorizedModules.anySpoolPrintable as module}
                  <button
                    type="button"
                    onclick={() => selectedModuleId = module.id}
                    class="text-left bg-zinc-50 dark:bg-[#111114] border-2 rounded-xl p-4 transition-all duration-200 hover:bg-zinc-100 dark:hover:bg-[#151518] cursor-pointer
                           {selectedModuleId === module.id ? 'border-blue-500 bg-zinc-100 dark:bg-zinc-800' : 'border-transparent'}"
                  >
                    {#if module.thumbnail}
                      <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                        <img src={module.thumbnail} alt={module.name} class="max-w-full max-h-full object-contain" />
                      </div>
                    {:else}
                      <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                        <span class="text-3xl opacity-50">📦</span>
                      </div>
                    {/if}
                    <div class="flex items-start justify-between mb-1">
                      <h4 class="text-sm font-medium text-zinc-900 dark:text-zinc-50">{module.name}</h4>
                      {#if selectedModuleId === module.id}
                        <div class="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                          <svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      {/if}
                    </div>
                    <div class="space-y-0.5 text-xs">
                      <div class="flex justify-between items-center text-zinc-500">
                        <span>Preset:</span>
                        <span class="text-zinc-500">Any</span>
                      </div>
                      <div class="flex justify-between items-center">
                        <span class="text-zinc-500">Weight:</span>
                        <span class="text-zinc-900 dark:text-zinc-50 font-medium">{module.weight}g</span>
                      </div>
                      <div class="flex justify-between items-center">
                        <span class="text-zinc-500">Time:</span>
                        <span class="text-zinc-500">{formatTime(module.expected_time_minutes ?? 0)}</span>
                      </div>
                      {#if loadedSpool}
                        <div class="flex justify-between items-center pt-1 border-t border-zinc-200/60 dark:border-[#1a1a22]">
                          <span class="text-zinc-500">After print:</span>
                          <span class="text-green-600 dark:text-green-400">{loadedSpool.remaining_weight - (module.weight ?? 0)}g</span>
                        </div>
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Category 4: Any Spool but Insufficient Material -->
          {#if categorizedModules.anySpoolInsufficientMaterial.length > 0}
            <div>
              <div class="flex items-center gap-2 mb-3">
                <div class="w-2 h-2 bg-zinc-500 rounded-full"></div>
                <h3 class="text-sm font-medium text-zinc-500">
                  Universal - Needs More Material ({categorizedModules.anySpoolInsufficientMaterial.length})
                </h3>
              </div>
              <div class="grid grid-cols-3 gap-3">
                {#each categorizedModules.anySpoolInsufficientMaterial as module}
                  {@const shortfall = (module.weight ?? 0) - (loadedSpool?.remaining_weight ?? 0)}
                  <div class="text-left bg-zinc-50/50 dark:bg-[#0c0c0f] border border-zinc-200/40 dark:border-[#1a1a22]/60 rounded-xl p-4 opacity-40 cursor-not-allowed">
                    {#if module.thumbnail}
                      <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100/50 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                        <img src={module.thumbnail} alt={module.name} class="max-w-full max-h-full object-contain opacity-40" />
                      </div>
                    {:else}
                      <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100/50 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                        <span class="text-3xl opacity-20">📦</span>
                      </div>
                    {/if}
                    <h4 class="text-sm font-medium text-zinc-900 dark:text-zinc-50 mb-1">{module.name}</h4>
                    <div class="space-y-0.5 text-xs">
                      <div class="flex justify-between items-center">
                        <span class="text-zinc-500">Needs:</span>
                        <span class="text-zinc-900 dark:text-zinc-50">{module.weight}g</span>
                      </div>
                      <div class="flex justify-between items-center">
                        <span class="text-zinc-500">Short by:</span>
                        <span class="text-zinc-500">{shortfall}g</span>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- No modules message -->
          {#if totalPrintable === 0 && categorizedModules.compatibleInsufficientMaterial.length === 0}
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-10 text-center border border-zinc-100 dark:border-[#1a1a22]">
              <p class="text-zinc-500 mb-4">No compatible modules found</p>
              <a
                href="/settings"
                class="inline-block bg-blue-50 dark:bg-blue-950 hover:bg-blue-50 dark:hover:bg-blue-950 text-blue-700 dark:text-blue-400 px-4 py-2 rounded-lg transition-colors text-sm"
              >
                Create Print Module
              </a>
            </div>
          {/if}

        </div>
      </div>
    </div>

    <!-- Sticky Footer -->
    <div class="sticky bottom-0 bg-white/80 dark:bg-[#0c0c0f]/80 backdrop-blur-xl border-t border-zinc-200/60 dark:border-[#1a1a22] p-6">
      <div class="flex gap-4">
        <button
          type="button"
          onclick={onClose}
          class="flex-1 bg-transparent border border-zinc-200/80 dark:border-[#1a1a22] hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 px-4 py-3.5 rounded-xl transition-all duration-200"
        >
          Cancel
        </button>
        <div class="flex-1">
          {#if selectedModuleId}
            {@const allModules = [
              ...categorizedModules.compatiblePrintable,
              ...categorizedModules.compatibleInsufficientMaterial,
              ...categorizedModules.anySpoolPrintable
            ]}
            {@const selectedModule = allModules.find((m: any) => m.id === selectedModuleId)}
            <button
              type="button"
              disabled={startingSerials.has(printer.printer_serial ?? '')}
              onclick={() => selectedModule && onEnqueue(selectedModule, printer)}
              class="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium disabled:opacity-50"
            >
              {#if selectedModule && loadedSpool && (selectedModule.weight ?? 0) > loadedSpool.remaining_weight}
                Start Print (Low Material)
              {:else if selectedModule?.filename && printer?.printer_ip}
                Start Print (Pi)
              {:else}
                Start Print Job
              {/if}
            </button>
          {:else}
            <button
              type="button"
              disabled
              class="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-3.5 rounded-xl font-medium opacity-30 cursor-not-allowed"
            >
              Start Print Job
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
