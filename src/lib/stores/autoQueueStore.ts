import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY_QUICK_START = 'printfarm_quick_start_mode';

function createBoolStore(key: string) {
  const initial = browser ? localStorage.getItem(key) === 'true' : false;
  const { subscribe, set } = writable(initial);
  return {
    subscribe,
    toggle() {
      const next = !(browser ? localStorage.getItem(key) === 'true' : false);
      if (browser) localStorage.setItem(key, String(next));
      set(next);
    },
    set(value: boolean) {
      if (browser) localStorage.setItem(key, String(value));
      set(value);
    }
  };
}

/** Show single Quick Start button when clicking a Pi-connected printer */
export const quickStartMode = createBoolStore(KEY_QUICK_START);
