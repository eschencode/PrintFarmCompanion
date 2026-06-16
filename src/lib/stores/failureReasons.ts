import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY = 'printfarm_failure_reasons';

/** Built-in failure reasons, shown unless the user has hidden them. */
export const DEFAULT_FAILURE_REASONS = [
  'Spaghetti / Layer Adhesion Failure',
  'Werkzeug kopf abgefallen',
  'Filament Runout',
  'Poor quality',
  'Power Outage',
  'Poor First Layer',
  'Stringing / Oozing',
];

interface State {
  /** User-added reasons. */
  custom: string[];
  /** Reasons (default or custom) the user removed. */
  hidden: string[];
  /** Most-recently-selected first; drives sort order. */
  order: string[];
}

function load(): State {
  const empty: State = { custom: [], hidden: [], order: [] };
  if (!browser) return empty;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    // Migrate old format (a plain array of custom reasons).
    if (Array.isArray(parsed)) return { ...empty, custom: parsed.filter((r) => typeof r === 'string') };
    return {
      custom: Array.isArray(parsed.custom) ? parsed.custom.filter((r: unknown) => typeof r === 'string') : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((r: unknown) => typeof r === 'string') : [],
      order: Array.isArray(parsed.order) ? parsed.order.filter((r: unknown) => typeof r === 'string') : [],
    };
  } catch {
    return empty;
  }
}

/** Visible reasons, sorted most-recently-selected first; unselected keep default order. */
function visible(s: State): string[] {
  const all = [...DEFAULT_FAILURE_REASONS, ...s.custom.filter((r) => !DEFAULT_FAILURE_REASONS.includes(r))];
  const rank = (r: string) => {
    const i = s.order.indexOf(r);
    return i === -1 ? Infinity : i;
  };
  // Array.sort is stable, so equal-rank items keep their original order.
  return all.filter((r) => !s.hidden.includes(r)).sort((a, b) => rank(a) - rank(b));
}

function createFailureReasonsStore() {
  let state = load();
  const { subscribe, set } = writable<string[]>(visible(state));

  function commit() {
    if (browser) localStorage.setItem(KEY, JSON.stringify(state));
    set(visible(state));
  }

  return {
    subscribe,
    /** Add a reason (un-hides if it was hidden) and float it to the top. */
    add(reason: string) {
      const r = reason.trim();
      if (!r) return;
      state.hidden = state.hidden.filter((x) => x !== r);
      if (!DEFAULT_FAILURE_REASONS.includes(r) && !state.custom.includes(r)) state.custom = [...state.custom, r];
      this.touch(r);
    },
    /** Record a reason as just-used so it sorts to the top next time. */
    touch(reason: string) {
      const r = reason.trim();
      if (!r) return;
      state.order = [r, ...state.order.filter((x) => x !== r)];
      commit();
    },
    /** Hide a reason from the list (works for defaults and custom alike). */
    remove(reason: string) {
      state.custom = state.custom.filter((x) => x !== reason);
      state.order = state.order.filter((x) => x !== reason);
      if (!state.hidden.includes(reason)) state.hidden = [...state.hidden, reason];
      commit();
    },
  };
}

/** Failure reasons (defaults + user-added), recency-sorted, persisted to localStorage. */
export const failureReasons = createFailureReasonsStore();
