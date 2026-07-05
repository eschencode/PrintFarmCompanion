import type { PageServerLoad } from './$types';
import * as db from '$lib/server';
import { requireCtx } from '$lib/server/context';

export const load: PageServerLoad = async ({ locals }) => {
  const ctx = requireCtx(locals);
  const printers = await db.getAllPrintersFull(ctx);
  return { printers };
};
