import { writable } from 'svelte/store';

// Tauri's WebView doesn't implement window.confirm(), so every "Delete X?"
// button silently no-ops on desktop. This replaces confirm() with an in-app
// modal that works on both web and desktop.
type ConfirmState = { message: string; resolve: (ok: boolean) => void } | null;

export const confirmState = writable<ConfirmState>(null);

export function confirmAsync(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState.set({
      message,
      resolve: (ok) => {
        confirmState.set(null);
        resolve(ok);
      },
    });
  });
}
