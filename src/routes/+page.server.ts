import type { PageServerLoad } from './$types';
import { getAllPrinters, getAllSpools } from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
 
  const db = platform?.env?.DB;
  
  if (!db) {
    console.log('⚠️ Database not available.');
    return { printers: [] };
  }

  const printers = await getAllPrinters(db);
  const spools = await getAllSpools(db);


  return { printers, spools };
};