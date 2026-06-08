import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/** How a printing printer's card is visually treated on the dashboard. */
export type PrintingEffect = 'solid' | 'aurora' | 'breathing' | 'progress' | 'scan';

const EFFECT_KEY = 'printfarm_printing_effect';
const EFFECT_DEFAULT: PrintingEffect = 'aurora';
const EFFECT_VALID: PrintingEffect[] = ['solid', 'aurora', 'breathing', 'progress', 'scan'];

function createEffectStore() {
  const stored = browser ? localStorage.getItem(EFFECT_KEY) : null;
  const initial = stored && EFFECT_VALID.includes(stored as PrintingEffect) ? (stored as PrintingEffect) : EFFECT_DEFAULT;
  const { subscribe, set } = writable<PrintingEffect>(initial);
  return {
    subscribe,
    set(value: PrintingEffect) {
      if (browser) localStorage.setItem(EFFECT_KEY, value);
      set(value);
    },
  };
}

/** Selected printing-card effect, persisted to localStorage. */
export const printingEffect = createEffectStore();

// ── Per-status card colours ─────────────────────────────────────────────────

export type CardStatus = 'idle' | 'starting' | 'printing' | 'finished' | 'inactive';
export interface StateColor {
  /** Hex colour, e.g. "#10b981". */
  color: string;
  /** Whether the tint/effect is shown for this status. */
  enabled: boolean;
}
export type StateColors = Record<CardStatus, StateColor>;

const COLORS_KEY = 'printfarm_state_colors';

export const DEFAULT_STATE_COLORS: StateColors = {
  idle: { color: '#10b981', enabled: false },
  starting: { color: '#f59e0b', enabled: true },
  printing: { color: '#10b981', enabled: true },
  finished: { color: '#8b5cf6', enabled: true },
  inactive: { color: '#ef4444', enabled: true },
};

function createStateColorsStore() {
  let initial: StateColors = { ...DEFAULT_STATE_COLORS };
  if (browser) {
    try {
      const raw = localStorage.getItem(COLORS_KEY);
      if (raw) initial = { ...DEFAULT_STATE_COLORS, ...JSON.parse(raw) };
    } catch {
      /* corrupt value — fall back to defaults */
    }
  }
  const { subscribe, set, update } = writable<StateColors>(initial);
  return {
    subscribe,
    setStatus(status: CardStatus, patch: Partial<StateColor>) {
      update((curr) => {
        const next = { ...curr, [status]: { ...curr[status], ...patch } };
        if (browser) localStorage.setItem(COLORS_KEY, JSON.stringify(next));
        return next;
      });
    },
    reset() {
      if (browser) localStorage.setItem(COLORS_KEY, JSON.stringify(DEFAULT_STATE_COLORS));
      set({ ...DEFAULT_STATE_COLORS });
    },
  };
}

/** Per-status card colours, persisted to localStorage. */
export const stateColors = createStateColorsStore();

/** Convert "#rrggbb" (or "#rgb") to an "r, g, b" string for use in rgba(). */
export function hexToRgb(hex: string): string {
  let h = (hex ?? '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return '113, 113, 122';
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
