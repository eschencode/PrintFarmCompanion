import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AIRecommendationService, generateAndSaveSuggestedQueue } from '$lib/recomendation';
import { getGlobalQueue, getSpoolDemandFromQueue, regenerateGlobalQueueIfStale } from '$lib/server/printQueue';
import { requireCtx } from '$lib/server/context';

export const GET: RequestHandler = async ({ url, platform, locals }) => {
  const db = platform?.env?.DB;

  if (!db) {
    return json({ error: 'Database not available' }, { status: 500 });
  }
  const ctx = requireCtx(locals);

  const type = url.searchParams.get('type') as 'spool' | 'module' | 'test' | 'queue' | 'global' | 'spool-demand';
  const printerId = url.searchParams.get('printerId');

  try {

  if (type === 'spool') {
    await regenerateGlobalQueueIfStale(ctx);
    const aiService = new AIRecommendationService(ctx);
    const suggestion = await aiService.suggestSpoolToLoad(printerId ? Number(printerId) : undefined);
    return json(suggestion);
  }

  if (type === 'global') {
    await regenerateGlobalQueueIfStale(ctx);
    const queue = await getGlobalQueue(ctx);
    return json(queue);
  }

  if (type === 'spool-demand') {
    await regenerateGlobalQueueIfStale(ctx);
    const demand = await getSpoolDemandFromQueue(ctx);
    return json(demand);
  }

	 if (type === 'queue') {
      if (!printerId) {
        return json({ error: 'Missing printerId' }, { status: 400 });
      }
      const queue = await generateAndSaveSuggestedQueue(ctx, Number(printerId));
      return json(queue);
    }
    if (!type || !printerId) {
      return json({ error: 'Missing type or printerId' }, { status: 400 });
    }
    else {
      return json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (err) {
    console.error('AI recommendation error:', err);
    return json({ error: String(err) }, { status: 500 });
  }
};
