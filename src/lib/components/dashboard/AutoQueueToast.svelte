<script lang="ts">
  /** Toast shown when auto-start countdown is active after a print completes. */
  export let countdown: { seconds: number; moduleName: string; printer: { name: string } };
  export let onCancel: () => void;
</script>

<!-- ── Auto Queue Countdown Toast ───────────────────────────────────────── -->
<div class="fixed bottom-6 right-6 z-[60] bg-zinc-900 dark:bg-[#111] border border-zinc-700 dark:border-[#2a2a2a] rounded-2xl shadow-2xl p-5 flex items-center gap-5 max-w-sm w-full">
  <!-- Countdown ring -->
  <div class="relative w-12 h-12 shrink-0 flex items-center justify-center">
    <svg class="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="20" fill="none" stroke="#27272a" stroke-width="3" />
      <circle cx="24" cy="24" r="20" fill="none" stroke="#10b981" stroke-width="3"
        stroke-dasharray="{2 * Math.PI * 20}"
        stroke-dashoffset="{2 * Math.PI * 20 * (1 - countdown.seconds / 5)}"
        stroke-linecap="round"
        style="transition: stroke-dashoffset 0.9s linear"
      />
    </svg>
    <span class="absolute text-base font-semibold text-emerald-400 tabular-nums">{countdown.seconds}</span>
  </div>
  <div class="flex-1 min-w-0">
    <p class="text-xs text-zinc-400 uppercase tracking-widest mb-0.5">Auto Start</p>
    <p class="text-sm font-medium text-zinc-100 truncate">{countdown.moduleName}</p>
    <p class="text-xs text-zinc-500 mt-0.5">{countdown.printer.name}</p>
  </div>
  <button
    onclick={onCancel}
    class="text-xs text-zinc-400 hover:text-zinc-100 transition-colors px-3 py-2 rounded-lg hover:bg-zinc-800 shrink-0"
  >
    Cancel
  </button>
</div>
