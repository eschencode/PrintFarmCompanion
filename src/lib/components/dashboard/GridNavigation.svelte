<script lang="ts">
  /** Fixed bottom-center nav shown when multiple grid presets exist. */
  export let allGrids: { name: string }[];
  export let currentGridIndex: number;
  export let onPrev: () => void;
  export let onNext: () => void;
  export let onGoTo: (i: number) => void;
</script>

{#if allGrids.length > 1}
  <!-- Grid Navigation Indicators -->
  <div class="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2">
    <!-- Left Arrow -->
    <button
      onclick={onPrev}
      disabled={currentGridIndex === 0}
      class="p-1.5 rounded-full text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-300 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
      aria-label="Previous grid"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
      </svg>
    </button>

    <!-- Dots -->
    <div class="flex items-center gap-1.5">
      {#each allGrids as grid, i}
        <button
          onclick={() => onGoTo(i)}
          class="w-1.5 h-1.5 rounded-full transition-all duration-300 {i === currentGridIndex ? 'bg-zinc-500 scale-125' : 'bg-zinc-200 dark:bg-[#262626] hover:bg-zinc-300 dark:hover:bg-zinc-600'}"
          aria-label="Go to grid {grid.name}"
        ></button>
      {/each}
    </div>

    <!-- Right Arrow -->
    <button
      onclick={onNext}
      disabled={currentGridIndex === allGrids.length - 1}
      class="p-1.5 rounded-full text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-300 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
      aria-label="Next grid"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
      </svg>
    </button>
  </div>
{/if}
