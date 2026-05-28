<script lang="ts">
  import { resolveSpoolColor } from '$lib/utils/spoolColor';
  import type { DashboardPrinter, SpoolWithPreset, PrintModuleFull, PrinterQueuedJob } from '$lib/types';

  /**
   * Single-tap print start flow. Shows the top recommended print for the loaded spool
   * and lets the user start it with one button. Falls back to a "Manual mode" link
   * when no recommendation is available.
   */
  export let printer: DashboardPrinter;
  export let loadedSpool: SpoolWithPreset | null;
  export let nextPrint: (PrinterQueuedJob & { module_name?: string }) | null;
  export let nextModule: PrintModuleFull | null;
  export let quickStartLoading: boolean;
  /** Set of printer IDs currently being sent to their printers — used for disabled/loading state. */
  export let startingPrinterIds: Set<number>;
  export let onClose: () => void;
  export let onLoadSpool: () => void;
  export let onSwitchToManual: () => void;
  export let onEnqueue: (module: PrintModuleFull, printer: DashboardPrinter) => void;
</script>

<div
  class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6 cursor-default"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="button" tabindex="0" aria-label="Close modal (press Escape)"
>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-panel bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-2xl max-w-md w-full shadow-2xl shadow-black/20"
    onclick={(e) => e.stopPropagation()}
    role="dialog" aria-modal="true"
  >
    <div class="p-8">
      <!-- Header -->
      <div class="flex justify-between items-start mb-6">
        <div>
          <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">{printer.name}</h2>
          <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-1 uppercase tracking-widest">Quick Start</p>
        </div>
        <button
          onclick={onClose}
          class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
          aria-label="Close modal"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {#if quickStartLoading}
        <!-- Loading spinner -->
        <div class="flex flex-col items-center justify-center py-12 gap-4">
          <svg class="w-8 h-8 text-zinc-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <p class="text-sm text-zinc-400">Finding recommended print…</p>
        </div>

      {:else if !loadedSpool}
        <!-- No spool loaded -->
        <div class="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 mb-6">
          <p class="text-sm font-medium text-amber-600 dark:text-amber-400">No spool loaded</p>
          <p class="text-xs text-zinc-400 mt-1">Load a spool before starting a print.</p>
        </div>
        <button
          onclick={onLoadSpool}
          class="w-full py-3.5 rounded-xl bg-blue-500/8 hover:bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium border border-blue-500/10 hover:border-blue-500/20 transition-all"
        >
          Load Spool
        </button>

      {:else if nextPrint && nextModule}
        <!-- Spool info -->
        <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-4 border border-zinc-100 dark:border-[#1a1a22] mb-4">
          <p class="text-[10px] uppercase tracking-widest text-zinc-400 mb-2">Loaded Spool</p>
          <div class="flex items-center gap-3">
            <div class="w-3 h-3 rounded-full shrink-0" style="background-color: {resolveSpoolColor(loadedSpool.preset)}"></div>
            <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100">{loadedSpool.preset?.brand ?? ''} {loadedSpool.preset?.material ?? ''}</span>
            <span class="ml-auto text-xs text-zinc-400 tabular-nums">{loadedSpool.remaining_weight}g left</span>
          </div>
        </div>

        <!-- Next print card (big start button) -->
        <button
          type="button"
          disabled={startingPrinterIds.has(Number(printer.id))}

          onclick={() => onEnqueue(nextModule, printer)}
          class="w-full text-left bg-emerald-500/5 border-2 border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/40 rounded-2xl p-6 mb-4 transition-all duration-200 disabled:opacity-50 group"
        >
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 flex items-center justify-center shrink-0 transition-colors">
              <svg class="w-6 h-6 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[10px] uppercase tracking-widest text-zinc-400 mb-1">
                {startingPrinterIds.has(Number(printer.id)) ? 'Starting…' : 'Start Next Print'}
              </p>
              <p class="text-lg font-medium text-zinc-900 dark:text-zinc-50 leading-snug truncate">{nextPrint.module_name ?? `Module #${nextPrint.module_id}`}</p>
              <div class="flex items-center gap-2 mt-1.5">
                <span class="text-xs text-zinc-400 tabular-nums">{nextModule?.weight ?? '—'}g</span>
                {#if (nextPrint as any).priority}
                  <span class="text-xs px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{(nextPrint as any).priority}</span>
                {/if}
              </div>
            </div>
          </div>
        </button>

      {:else}
        <!-- No recommended print available -->
        <div class="text-center py-10">
          <p class="text-sm text-zinc-400">No recommended prints available.</p>
          <p class="text-xs text-zinc-500 mt-1">Add inventory items and spool presets to get recommendations.</p>
        </div>
      {/if}

      <!-- Manual mode link -->
      <button
        type="button"
        onclick={onSwitchToManual}
        class="w-full text-center text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors py-1 mt-1"
      >
        Manual mode →
      </button>
    </div>
  </div>
</div>
