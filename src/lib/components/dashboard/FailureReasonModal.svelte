<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { SpoolWithPreset, PrintJobWithDetails } from '$lib/types';
  import { failureReasons } from '$lib/stores/failureReasons';

  /**
   * Modal for recording why a print failed and whether material was consumed.
   * Internal selection state is kept here; the form submission is handled by the
   * completePrintEnhance callback defined in the parent (it must close over parent state).
   */
  export let activePrintJob: PrintJobWithDetails | undefined;
  export let loadedSpool: SpoolWithPreset | null;
  export let onClose: () => void;
  /** enhance callback defined in parent — closes over selectedPrinter and close functions. */
  export let completePrintEnhance: SubmitFunction;

  // Local state — reset automatically when component is destroyed (modal closed)
  // Default the material decision to "used" so a spool failure deducts unless changed.
  let selectedFailureReason = 'deduct';
  let customFailureReason = '';
  let newReason = '';
  let manageMode = false;

  /** Add a typed reason to the persisted list and select it. */
  function addReason() {
    const r = newReason.trim();
    if (!r) return;
    failureReasons.add(r);
    customFailureReason = r;
    newReason = '';
  }
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
                Deduct {activePrintJob.module_weight ?? 0}g from spool
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
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-zinc-400 dark:text-zinc-600">What caused the failure?</p>
          <button
            type="button"
            onclick={() => (manageMode = !manageMode)}
            class="p-1 -m-1 transition-colors {manageMode ? 'text-red-500' : 'text-zinc-300 dark:text-zinc-700 hover:text-zinc-500 dark:hover:text-zinc-500'}"
            aria-label="Manage reasons"
            title="Edit reasons"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
            </svg>
          </button>
        </div>
        <div class="space-y-2">
          {#each $failureReasons as reason}
            {@const selected = customFailureReason === reason}
            <div
              class="group relative w-full bg-zinc-50 dark:bg-[#111114] hover:bg-zinc-100 dark:hover:bg-[#151518] border-2 rounded-xl transition-all duration-200
                     {selected && !manageMode ? 'border-red-500 bg-red-500/5 dark:bg-red-500/5' : 'border-transparent'}"
            >
              <button
                type="button"
                disabled={manageMode}
                onclick={() => (customFailureReason = reason)}
                class="w-full text-left p-4"
              >
                <div class="flex items-center justify-between">
                  <span class="text-zinc-900 dark:text-zinc-100 text-sm">{reason}</span>
                  {#if selected && !manageMode}
                    <div class="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  {/if}
                </div>
              </button>
              {#if manageMode}
                <button
                  type="button"
                  onclick={() => {
                    failureReasons.remove(reason);
                    if (customFailureReason === reason) customFailureReason = '';
                  }}
                  class="absolute top-1/2 right-3 -translate-y-1/2 p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-red-500 transition-colors"
                  aria-label="Remove failure reason"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              {/if}
            </div>
          {/each}

          <!-- Type a new reason — adds it to the list (and remembers it) -->
          <div class="flex gap-2 pt-1">
            <input
              type="text"
              bind:value={newReason}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReason(); } }}
              placeholder="Add a reason…"
              class="flex-1 bg-zinc-50 dark:bg-[#111114] border-2 border-dashed border-zinc-200 dark:border-[#1a1a22] rounded-xl px-4 py-3 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-red-500 transition-colors"
            />
            <button
              type="button"
              onclick={addReason}
              disabled={!newReason.trim()}
              class="px-4 rounded-xl bg-zinc-100 dark:bg-[#151518] hover:bg-zinc-200 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Add failure reason"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

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
              <input type="hidden" name="actualWeight" value={activePrintJob.module_weight ?? 0} />
            {:else}
              <input type="hidden" name="actualWeight" value="0" />
            {/if}

            <!-- Build failure reason string -->
            <input type="hidden" name="failureReason" value={customFailureReason || 'Unknown failure'} />
          {/if}

          <button
            type="submit"
            onclick={() => failureReasons.touch(customFailureReason)}
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
