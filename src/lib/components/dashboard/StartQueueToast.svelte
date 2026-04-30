<script lang="ts">
  /** Toast shown while multiple printers are being started sequentially. */
  export let startQueueTotal: number;
</script>

<!-- ── Start Queue Toast (when > 1 printer queued) ───────────────────────── -->
<div class="fixed bottom-6 left-6 z-[60] bg-zinc-900 dark:bg-[#111] border border-zinc-700 dark:border-[#2a2a2a] rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-3 max-w-xs">
  <div class="w-2 h-2 bg-amber-400 rounded-full animate-pulse shrink-0"></div>
  <div>
    <p class="text-xs text-zinc-400 uppercase tracking-widest">Print Queue</p>
    <p class="text-sm font-medium text-zinc-100">Starting {startQueueTotal} printers sequentially</p>
    <p class="text-xs text-zinc-500 mt-0.5">Next starts when current reaches RUNNING</p>
  </div>
</div>
