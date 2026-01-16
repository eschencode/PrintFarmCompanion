import type { PageServerLoad } from './$types';
import  * as db from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
 
  const db = platform?.env?.DB;
  
  if (!db) {
    console.log('⚠️ Database not available.');
    return { printers: [] };
  }

  const printers = await db.getAllPrinters(db);
  const spools = await db.getAllSpools(db);

  return { printers, spools };
};


export const actions: Actions = {
  addBlueSpool: async ({ platform }) => {
    const database = platform?.env?._3dtracker_db;
    
    if (!database) {
      return { success: false };
    }

    await db.createSpool(database, {
      presetId: 1,
      brand: 'Generic',
      material: 'PLA',
      color: 'Blue',
      initialWeight: 1000,
      remainingWeight: 1000,
      cost: 20.00
    });

    return { success: true };
  }
};