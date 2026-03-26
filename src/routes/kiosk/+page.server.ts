import type { PageServerLoad } from './$types';
import * as db from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  if (!database) {
    return { printers: [], spools: [], activePrintJobs: [] };
  }

  const printers = await db.getAllPrinters(database);
  const spools = await db.getAllSpools(database);
  const activePrintJobs = await db.getActivePrintJobs(database);

  return { printers, spools, activePrintJobs };
};
