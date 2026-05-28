<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { resolveSpoolColor } from '$lib/utils/spoolColor';
  import type { DashboardPrinter, SpoolPreset, SpoolSuggestion, SpoolWithPreset } from '$lib/types';

  export let printer: DashboardPrinter;
  /** Presets ordered: AI suggestions first, then the rest. */
  export let orderedSpoolPresets: Array<{ preset: SpoolPreset; suggestion: SpoolSuggestion | null }>;
  /** Full preset list — used to resolve hidden form inputs. */
  export let spoolPresets: SpoolPreset[];
  /** All open physical spools (for the "load existing" mode). */
  export let spools: SpoolWithPreset[];
  export let onClose: () => void;
  /** enhance callback from parent — closes over selectedPrinter and reloads. */
  export let loadSpoolEnhance: SubmitFunction;
  /** Pre-selected preset ID — set by AI suggestion before modal opens. */
  export let initialPresetId: number | null = null;
  /** Which slot to default to when the modal opens. */
  export let initialSlotIndex: number = 0;

  const slotCount: number = (printer as any).slot_count ?? 1;

  let selectedPresetId: number | null = initialPresetId;
  let selectedSlotIndex: number = Math.min(initialSlotIndex, slotCount - 1);
  let mode: 'new' | 'existing' = 'new';
  let selectedExistingSpoolId: number | null = null;

  // Build a view of each slot from the loaded_spools array (nested structure).
  $: slotViews = Array.from({ length: slotCount }, (_, i) => {
    const ls = printer.loaded_spools?.find((s) => s.slot_index === i);
    return {
      index: i,
      spoolId: ls?.spool_id ?? null,
      remainingWeight: ls?.spool?.remaining_weight ?? null,
      brand: ls?.spool?.preset?.brand ?? null,
      color: ls?.spool?.preset ? resolveSpoolColor(ls.spool.preset) : null,
      material: ls?.spool?.preset?.material ?? null,
    };
  });

  $: selectedPreset = spoolPresets.find(p => p.id === selectedPresetId) ?? null;
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
    <div class="overflow-y-auto flex-1">
      <div class="p-8">

        <!-- Header -->
        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">Load Spool</h2>
            <p class="text-sm text-zinc-400 dark:text-zinc-600 mt-1 tracking-wide">{printer.name}</p>
          </div>
          <button
            onclick={onClose}
            class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
            aria-label="Close"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Slot picker — only shown for multi-slot printers -->
        {#if slotCount > 1}
          <div class="mb-6">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-600 mb-3">Select Slot</p>
            <div
              class="grid gap-2"
              style="grid-template-columns: repeat({Math.min(slotCount, 4)}, minmax(0, 1fr));"
            >
              {#each slotViews as slot (slot.index)}
                <button
                  type="button"
                  onclick={() => (selectedSlotIndex = slot.index)}
                  class="text-left p-3 rounded-xl border-2 transition-all duration-150
                    {selectedSlotIndex === slot.index
                      ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/5'
                      : 'border-zinc-200/60 dark:border-[#1a1a22] hover:border-zinc-300 dark:hover:border-[#2a2a32] bg-zinc-50 dark:bg-[#111114]'}"
                >
                  <div class="flex items-center gap-2 mb-1.5">
                    {#if slot.color}
                      <div class="w-3 h-3 rounded-full shrink-0" style="background-color: {slot.color}"></div>
                    {:else}
                      <div class="w-3 h-3 rounded-full shrink-0 border border-dashed border-zinc-300 dark:border-zinc-700"></div>
                    {/if}
                    <span class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Slot {slot.index + 1}</span>
                  </div>
                  {#if slot.spoolId}
                    <p class="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{slot.brand ?? ''} {slot.material ?? ''}</p>
                    <p class="text-xs text-zinc-400 dark:text-zinc-600 tabular-nums">{slot.remainingWeight}g left</p>
                  {:else}
                    <p class="text-xs text-zinc-400 dark:text-zinc-600 italic">Empty</p>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Mode tabs -->
        <div class="flex gap-1 p-1 bg-zinc-100 dark:bg-[#111114] rounded-xl mb-6">
          <button
            type="button"
            onclick={() => (mode = 'new')}
            class="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-150
              {mode === 'new'
                ? 'bg-white dark:bg-[#1a1a22] text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}"
          >
            Load New
          </button>
          <button
            type="button"
            onclick={() => (mode = 'existing')}
            class="flex-1 py-2 px-4 rounded-lg text-sm transition-all duration-150
              {mode === 'existing'
                ? 'bg-white dark:bg-[#1a1a22] text-zinc-900 dark:text-zinc-100 shadow-sm font-medium'
                : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}"
          >
            Load Existing
          </button>
        </div>

        <!-- ── Load New ─────────────────────────────────────────────────────── -->
        {#if mode === 'new'}
          {#if orderedSpoolPresets.length > 0}
            <div class="grid grid-cols-2 gap-4">
              {#each orderedSpoolPresets as { preset, suggestion } (preset.id)}
                <button
                  type="button"
                  onclick={() => (selectedPresetId = preset.id)}
                  class="text-left bg-zinc-50 dark:bg-[#111114] hover:bg-zinc-100 dark:hover:bg-[#151518] border-2 rounded-xl p-5 transition-all duration-200
                    {selectedPresetId === preset.id
                      ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/5'
                      : 'border-transparent'}"
                >
                  <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div
                        class="w-4 h-4 rounded-full shrink-0 border border-zinc-200/40 dark:border-white/10"
                        style="background-color: {resolveSpoolColor(preset)}"
                      ></div>
                      <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {preset.brand} {preset.material}
                      </h3>
                    </div>
                    {#if selectedPresetId === preset.id}
                      <div class="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shrink-0 ml-2">
                        <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    {/if}
                  </div>
                  <div class="space-y-1.5 text-sm">
                    <p class="text-zinc-400 dark:text-zinc-500">{preset.color || 'No colour'}</p>
                    <p
                      class="{(preset.in_storage ?? 0) === 0
                        ? 'text-red-500 dark:text-red-400'
                        : (preset.in_storage ?? 0) <= 2
                        ? 'text-amber-500 dark:text-amber-400'
                        : 'text-zinc-400 dark:text-zinc-500'}"
                    >
                      In storage: {preset.in_storage ?? 0}
                    </p>
                    <div
                      class="flex justify-between items-center mt-3 pt-3 border-t border-zinc-200/60 dark:border-[#1a1a22]"
                    >
                      <span class="text-zinc-400 dark:text-zinc-600">Default weight</span>
                      <span class="text-zinc-900 dark:text-zinc-100 font-medium tabular-nums"
                        >{preset.default_weight}g</span
                      >
                    </div>
                    {#if suggestion?.reason}
                      <div
                        class="text-xs text-zinc-400 dark:text-zinc-600 mt-3 pt-3 border-t border-zinc-200/60 dark:border-[#1a1a22]"
                      >
                        {suggestion.reason}
                      </div>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          {:else}
            <div
              class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-10 text-center border border-zinc-100 dark:border-[#1a1a22]"
            >
              <p class="text-zinc-400 dark:text-zinc-600 mb-4">No spool presets available</p>
              <a
                href="/settings"
                class="inline-block bg-blue-500/8 hover:bg-blue-500/15 text-blue-600 dark:text-blue-400 px-5 py-2.5 rounded-xl transition-all duration-200 border border-blue-500/10 hover:border-blue-500/20 font-medium text-sm"
              >
                Create Spool Preset
              </a>
            </div>
          {/if}

        <!-- ── Load Existing ───────────────────────────────────────────────── -->
        {:else}
          {#if spools.length > 0}
            <div class="space-y-2">
              {#each spools as spool (spool.id)}
                {@const s = spool as any}
                <button
                  type="button"
                  onclick={() => (selectedExistingSpoolId = spool.id)}
                  class="w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-150 bg-zinc-50 dark:bg-[#111114] hover:bg-zinc-100 dark:hover:bg-[#151518]
                    {selectedExistingSpoolId === spool.id
                      ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/5'
                      : 'border-transparent'}"
                >
                  <div
                    class="w-4 h-4 rounded-full shrink-0 border border-zinc-200/40 dark:border-white/10 flex-none"
                    style="background-color: {resolveSpoolColor(spool.preset ?? s)}"
                  ></div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {spool.preset?.brand ?? s.brand ?? 'Unknown'} {spool.preset?.material ?? s.material ?? ''} · {spool.preset?.color ?? s.color ?? ''}
                    </p>
                    <p class="text-xs text-zinc-400 dark:text-zinc-500">
                      {spool.remaining_weight}g remaining of {spool.initial_weight}g
                    </p>
                  </div>
                  <div class="text-right shrink-0">
                    <p
                      class="text-xs font-mono tabular-nums {spool.remaining_weight < 100
                        ? 'text-amber-500 dark:text-amber-400'
                        : 'text-zinc-500 dark:text-zinc-400'}"
                    >
                      {spool.remaining_weight}g
                    </p>
                    <p class="text-[10px] text-zinc-400 dark:text-zinc-600">#{spool.id}</p>
                  </div>
                  {#if selectedExistingSpoolId === spool.id}
                    <div class="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shrink-0">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          {:else}
            <div
              class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-10 text-center border border-zinc-100 dark:border-[#1a1a22]"
            >
              <p class="text-zinc-400 dark:text-zinc-600">No open spools available</p>
              <p class="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
                Use "Load New" to open a spool from storage
              </p>
            </div>
          {/if}
        {/if}

      </div>
    </div>

    <!-- Sticky footer -->
    <div
      class="sticky bottom-0 bg-white/80 dark:bg-[#0c0c0f]/80 backdrop-blur-xl border-t border-zinc-200/60 dark:border-[#1a1a22] p-6"
    >
      <div class="flex gap-4">
        <button
          type="button"
          onclick={onClose}
          class="flex-1 bg-transparent border border-zinc-200/80 dark:border-[#1a1a22] hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 px-4 py-3.5 rounded-xl transition-all duration-200"
        >
          Cancel
        </button>

        {#if mode === 'new'}
          <form method="POST" action="?/loadSpool" class="flex-1" use:enhance={loadSpoolEnhance}>
            <input type="hidden" name="printerId" value={printer.id} />
            <input type="hidden" name="slotIndex" value={selectedSlotIndex} />
            {#if selectedPreset}
              <input type="hidden" name="presetId" value={selectedPreset.id} />
              <input type="hidden" name="initialWeight" value={selectedPreset.default_weight} />
            {/if}
            <button
              type="submit"
              disabled={!selectedPresetId}
              class="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {slotCount > 1 ? `Load into Slot ${selectedSlotIndex + 1}` : 'Load Spool'}
            </button>
          </form>
        {:else}
          <form method="POST" action="?/loadExistingSpool" class="flex-1" use:enhance={loadSpoolEnhance}>
            <input type="hidden" name="printerId" value={printer.id} />
            <input type="hidden" name="slotIndex" value={selectedSlotIndex} />
            <input type="hidden" name="spoolId" value={selectedExistingSpoolId ?? ''} />
            <button
              type="submit"
              disabled={!selectedExistingSpoolId}
              class="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {slotCount > 1 ? `Load into Slot ${selectedSlotIndex + 1}` : 'Load Spool'}
            </button>
          </form>
        {/if}
      </div>
    </div>
  </div>
</div>
