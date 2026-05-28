import type { PageServerLoad } from './$types';
import { getAllPrintModules, getAllPrinters, getAllSpoolPresets, getAllPrinterPresets } from '$lib/server';
import { getAllObjects } from '$lib/inventory_handler';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { modules: [], printers: [], spoolPresets: [], printerPresets: [], objects: [] };

  const [modules, printers, spoolPresets, printerPresets, objects] = await Promise.all([
    getAllPrintModules(db),
    getAllPrinters(db),
    getAllSpoolPresets(db),
    getAllPrinterPresets(db),
    getAllObjects(db),
  ]);

  return { modules, printers, spoolPresets, printerPresets, objects };
};
