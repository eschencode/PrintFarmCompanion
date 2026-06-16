import type { HmsEntry } from '$lib/types';

/**
 * Bambu Health-Management-System (HMS) decoding.
 *
 * Each raw entry is two 32-bit ints (`attr`, `code`). Bambu's canonical HMS
 * code string concatenates them as four 16-bit hex groups:
 *   ATTR_HI_ATTR_LO_CODE_HI_CODE_LO   e.g. "0300_0100_0002_0001"
 * The high 16 bits of `code` encode severity (1 fatal … 4 info).
 *
 * We decode on the client (not the Pi) so the message table can grow without
 * redeploying the bridge. Unknown codes fall back to a generic message plus a
 * link to Bambu's wiki, which is keyed by the same code string.
 */

export type HmsSeverity = 'fatal' | 'serious' | 'common' | 'info';

export interface DecodedHms {
  /** Canonical code, e.g. "0300_0100_0002_0001". */
  code: string;
  severity: HmsSeverity;
  /** Human-readable message (known) or a generic fallback (unknown). */
  text: string;
  /** Bambu wiki page for this code. */
  wikiUrl: string;
}

const SEVERITY_BY_BITS: Record<number, HmsSeverity> = {
  1: 'fatal',
  2: 'serious',
  3: 'common',
  4: 'info',
};

/** Sort weight — higher means more urgent (use for ordering/badges). */
export const HMS_SEVERITY_RANK: Record<HmsSeverity, number> = {
  fatal: 3,
  serious: 2,
  common: 1,
  info: 0,
};

// Known messages keyed by canonical code. Extend as new codes are seen in logs.
// Sources: Bambu wiki + community HMS lists. Keep entries terse and actionable.
const KNOWN: Record<string, string> = {
  '0300_0100_0001_0001': 'Nozzle temperature is abnormal — heating may have failed.',
  '0300_0200_0001_0001': 'Heatbed temperature is abnormal — heating may have failed.',
  '0700_8000_0001_0001': 'Filament has run out — load new filament.',
  '0700_2000_0002_0001': 'AMS filament ran out during print.',
  '0700_4000_0002_0003': 'Filament may be tangled or the spool is stuck.',
  '0C00_0100_0001_0001': 'First-layer inspection found a problem.',
  '1200_8000_0002_0001': 'Front cover / door is open.',
  '0500_0200_0002_0002': 'AMS humidity is high — dry the filament.',
};

function group(n: number, shift: number): string {
  return ((n >> shift) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

function toCode(entry: HmsEntry): string {
  return `${group(entry.attr, 16)}_${group(entry.attr, 0)}_${group(entry.code, 16)}_${group(entry.code, 0)}`;
}

function decodeOne(entry: HmsEntry): DecodedHms {
  const code = toCode(entry);
  const severity = SEVERITY_BY_BITS[(entry.code >> 16) & 0xffff] ?? 'common';
  return {
    code,
    severity,
    text: KNOWN[code] ?? `Printer reported issue ${code}.`,
    wikiUrl: `https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/${code}`,
  };
}

/** Decode a raw HMS array into sorted, human-readable alerts (most urgent first). */
export function decodeHms(entries: HmsEntry[] | null | undefined): DecodedHms[] {
  if (!entries?.length) return [];
  return entries
    .filter((e) => e && typeof e.attr === 'number' && typeof e.code === 'number')
    .map(decodeOne)
    .sort((a, b) => HMS_SEVERITY_RANK[b.severity] - HMS_SEVERITY_RANK[a.severity]);
}

/** True if any entry is an actual problem (anything above info level). */
export function hasActiveAlerts(entries: HmsEntry[] | null | undefined): boolean {
  return decodeHms(entries).some((d) => d.severity !== 'info');
}
