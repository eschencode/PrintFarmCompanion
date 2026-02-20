import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AIRecommendationService, generateAndSaveSuggestedQueue, getSuggestedPrintQueue, prioritizeInventoryFromContext } from '$lib/ai';

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB;
  const ai = platform?.env?.AI;
  
  if (!db) {
    return json({ error: 'Database not available' }, { status: 500 });
  }
  
  if (!ai) {
    return json({ error: 'AI not available - make sure AI binding is configured' }, { status: 500 });
  }

  const type = url.searchParams.get('type') as 'spool' | 'module' | 'test' | 'queue';
  const printerId = url.searchParams.get('printerId');

  try {
    
	 if (type === 'queue') {
      if (!printerId) {
        return json({ error: 'Missing printerId' }, { status: 400 });
      }
      const queue = await generateAndSaveSuggestedQueue(db, Number(printerId));
      return json(queue);
    }
    if (type === 'test') {
      if (!printerId) {
        return json({ error: 'Missing printerId' }, { status: 400 });
      }
      // Build context and prioritized inventory
      const { AIContextBuilder } = await import('$lib/ai/context-builder');
      const contextBuilder = new AIContextBuilder(db);
      const modules = await contextBuilder.getModulesContext();
      const aiContext = await contextBuilder.getAdjustedInventoryContext(modules);
      const prioritized = prioritizeInventoryFromContext(aiContext);

      // Get the suggested print queue
      const queue = await getSuggestedPrintQueue(db, Number(printerId), prioritized);
      console.log(queue); // Log to server console
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