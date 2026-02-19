import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AIRecommendationService } from '$lib/ai';

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB;
  const ai = platform?.env?.AI;
  
  if (!db) {
    return json({ error: 'Database not available' }, { status: 500 });
  }
  
  if (!ai) {
    return json({ error: 'AI not available - make sure AI binding is configured' }, { status: 500 });
  }

  const type = url.searchParams.get('type') as 'spool' | 'module';
  const printerId = url.searchParams.get('printerId');

  if (!type || !printerId) {
    return json({ error: 'Missing type or printerId' }, { status: 400 });
  }

  try {
    const service = new AIRecommendationService(db, ai);

    if (type === 'spool') {
      const result = await service.getSpoolRecommendations(Number(printerId));
      return json(result);
    } else if (type === 'module') {
      const result = await service.getModuleRecommendations(Number(printerId));
      return json(result);
    } else {
      return json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (err) {
    console.error('AI recommendation error:', err);
    return json({ error: String(err) }, { status: 500 });
  }
};