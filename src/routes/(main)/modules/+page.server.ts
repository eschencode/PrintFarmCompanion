import type { PageServerLoad } from './$types';
import { getAllPrintModules, getAllPrinters } from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { modules: [], printers: [] };

  const [modules, printers] = await Promise.all([
    getAllPrintModules(db),
    getAllPrinters(db),
  ]);

  return { modules, printers };
};
