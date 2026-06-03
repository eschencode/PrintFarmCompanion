<script lang="ts">
  import { quickStartMode } from '$lib/stores/autoQueueStore';

  /**
   * Settings section for Quick Start Mode (single-tap start flow).
   * Reads and writes directly to a persistent localStorage-backed store.
   */
  $: qsMode = $quickStartMode;
</script>

<div id="auto-queue" class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-10">
  <div class="px-5 py-4 border-b border-zinc-50 dark:border-[#1a1a1a]">
    <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Quick Start</p>
    <p class="text-xs text-zinc-400 mt-1">Single-tap start flow for Pi-connected printers</p>
  </div>
  <div class="p-5 space-y-5">
    <!-- Quick Start Mode -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Quick Start Mode</p>
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">When clicking a printer, show a single start button with the next recommended print and spool info instead of the manual flow</p>
      </div>
      <button
        type="button"
        onclick={() => quickStartMode.toggle()}
        class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors {qsMode ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}"
        role="switch"
        aria-checked={qsMode}
        aria-label="Toggle Quick Start Mode"
      >
        <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform {qsMode ? 'translate-x-6' : 'translate-x-1'}"></span>
      </button>
    </div>
  </div>
</div>
