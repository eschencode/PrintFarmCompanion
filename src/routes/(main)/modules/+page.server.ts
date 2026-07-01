import type { PageServerLoad } from './$types';
import { getAllPrintModules, getAllPrinters, getAllSpoolPresets, getAllPrinterPresets } from '$lib/server';
import { getAllObjects } from '$lib/inventory_handler';
import { requireCtx } from '$lib/server/context';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const db = platform?.env?.DB;
  if (!db) return { modules: [], printers: [], spoolPresets: [], printerPresets: [], objects: [] };
  const ctx = requireCtx(locals);

  const [modules, printers, spoolPresets, printerPresets, objects] = await Promise.all([
    getAllPrintModules(db),
    getAllPrinters(db),
    getAllSpoolPresets(db),
    getAllPrinterPresets(db),
    getAllObjects(ctx),
  ]);

  return { modules, printers, spoolPresets, printerPresets, objects };
};
