<script lang="ts">
  /** Shown when starting a print fails (Pi unreachable, printer offline, ...). */
  export let printer: string;
  export let message: string;
  export let onDismiss: () => void;
</script>

<!-- ── Start Error Toast ─────────────────────────────────────────────────── -->
<div class="fixed bottom-6 left-6 z-[70] bg-zinc-900 dark:bg-[#111] border border-red-500/40 rounded-2xl shadow-2xl px-5 py-4 flex items-start gap-3 max-w-sm">
  <div class="w-2 h-2 bg-red-500 rounded-full shrink-0 mt-1.5"></div>
  <div class="min-w-0">
    <p class="text-xs text-red-400 uppercase tracking-widest">Couldn't start print</p>
    <p class="text-sm font-medium text-zinc-100">{printer}</p>
    <p class="text-xs text-zinc-400 mt-0.5 break-words">{message}</p>
  </div>
  <button
    onclick={onDismiss}
    aria-label="Dismiss"
    class="text-zinc-500 hover:text-zinc-200 transition-colors shrink-0 -mt-1 -mr-1 p-1"
  >
    ✕
  </button>
</div>
