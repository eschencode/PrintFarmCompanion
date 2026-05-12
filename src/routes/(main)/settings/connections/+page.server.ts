import type { PageServerLoad } from './$types';
import * as db from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  if (!database) return { printers: [] };
  const printers = await db.getAllPrinters(database);
  return { printers };
};
