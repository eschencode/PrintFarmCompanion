<script lang="ts">
  import { selectedTimeRange, customFrom, customTo, timeRangeLabel } from '$lib/stores/timeRange';
  import type { TimeRangeKey } from '$lib/stores/timeRange';

  /**
   * Prominent time range selector shown at the top of the stats page.
   * Writes to the persistent selectedTimeRange store — all stats sections
   * react to this store, so a single selection updates everything at once.
   */

  const RANGES: TimeRangeKey[] = ['thisWeek', 'last7Days', 'thisMonth', 'last30Days', 'last90Days', 'custom'];

  function select(r: TimeRangeKey) {
    selectedTimeRange.set(r);
  }
</script>

<div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl p-4 mb-6">
  <div class="flex flex-col sm:flex-row sm:items-center gap-3">
    <!-- Range pills -->
    <div class="flex flex-wrap gap-1.5 flex-1">
      {#each RANGES as range}
        <button
          type="button"
          onclick={() => select(range)}
          class="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150
                 {$selectedTimeRange === range
                   ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                   : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'}"
        >
          {timeRangeLabel(range)}
        </button>
      {/each}
    </div>

    <!-- Custom date inputs — only shown when Custom is selected -->
    {#if $selectedTimeRange === 'custom'}
      <div class="flex items-center gap-2 text-sm">
        <input
          type="date"
          value={$customFrom}
          onchange={(e) => customFrom.set((e.currentTarget as HTMLInputElement).value)}
          class="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-[#262626] bg-white dark:bg-[#0c0c0f] text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
        />
        <span class="text-zinc-400">–</span>
        <input
          type="date"
          value={$customTo}
          onchange={(e) => customTo.set((e.currentTarget as HTMLInputElement).value)}
          class="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-[#262626] bg-white dark:bg-[#0c0c0f] text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
        />
      </div>
    {/if}
  </div>
</div>
