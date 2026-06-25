import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AIRecommendationService, generateAndSaveSuggestedQueue } from '$lib/recomendation';
import { getGlobalQueue, getSpoolDemandFromQueue, regenerateGlobalQueueIfStale } from '$lib/server/printQueue';

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB;
  const ai = platform?.env?.AI;

  if (!db) {
    return json({ error: 'Database not available' }, { status: 500 });
  }

  if (!ai) {
    return json({ error: 'AI not available - make sure AI binding is configured' }, { status: 500 });
  }

  const type = url.searchParams.get('type') as 'spool' | 'module' | 'test' | 'queue' | 'global' | 'spool-demand';
  const printerId = url.searchParams.get('printerId');

  try {

  if (type === 'spool') {
    await regenerateGlobalQueueIfStale(db);
    const aiService = new AIRecommendationService(db, ai);
    const suggestion = await aiService.suggestSpoolToLoad(printerId ? Number(printerId) : undefined);
    return json(suggestion);
  }

  if (type === 'global') {
    await regenerateGlobalQueueIfStale(db);
    const queue = await getGlobalQueue(db);
    return json(queue);
  }

  if (type === 'spool-demand') {
    await regenerateGlobalQueueIfStale(db);
    const demand = await getSpoolDemandFromQueue(db);
    return json(demand);
  }

	 if (type === 'queue') {
      if (!printerId) {
        return json({ error: 'Missing printerId' }, { status: 400 });
      }
      const queue = await generateAndSaveSuggestedQueue(db, Number(printerId));
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
