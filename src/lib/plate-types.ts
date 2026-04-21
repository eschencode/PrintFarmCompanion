/**
 * Bambu Lab plate type IDs → human-readable labels.
 * The raw values come from plate_1.json (bed_type) or project_settings.config.
 */
const PLATE_LABELS: Record<string, string> = {
  cool_plate:          'Cool Plate',
  textured_pei_plate:  'Textured PEI',
  high_temp_plate:     'High Temp Plate',
  engineering_plate:   'Engineering Plate',
  supertack_plate:     'Supertrack Plate',
  // aliases seen in the wild
  hot_plate:           'High Temp Plate',
  pei_plate:           'Smooth PEI',
};

/** Map a raw Bambu plate ID/name to a human-readable label. Returns the input unchanged if unknown. */
export function normalizePlateType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return PLATE_LABELS[trimmed.toLowerCase()] ?? trimmed;
}
