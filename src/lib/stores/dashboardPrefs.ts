import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/** How a printing printer's card is visually treated on the dashboard. */
export type PrintingEffect = 'solid' | 'aurora' | 'breathing' | 'progress' | 'scan';

const KEY = 'printfarm_printing_effect';
const DEFAULT: PrintingEffect = 'aurora';
const VALID: PrintingEffect[] = ['solid', 'aurora', 'breathing', 'progress', 'scan'];

function createEffectStore() {
  const stored = browser ? localStorage.getItem(KEY) : null;
  const initial = stored && VALID.includes(stored as PrintingEffect) ? (stored as PrintingEffect) : DEFAULT;
  const { subscribe, set } = writable<PrintingEffect>(initial);
  return {
    subscribe,
    set(value: PrintingEffect) {
      if (browser) localStorage.setItem(KEY, value);
      set(value);
    },
  };
}

/** Selected printing-card effect, persisted to localStorage. */
export const printingEffect = createEffectStore();
