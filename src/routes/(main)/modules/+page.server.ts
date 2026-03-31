import type { PageServerLoad } from './$types';
import { getAllPrintModules } from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { modules: [] };

  const modules = await getAllPrintModules(db);
  return { modules };
};
