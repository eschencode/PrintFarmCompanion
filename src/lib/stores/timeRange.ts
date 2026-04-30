import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type TimeRangeKey = 'thisWeek' | 'last7Days' | 'thisMonth' | 'last30Days' | 'last90Days' | 'custom';

const KEY_RANGE  = 'pf_time_range';
const KEY_FROM   = 'pf_custom_from';
const KEY_TO     = 'pf_custom_to';

function createTimeRangeStore() {
  const initial = browser
    ? ((localStorage.getItem(KEY_RANGE) as TimeRangeKey) || 'last30Days')
    : 'last30Days';
  const { subscribe, set } = writable<TimeRangeKey>(initial);
  return {
    subscribe,
    set(value: TimeRangeKey) {
      if (browser) localStorage.setItem(KEY_RANGE, value);
      set(value);
    }
  };
}

function createStringStore(key: string) {
  const initial = browser ? (localStorage.getItem(key) || '') : '';
  const { subscribe, set } = writable(initial);
  return {
    subscribe,
    set(value: string) {
      if (browser) localStorage.setItem(key, value);
      set(value);
    }
  };
}

/** Persistent global time range — controls all charts and breakdowns on the stats page. */
export const selectedTimeRange = createTimeRangeStore();

/** ISO date string (YYYY-MM-DD) for the custom range start. */
export const customFrom = createStringStore(KEY_FROM);

/** ISO date string (YYYY-MM-DD) for the custom range end. */
export const customTo = createStringStore(KEY_TO);

/** Human-readable label for each range key. */
export function timeRangeLabel(key: TimeRangeKey): string {
  switch (key) {
    case 'thisWeek':   return 'This Week';
    case 'last7Days':  return 'Last 7 Days';
    case 'thisMonth':  return 'This Month';
    case 'last30Days': return 'Last 30 Days';
    case 'last90Days': return 'Last 90 Days';
    case 'custom':     return 'Custom';
  }
}
