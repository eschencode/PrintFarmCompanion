import type { PageServerLoad } from './$types';
import { getAllInventoryItems } from '$lib/inventory_handler';
import { AIContextBuilder } from '$lib/ai/context-builder';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { items: [] };

  const items = await getAllInventoryItems(db);

  try {
    const builder = new AIContextBuilder(db);
    const velocityList = await builder.getInventoryWithVelocity();
    const itemsWithVelocity = items.map((i) => {
      const v = velocityList.find((x) => x.slug === i.slug);
      return {
        ...i,
        daily_velocity: v?.daily_velocity ?? 0,
        days_until_stockout: v?.days_until_stockout ?? 999,
      };
    });
    return { items: itemsWithVelocity };
  } catch (err) {
    console.error('Failed to compute inventory velocity:', err);
    return { items: items.map((i) => ({ ...i, daily_velocity: 0, days_until_stockout: 999 })) };
  }
};
