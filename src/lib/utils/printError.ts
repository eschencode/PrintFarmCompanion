/**
 * Bambu `print_error` interpretation.
 *
 * Separate from HMS (see $lib/utils/hms): `print_error` is a single 32-bit code
 * describing the current/last print's error, reported live over direct MQTT.
 * We format it as Bambu's grouped hex (`XXXX_XXXX`), map known codes to a
 * message, and always provide the code + a wiki link for lookup.
 */

export interface DecodedPrintError {
  /** Raw integer as reported. */
  code: number;
  /** 8-digit uppercase hex, e.g. "05004003". */
  hex: string;
  /** Bambu grouped form, e.g. "0500_4003". */
  grouped: string;
  /** Human-readable message (known) or a generic fallback with the code. */
  text: string;
  /** Bambu wiki lookup for this code (best-effort — may 404 for rare codes). */
  wikiUrl: string;
}

// Known messages keyed by 8-hex code (uppercase, no 0x). Extend as codes appear
// in the Logs (category "Print"). Keep terse and actionable — don't guess.
const KNOWN: Record<string, string> = {
  // '05004003': '…',
};

/** Decode a `print_error` value. Returns null for 0 / missing (no error). */
export function decodePrintError(
  code: number | null | undefined,
): DecodedPrintError | null {
  if (!code) return null;
  const hex = (code >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const grouped = `${hex.slice(0, 4)}_${hex.slice(4)}`;
  return {
    code,
    hex,
    grouped,
    text:
      KNOWN[hex] ??
      `Printer reported error ${grouped}. Check the printer's screen for details.`,
    wikiUrl: `https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/${grouped}`,
  };
}
