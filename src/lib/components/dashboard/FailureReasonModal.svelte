<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { Spool, PrintJobExtended } from '$lib/types';

  /**
   * Modal for recording why a print failed and whether material was consumed.
   * Internal selection state is kept here; the form submission is handled by the
   * completePrintEnhance callback defined in the parent (it must close over parent state).
   */
  export let activePrintJob: PrintJobExtended | undefined;
  export let loadedSpool: Spool | null;
  export let onClose: () => void;
  /** enhance callback defined in parent — closes over selectedPrinter and close functions. */
  export let completePrintEnhance: SubmitFunction;

  // Local state — reset automatically when component is destroyed (modal closed)
  let selectedFailureReason = '';
  let customFailureReason = '';
  let showCustomInput = false;

  const failureReasons = [
    'Spaghetti / Layer Adhesion Failure',
    'Werkzeug kopf abgefallen',
    'Filament Runout',
    'Poor quality',
    'Power Outage',
    'Poor First Layer',
    'Stringing / Oozing',
    'Custom'
  ];
</script>

<div
  class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="button"
  tabindex="0"
  aria-label="Close failure reason selector"
>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-panel bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/20"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
  >
    <div class="p-8">
      <!-- Header -->
      <div class="flex justify-between items-start mb-8">
        <div>
          <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">Print Failed</h2>
          <p class="text-sm text-zinc-400 dark:text-zinc-600 mt-1 tracking-wide">What went wrong?</p>
        </div>
        <button
          onclick={onClose}
          class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
          aria-label="Close failure reason selector"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Material Usage Decision -->
      {#if loadedSpool && activePrintJob}
        <div class="mb-8 bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
          <p class="text-sm text-zinc-400 dark:text-zinc-600 mb-4">Did the print consume material before failing?</p>
          <div class="grid grid-cols-2 gap-4">
            <button
              type="button"
              onclick={() => selectedFailureReason = 'deduct'}
              class="text-left bg-zinc-100 dark:bg-[#0c0c0f] hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50 border-2 rounded-xl p-4 transition-all duration-200
                     {selectedFailureReason === 'deduct' ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/5' : 'border-transparent'}"
            >
              <div class="flex items-start justify-between mb-2">
                <span class="text-zinc-900 dark:text-zinc-100 text-sm font-medium">Yes, Material Used</span>
                {#if selectedFailureReason === 'deduct'}
                  <div class="w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                {/if}
              </div>
              <p class="text-xs text-zinc-400 dark:text-zinc-600 tabular-nums">
                Deduct {activePrintJob.expected_weight}g from spool
              </p>
            </button>

            <button
              type="button"
              onclick={() => selectedFailureReason = 'keep'}
              class="text-left bg-zinc-100 dark:bg-[#0c0c0f] hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50 border-2 rounded-xl p-4 transition-all duration-200
                     {selectedFailureReason === 'keep' ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/5' : 'border-transparent'}"
            >
              <div class="flex items-start justify-between mb-2">
                <span class="text-zinc-900 dark:text-zinc-100 text-sm font-medium">No, Keep Weight</span>
                {#if selectedFailureReason === 'keep'}
                  <div class="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                {/if}
              </div>
              <p class="text-xs text-zinc-400 dark:text-zinc-600 tabular-nums">
                Spool stays at {loadedSpool.remaining_weight}g
              </p>
            </button>
          </div>
        </div>
      {/if}

      <!-- Failure Reasons List -->
      <div class="mb-6">
        <p class="text-sm text-zinc-400 dark:text-zinc-600 mb-4">What caused the failure?</p>
        <div class="space-y-2">
          {#each failureReasons as reason}
            <button
              type="button"
              onclick={() => {
                if (reason === 'Custom') {
                  showCustomInput = true;
                  customFailureReason = '';
                } else {
                  showCustomInput = false;
                  customFailureReason = reason;
                }
              }}
              class="w-full text-left bg-zinc-50 dark:bg-[#111114] hover:bg-zinc-100 dark:hover:bg-[#151518] border-2 rounded-xl p-4 transition-all duration-200
                     {(customFailureReason === reason && !showCustomInput) || (reason === 'Custom' && showCustomInput) ? 'border-red-500 bg-red-500/5 dark:bg-red-500/5' : 'border-transparent'}"
            >
              <div class="flex items-center justify-between">
                <span class="text-zinc-900 dark:text-zinc-100 text-sm">{reason}</span>
                {#if (customFailureReason === reason && !showCustomInput) || (reason === 'Custom' && showCustomInput)}
                  <div class="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Custom input -->
      {#if showCustomInput}
        <div class="mb-8 p-5 bg-zinc-50 dark:bg-[#111114] rounded-xl border border-zinc-100 dark:border-[#1a1a22]">
          <label for="customReason" class="block text-sm text-zinc-400 dark:text-zinc-600 mb-2">
            Enter custom failure reason:
          </label>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            id="customReason"
            type="text"
            bind:value={customFailureReason}
            placeholder="e.g., User cancelled, Testing issue..."
            class="w-full bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl px-4 py-3 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-zinc-100/20 transition-shadow"
            autofocus
          />
        </div>
      {/if}

      <!-- Action Buttons -->
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
          action="?/completePrint"
          class="flex-1"
          use:enhance={completePrintEnhance}
        >
          {#if activePrintJob}
            <input type="hidden" name="jobId" value={activePrintJob.id} />
            <input type="hidden" name="success" value="false" />

            <!-- Determine actual weight based on user choice -->
            {#if selectedFailureReason === 'deduct'}
              <input type="hidden" name="actualWeight" value={activePrintJob.expected_weight} />
            {:else}
              <input type="hidden" name="actualWeight" value="0" />
            {/if}

            <!-- Build failure reason string -->
            <input type="hidden" name="failureReason" value={customFailureReason || 'Unknown failure'} />
          {/if}

          <button
            type="submit"
            disabled={!selectedFailureReason || !customFailureReason}
            class="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-3.5 rounded-xl transition-all duration-200 font-medium
                   disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Confirm Print Failed
          </button>
        </form>
      </div>
    </div>
  </div>
</div>
