import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY_FILE_HANDLER = 'printfarm_file_handler_enabled';
const KEY_DIRECT_PRINTER = 'printfarm_direct_printer_enabled';
const KEY_PRINTER_PI = 'printfarm_printer_pi_enabled';

function createBoolStore(key: string, defaultValue = true) {
  const initial = browser
    ? (localStorage.getItem(key) !== null ? localStorage.getItem(key) === 'true' : defaultValue)
    : defaultValue;
  const { subscribe, set } = writable(initial);
  return {
    subscribe,
    toggle() {
      const current = browser
        ? (localStorage.getItem(key) !== null ? localStorage.getItem(key) === 'true' : defaultValue)
        : defaultValue;
      const next = !current;
      if (browser) localStorage.setItem(key, String(next));
      set(next);
    },
    set(value: boolean) {
      if (browser) localStorage.setItem(key, String(value));
      set(value);
    }
  };
}

/** Enable/disable the local file handler (sidecar) health polling and file opening */
export const fileHandlerEnabled = createBoolStore(KEY_FILE_HANDLER);

/** Enable/disable direct MQTT printer connections via Tauri */
export const directPrinterEnabled = createBoolStore(KEY_DIRECT_PRINTER);

/** Enable/disable Raspberry Pi bridge polling */
export const printerPiEnabled = createBoolStore(KEY_PRINTER_PI);
