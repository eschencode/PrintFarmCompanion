import type { PrintModule, Printer, Spool, PrintJobExtended } from '$lib/types';

type CategorizedModules = {
  compatiblePrintable: PrintModule[];
  compatibleInsufficientMaterial: PrintModule[];
  anySpoolPrintable: PrintModule[];
  anySpoolInsufficientMaterial: PrintModule[];
};

const emptyCategorizedModules: CategorizedModules = {
  compatiblePrintable: [],
  compatibleInsufficientMaterial: [],
  anySpoolPrintable: [],
  anySpoolInsufficientMaterial: []
};

/** Returns the active (status = 'printing') job for a given printer, or undefined. */
export function getActivePrintJob(printerId: number, activePrintJobs: PrintJobExtended[]): PrintJobExtended | undefined {
  return activePrintJobs.find(job => job.printer_id === printerId);
}

/** Returns the loaded spool for a given spool ID, or null if none. */
export function getLoadedSpool(spoolId: number | null | undefined, spools: Spool[]): Spool | null {
  if (!spoolId) return null;
  return spools.find(s => s.id === spoolId) ?? null;
}

/** Returns the most recent completed job for a printer, sorted by end_time descending. */
export function getLastPrintJob(printerId: number, printJobs: PrintJobExtended[]): PrintJobExtended | null {
  if (!printJobs || printJobs.length === 0) return null;
  const completed = printJobs.filter(job =>
    job.printer_id === printerId && job.status !== 'printing'
  );
  if (completed.length === 0) return null;
  return completed.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))[0];
}

/**
 * Categorizes print modules for a given printer/spool combination.
 *
 * Modules are split into four buckets:
 * - compatiblePrintable: preset matches and enough material
 * - compatibleInsufficientMaterial: preset matches but not enough material
 * - anySpoolPrintable: no preset preference and enough material
 * - anySpoolInsufficientMaterial: no preset preference but not enough material
 *
 * Modules requiring a different printer model are silently excluded.
 * Uses strict equality for model ID comparison — coercion was the source of past bugs.
 */
export function getCategorizedModules(printer: Printer, loadedSpool: Spool | null, printModules: PrintModule[]): CategorizedModules {
  if (!printer || !printer.loaded_spool_id || !loadedSpool) return emptyCategorizedModules;

  const categories: CategorizedModules = {
    compatiblePrintable: [],
    compatibleInsufficientMaterial: [],
    anySpoolPrintable: [],
    anySpoolInsufficientMaterial: []
  };

  console.log('[DEBUG getCategorizedModules] printer:', printer.name, 'printer_model_id:', printer.printer_model_id, '(type:', typeof printer.printer_model_id, ')');
  console.log('[DEBUG getCategorizedModules] loadedSpool preset_id:', loadedSpool.preset_id, '(type:', typeof loadedSpool.preset_id, ')');

  printModules.forEach(module => {
    const modelFilteredOut = module.printer_model_id && printer.printer_model_id && module.printer_model_id !== printer.printer_model_id;
    if (modelFilteredOut) {
      console.log('[DEBUG] FILTERED OUT by model:', module.name, 'module_model_id:', module.printer_model_id, '(type:', typeof module.printer_model_id, ') vs printer_model_id:', printer.printer_model_id, '(type:', typeof printer.printer_model_id, ')');
      return;
    }

    const hasEnoughMaterial = loadedSpool.remaining_weight >= (module.expected_weight ?? 0);
    const moduleHasPreference = module.default_spool_preset_id !== null;
    const presetMatches = loadedSpool.preset_id === module.default_spool_preset_id;
    console.log('[DEBUG] Module:', module.name, '| model_id:', module.printer_model_id, '| preset:', module.default_spool_preset_id, '| spool_preset:', loadedSpool.preset_id, '| presetMatch:', presetMatches, '| hasPreference:', moduleHasPreference, '| enoughMaterial:', hasEnoughMaterial);

    if (moduleHasPreference) {
      if (presetMatches) {
        if (hasEnoughMaterial) {
          categories.compatiblePrintable.push(module);
        } else {
          categories.compatibleInsufficientMaterial.push(module);
        }
      }
      // If preset doesn't match, don't show it
    } else {
      if (hasEnoughMaterial) {
        categories.anySpoolPrintable.push(module);
      } else {
        categories.anySpoolInsufficientMaterial.push(module);
      }
    }
  });

  const sortByWeight = (a: PrintModule, b: PrintModule) => (b.expected_weight ?? 0) - (a.expected_weight ?? 0);
  categories.compatiblePrintable.sort(sortByWeight);
  categories.compatibleInsufficientMaterial.sort(sortByWeight);
  categories.anySpoolPrintable.sort(sortByWeight);
  categories.anySpoolInsufficientMaterial.sort(sortByWeight);

  return categories;
}
