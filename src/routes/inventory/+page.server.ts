import type { PageServerLoad, Actions } from './$types';
import {
  getAllInventoryItems,
  getAllRecentLogs,
  addStock,
  removeStock,
  performManualCount,
  setStock
} from '$lib/inventory_handler';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  
  if (!db) {
    return { items: [], logs: [], error: 'Database not available' };
  }

  const items = await getAllInventoryItems(db);
  const logs = await getAllRecentLogs(db, 50);

  return { items, logs };
};

export const actions: Actions = {
  // Add stock manually
  addStock: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const quantity = parseInt(formData.get('quantity') as string) || 1;
    const reason = formData.get('reason') as string || 'Manual add';

    return await addStock(db, id, quantity, reason);
  },

  // Remove stock manually
  removeStock: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const quantity = parseInt(formData.get('quantity') as string) || 1;
    const reason = formData.get('reason') as string || 'Manual remove';

    return await removeStock(db, id, quantity, reason);
  },

  // Set stock to specific value (manual count)
  setStock: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const count = parseInt(formData.get('count') as string);
    const reason = formData.get('reason') as string || undefined;

    return await performManualCount(db, id, count, reason);
  }
};
