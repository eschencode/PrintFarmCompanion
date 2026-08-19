<script lang="ts">
  import { confirmState } from '$lib/stores/confirmDialog';
</script>

{#if $confirmState}
  {@const state = $confirmState}
  <div
    class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    onclick={() => state.resolve(false)}
  >
    <div
      class="bg-white dark:bg-[#141414] border border-zinc-200 dark:border-[#262626] rounded-xl shadow-xl max-w-sm w-full p-5"
      onclick={(e) => e.stopPropagation()}
    >
      <p class="text-sm text-zinc-700 dark:text-zinc-300 mb-4">{state.message}</p>
      <div class="flex justify-end gap-2">
        <button
          onclick={() => state.resolve(false)}
          class="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={() => state.resolve(true)}
          class="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
{/if}
