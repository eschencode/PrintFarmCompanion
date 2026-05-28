import type { SpoolPreset } from '$lib/types';

const DEFAULT_SPOOL_COLOR = '#9ca3af'; // zinc-400

/** True for valid hex colours like "#fff", "#1a1a1a", "abc123". */
function isHex(value: string): boolean {
  return /^#?[0-9a-fA-F]{3,8}$/.test(value.trim());
}

/**
 * Resolve the best CSS colour for a spool preset's visualisation.
 * Priority: explicit `color_hex` → a `color` that's already a valid hex →
 * a `color` that's a CSS colour keyword → grey fallback.
 *
 * `color` is the human-readable name ("Galaxy Black"); only use it as a CSS
 * value when it actually parses (a plain "black"/"red" keyword still works,
 * but "Galaxy Black" does not — hence the fallback).
 */
export function resolveSpoolColor(
  preset: { color_hex?: string | null; color?: string | null } | null | undefined,
): string {
  if (!preset) return DEFAULT_SPOOL_COLOR;

  if (preset.color_hex && isHex(preset.color_hex)) {
    return preset.color_hex.startsWith('#') ? preset.color_hex : `#${preset.color_hex}`;
  }

  const name = preset.color?.trim();
  if (name) {
    if (isHex(name)) return name.startsWith('#') ? name : `#${name}`;
    // Single-word keyword (e.g. "black", "red") — let CSS handle it.
    if (/^[a-zA-Z]+$/.test(name)) return name.toLowerCase();
  }

  return DEFAULT_SPOOL_COLOR;
}
