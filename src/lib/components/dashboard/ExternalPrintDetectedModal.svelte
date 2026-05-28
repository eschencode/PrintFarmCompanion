<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';

  /** A print the Pi reports that we aren't tracking — surfaced for the user to confirm. */
  export let detected: {
    printer_id: number;
    task_id: string;
    gcode_file: string | null;
    suggested_module_id: number | null;
    suggested_module_name: string | null;
  };
  export let printerName: string;
  /** Dismiss without adding (won't ask again for this task this session). */
  export let onClose: () => void;
  /** enhance callback defined in parent — closes the modal + invalidateAll on success. */
  export let confirmEnhance: SubmitFunction;
</script>

<div
  class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="button"
  tabindex="0"
  aria-label="Dismiss detected print"
>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-panel bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-2xl max-w-md w-full shadow-2xl shadow-black/20"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
  >
    <div class="p-8">
      <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">Print detected</h2>
      <p class="text-sm text-zinc-400 dark:text-zinc-600 mt-1 tracking-wide">
        A print was started directly on <span class="text-zinc-600 dark:text-zinc-300">{printerName}</span>.
      </p>

      <div class="mt-6 bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22] space-y-2">
        {#if detected.gcode_file}
          <p class="text-xs text-zinc-400 dark:text-zinc-600">File</p>
          <p class="text-sm text-zinc-900 dark:text-zinc-100 break-all font-mono">{detected.gcode_file}</p>
        {/if}
        {#if detected.suggested_module_name}
          <p class="text-sm text-zinc-600 dark:text-zinc-400">
            Matched module: <span class="text-zinc-900 dark:text-zinc-100">{detected.suggested_module_name}</span>
          </p>
        {:else}
          <p class="text-sm text-amber-600 dark:text-amber-500">No matching module — it'll be added without one.</p>
        {/if}
      </div>

      <div class="flex gap-4 mt-8">
        <button
          type="button"
          onclick={onClose}
          class="flex-1 bg-transparent border border-zinc-200/80 dark:border-[#1a1a22] hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 px-4 py-3.5 rounded-xl transition-all duration-200"
        >
          Dismiss
        </button>
        <form method="POST" action="?/confirmExternalPrint" class="flex-1" use:enhance={confirmEnhance}>
          <input type="hidden" name="printerId" value={detected.printer_id} />
          <input type="hidden" name="taskId" value={detected.task_id} />
          {#if detected.suggested_module_id}
            <input type="hidden" name="moduleId" value={detected.suggested_module_id} />
          {/if}
          <button
            type="submit"
            class="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium"
          >
            Add to dashboard
          </button>
        </form>
      </div>
    </div>
  </div>
</div>
