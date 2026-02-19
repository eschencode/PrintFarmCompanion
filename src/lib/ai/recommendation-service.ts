import type { D1Database } from '@cloudflare/workers-types';
import type { Ai } from '@cloudflare/workers-types';
import { AIContextBuilder } from './context-builder';
import type {
  AIRecommendationContext,
  AIRecommendationResult,
  SpoolRecommendation,
  ModuleRecommendation,
  SuggestedPrintJob
} from '../types';

export class AIRecommendationService {
  private db: D1Database;
  private ai: Ai;
  private contextBuilder: AIContextBuilder;

  constructor(db: D1Database, ai: Ai) {
    this.db = db;
    this.ai = ai;
    this.contextBuilder = new AIContextBuilder(db);
  }

  /**
   * Build the prompt for spool selection
   */
  private buildSpoolSelectionPrompt(context: AIRecommendationContext): string {
    // Filter inventory to only items that can be printed with available spools
    const relevantInventory = context.inventory.filter(inv => {
      return context.available_modules.some(m => m.inventory_slug === inv.slug);
    });

    // Sort by urgency (days until stockout, below min threshold)
    const urgentItems = relevantInventory
      .filter(i => i.days_until_stockout < 14 || i.stock_above_min < 0)
      .sort((a, b) => a.days_until_stockout - b.days_until_stockout);

    return `You are a 3D print farm optimization assistant. Your goal is to recommend which spool to load to:
1. MINIMIZE WASTE - Use up spools efficiently, avoid leftover filament
2. MEET DEMAND - Print items that are selling well or running low
3. PRIORITIZE URGENCY - Critical stock issues first

CURRENT SITUATION:
- Printer: ${context.printer.name} (${context.printer.status})
- Currently no spool loaded

AVAILABLE SPOOLS (not loaded in any printer):
${context.available_spools.map(s => 
  `- ${s.preset_name} (${s.color}): ${s.remaining_weight}g remaining`
).join('\n')}

URGENT INVENTORY ITEMS (low stock or high demand):
${urgentItems.slice(0, 10).map(i => 
  `- ${i.name}: ${i.stock_count} in stock (min: ${i.min_threshold}), selling ${i.daily_velocity}/day, ~${i.days_until_stockout} days until stockout`
).join('\n')}

MODULES AVAILABLE (what can be printed):
${context.available_modules.slice(0, 15).map(m => {
  const inv = context.inventory.find(i => i.slug === m.inventory_slug);
  return `- ${m.name}: ${m.expected_weight}g, makes ${m.objects_per_print} items, needs ${m.preset_name || 'any spool'}${inv ? `, current stock: ${inv.stock_count}` : ''}`;
}).join('\n')}

OTHER PRINTERS (to avoid duplicating work):
${context.other_printers.map(p => 
  `- ${p.name}: ${p.loaded_spool ? `${p.loaded_spool.preset_name} (${p.loaded_spool.color})` : 'no spool'}`
).join('\n')}

Respond with a JSON object containing:
{
  "recommendations": [
    {
      "spool_preset_name": "exact name from available spools",
      "reason": "brief explanation",
      "urgency": "critical|high|medium|low",
      "print_plan": [
        {"module_name": "...", "prints_recommended": N, "will_produce": N}
      ],
      "waste_estimate_grams": N
    }
  ],
  "summary": "One sentence summary of recommendation",
  "waste_optimization_note": "How this minimizes waste"
}

Return ONLY valid JSON, no other text.`;
  }

  /**
   * Build the prompt for module selection
   */
  private buildModuleSelectionPrompt(context: AIRecommendationContext): string {
    const loadedSpool = context.printer.loaded_spool!;
    const modulesWithInventory = context.available_modules.map(m => {
      const inv = context.inventory.find(i => i.slug === m.inventory_slug);
      return { ...m, inventory: inv };
    });

    return `
### ROLE
You are a 3D Print Farm Optimization Engine. 

### OBJECTIVE
Generate a print queue for ONE printer with spool remaining_weight ${loadedSpool.remaining_weight}g that:
1. Minimizes filament waste (target < 50g remaining).
2. Prioritizes items based on "Stock Stress" (Stock Stress = Velocity / (Current Stock + 1)).
3. Does not duplicate work already handled by other printers.

### CONSTRAINTS
- Spool: ${loadedSpool.remaining_weight}g.
- Maximum Jobs: 5.
- Stop Condition: When no available module's weight fits in the remaining "filament_left".
- OUTPUT: Return ONLY a JSON array. No thinking tags, no prose.

### DATA
Modules you can print:
${modulesWithInventory.map(m => 
  `- ${m.id}: ${m.name} (${m.expected_weight}g per print, ${m.objects_per_print} objects, inventory_slug: ${m.inventory_slug})`
).join('\n')}

Inventory (with sales velocity):
${context.inventory.map(i => 
  `- ${i.slug}: ${i.stock_count} in stock, min: ${i.min_threshold}, sold_7d: ${i.sold_7d}, sold_30d: ${i.sold_30d}, velocity: ${i.daily_velocity}/day, days_until_stockout: ${i.days_until_stockout}`
).join('\n')}

Other Printers (DO NOT DUPLICATE THESE SLUGS):
Other printers and their planned queues:
${context.other_printers.map(p =>
  `- ${p.name}: ${p.suggested_queue.map(q => `${q.module_name} (module_id: ${q.module_id})`).join(', ')}`
).join('\n')}

### EXECUTION STEPS (Think before answering)
1. Calculate the Stock Stress for all "Blau" modules.
2. Identify the highest priority module.
3. Check if it fits the spool.
4. If it fits, add to queue and subtract (Weight + 2g for purge/brim).
5. If it doesn't fit, try the next highest priority module that fits.
6. Repeat until the spool is effectively empty.

### OUTPUT FORMAT
[
  { "module_id": 0, "module_name": "name", "filament_left": 0}
]
Return ONLY valid JSON, no other text.
`;
  }

  /**
   * Get spool recommendations using AI
   */
 /* async getSpoolRecommendations(printerId: number): Promise<AIRecommendationResult> {
    const context = await this.contextBuilder.buildContext(printerId, 'spool_selection');
    const prompt = this.buildSpoolSelectionPrompt(context);
	console.log('TEST');
    try {
		console.log('PROMT:',prompt);
      const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        prompt,
        max_tokens: 1000,
        temperature: 0.3 // Lower temperature for more consistent output
      });
	  console.log('PROMT:',prompt);

	  console.log('RAW AI OUTPUT:',response);
      // Parse the AI response
      const responseText = (response as any).response || '';
      
      // Extract JSON from response (handle potential markdown wrapping)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Map to our expected format
      const recommendations: SpoolRecommendation[] = parsed.recommendations.map((rec: any) => {
        const spool = context.available_spools.find(
          s => s.preset_name.toLowerCase() === rec.spool_preset_name?.toLowerCase()
        );
        
        return {
          spool_id: spool?.id || 0,
          preset_name: rec.spool_preset_name,
          color: spool?.color || '',
          remaining_weight: spool?.remaining_weight || 0,
          reason: rec.reason,
          urgency: rec.urgency || 'medium',
          print_plan: rec.print_plan || [],
          waste_estimate: rec.waste_estimate_grams || 0
        };
      });

      // Store for debugging/caching
      await this.storeRecommendation(printerId, 'spool_selection', context, responseText, recommendations);

      return {
        type: 'spool_selection',
        recommendations,
        summary: parsed.summary || '',
        waste_optimization_note: parsed.waste_optimization_note || ''
      };
    } catch (error) {
      console.error('AI recommendation error:', error);
      // Return empty result on error
      return {
        type: 'spool_selection',
        recommendations: [],
        summary: 'Unable to generate recommendations',
        waste_optimization_note: ''
      };
    }
  }

  /**
   * Get module recommendations using AI
   */
  async getModuleRecommendations(printerId: number): Promise<AIRecommendationResult> {
    const context = await this.contextBuilder.buildContext(printerId, 'module_selection');
    
    if (!context.printer.loaded_spool) {
      return {
        type: 'module_selection',
        recommendations: [],
        summary: 'No spool loaded - load a spool first',
        waste_optimization_note: ''
      };
    }

    const prompt = this.buildModuleSelectionPrompt(context);
	console.log('promt',prompt);
    try {
      const response = await this.ai.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
        prompt,
        max_tokens: 2000,
        temperature: 0.3
      });
	  console.log('RAW AI OUTPUT:',response);
      const responseText = (response as any).response || '';
      let parsedQueue: SuggestedPrintJob[] = [];

      try {
	// Try to parse as JSON array directly
		parsedQueue = JSON.parse(responseText);
	} catch {
		// If that fails, try to extract array from within the string
		const jsonMatch = responseText.match(/\[[\s\S]*\]/);
		if (!jsonMatch) {
			throw new Error('No valid JSON array in AI response');
		}
		parsedQueue = JSON.parse(jsonMatch[0]);
	}


		// Clear old queue
	await this.db.prepare(`
	UPDATE printers SET suggested_queue = NULL WHERE id = ?
	`).bind(printerId).run();


	   await this.db.prepare(`
		UPDATE printers SET suggested_queue = ? WHERE id = ?
		`).bind(
		JSON.stringify(parsedQueue),
		printerId
		).run();

	}
  catch {
    // On error, return empty result
    return {
      type: 'module_selection',
      recommendations: [],
      summary: 'Unable to generate recommendations',
      waste_optimization_note: ''
    };
  }
  }
}