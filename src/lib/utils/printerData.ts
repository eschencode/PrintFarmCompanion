import type {
  PrintModuleFull,
  DashboardPrinter,
  SpoolWithPreset,
  PrintJobFull,
} from "$lib/types";

type CategorizedModules = {
  compatiblePrintable: PrintModuleFull[];
  compatibleInsufficientMaterial: PrintModuleFull[];
  anySpoolPrintable: PrintModuleFull[];
  anySpoolInsufficientMaterial: PrintModuleFull[];
};

const emptyCategorizedModules: CategorizedModules = {
  compatiblePrintable: [],
  compatibleInsufficientMaterial: [],
  anySpoolPrintable: [],
  anySpoolInsufficientMaterial: [],
};

/** Returns the active (status = 'printing') job for a given printer, or undefined. */
export function getActivePrintJob(
  printerId: number,
  activePrintJobs: PrintJobFull[],
): PrintJobFull | undefined {
  return activePrintJobs.find((job) => job.printer_id === printerId);
}

/**
 * Returns the most recent completed job for a printer.
 * Sorted by created_at descending (jobs have no end_time in the new schema).
 */
export function getLastPrintJob(
  printerId: number,
  printJobs: PrintJobFull[],
): PrintJobFull | null {
  if (!printJobs?.length) return null;
  const completed = printJobs.filter(
    (job) => job.printer_id === printerId && job.status !== "printing",
  );
  if (!completed.length) return null;
  return completed.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
}

/**
 * Categorizes print modules for a given printer/spool combination.
 *
 * Module compatibility rules:
 * 1. If a module requires a specific printer preset (printer_preset_id), it must
 *    match the printer's preset — otherwise excluded.
 * 2. If a module has filament slot requirements (filament_slots), slot 0 must
 *    match the loaded spool's preset_id — otherwise excluded.
 * 3. If a module has no filament slot requirements, it accepts any spool.
 * 4. Modules are split into printable / insufficientMaterial based on spool weight.
 */
export function getCategorizedModules(
  printer: DashboardPrinter,
  loadedSpool: SpoolWithPreset | null,
  printModules: PrintModuleFull[],
): CategorizedModules {
  if (!printer || !loadedSpool) return emptyCategorizedModules;

  const categories: CategorizedModules = { ...emptyCategorizedModules };

  for (const module of printModules) {
    if (!module.active) continue;

    // Filter by printer model (preset)
    if (module.printer_preset_id !== printer.printer_preset_id) continue;

    const hasEnoughMaterial =
      loadedSpool.remaining_weight >= (module.weight ?? 0);

    // Slot 0 spool requirement. spool_preset_id = null on a slot is a wildcard
    // ("any spool"), so it's treated the same as having no slot at all.
    const slot0 = module.filament_slots?.find((s) => s.slot_index === 0);
    const slot0RequiresSpecific = slot0 != null && slot0.spool_preset_id !== null;

    if (slot0RequiresSpecific) {
      if (slot0!.spool_preset_id !== loadedSpool.preset_id) continue;
      if (hasEnoughMaterial) {
        categories.compatiblePrintable.push(module);
      } else {
        categories.compatibleInsufficientMaterial.push(module);
      }
    } else {
      // No requirement OR explicit "any spool" — works with any loaded spool
      if (hasEnoughMaterial) {
        categories.anySpoolPrintable.push(module);
      } else {
        categories.anySpoolInsufficientMaterial.push(module);
      }
    }
  }

  const sortByWeight = (a: PrintModuleFull, b: PrintModuleFull) =>
    (b.weight ?? 0) - (a.weight ?? 0);
  categories.compatiblePrintable.sort(sortByWeight);
  categories.compatibleInsufficientMaterial.sort(sortByWeight);
  categories.anySpoolPrintable.sort(sortByWeight);
  categories.anySpoolInsufficientMaterial.sort(sortByWeight);

  return categories;
}
