<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { Printer, SpoolPreset, SpoolSuggestion } from '$lib/types';

  /**
   * Modal for choosing and loading a spool preset onto a printer.
   * Suggested presets (AI-ordered) are listed first. The form submission
   * is handled by loadSpoolEnhance defined in the parent.
   */
  export let printer: Printer;
  /** All spool presets ordered: AI suggestions first, then the rest. */
  export let orderedSpoolPresets: Array<{ preset: SpoolPreset; suggestion: SpoolSuggestion | null }>;
  /** Full preset list — used to resolve hidden form inputs from selectedPresetId. */
  export let spoolPresets: SpoolPreset[];
  export let onClose: () => void;
  /** enhance callback defined in parent — closes over selectedPrinter and closePrinterModal. */
  export let loadSpoolEnhance: SubmitFunction;

  /** Pre-selected preset ID — set by AI suggestion before the modal opens. */
  export let initialPresetId: number | null = null;

  // Local state — initialised from AI pre-selection; resets when modal is destroyed
  let selectedPresetId: number | null = initialPresetId;
</script>

<div
  class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="button"
  tabindex="0"
  aria-label="Close spool selector"
>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-panel bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl shadow-black/20"
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
            <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">Load Spool</h2>
            <p class="text-sm text-zinc-400 dark:text-zinc-600 mt-1 tracking-wide">Select a spool preset for {printer.name}</p>
          </div>
          <button
            onclick={onClose}
            class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
            aria-label="Close spool selector"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Spool Presets Grid (suggested ones first, in priority order) -->
        {#if orderedSpoolPresets.length > 0}
          <div class="grid grid-cols-2 gap-4">
            {#each orderedSpoolPresets as { preset, suggestion } (preset.id)}
              <button
                type="button"
                onclick={() => selectedPresetId = preset.id}
                class="text-left bg-zinc-50 dark:bg-[#111114] hover:bg-zinc-100 dark:hover:bg-[#151518] border-2 rounded-xl p-5 transition-all duration-200
                       {selectedPresetId === preset.id ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/5' : 'border-transparent'}"
              >
                <div class="flex items-start justify-between mb-3">
                  <h3 class="text-base font-medium text-zinc-900 dark:text-zinc-100">{preset.name}</h3>
                  {#if selectedPresetId === preset.id}
                    <div class="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  {/if}
                </div>
                <div class="space-y-1.5 text-sm">
                  <p class="text-zinc-400 dark:text-zinc-500">{preset.brand} · {preset.material}</p>
                  <p class="{(preset.storage_count || 0) === 0 ? 'text-red-500 dark:text-red-400' : (preset.storage_count || 0) <= 2 ? 'text-amber-500 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'}">
                    Stock: {preset.storage_count || 0}
                  </p>
                  <div class="flex justify-between items-center mt-3 pt-3 border-t border-zinc-200/60 dark:border-[#1a1a22]">
                    <span class="text-zinc-400 dark:text-zinc-600">Weight</span>
                    <span class="text-zinc-900 dark:text-zinc-100 font-medium tabular-nums">{preset.default_weight}g</span>
                  </div>
                  {#if preset.cost}
                    <div class="flex justify-between items-center">
                      <span class="text-zinc-400 dark:text-zinc-600">Cost</span>
                      <span class="text-emerald-500 dark:text-emerald-400 tabular-nums">${preset.cost.toFixed(2)}</span>
                    </div>
                  {/if}
                  {#if suggestion?.reason}
                    <div class="text-xs text-zinc-400 dark:text-zinc-600 mt-3 pt-3 border-t border-zinc-200/60 dark:border-[#1a1a22]">{suggestion.reason}</div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-10 text-center border border-zinc-100 dark:border-[#1a1a22]">
            <p class="text-zinc-400 dark:text-zinc-600 mb-4">No spool presets available</p>
            <a
              href="/settings"
              class="inline-block bg-blue-500/8 hover:bg-blue-500/15 text-blue-600 dark:text-blue-400 px-5 py-2.5 rounded-xl transition-all duration-200 border border-blue-500/10 hover:border-blue-500/20 font-medium text-sm"
            >
              Create Spool Preset
            </a>
          </div>
        {/if}
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
        <form
          method="POST"
          action="?/loadSpool"
          class="flex-1"
          use:enhance={loadSpoolEnhance}
        >
          <input type="hidden" name="printerId" value={printer.id} />
          {#if selectedPresetId}
            {@const selectedPreset = spoolPresets.find((p: any) => p.id === selectedPresetId)}
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
            class="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium
                   disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Load Selected Spool
          </button>
        </form>
      </div>
    </div>
  </div>
</div>
