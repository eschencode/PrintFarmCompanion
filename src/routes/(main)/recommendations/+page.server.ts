import type { PageServerLoad } from './$types';
import { AIContextBuilder } from '$lib/ai/context-builder';
import {
  AIRecommendationService,
  prioritizeInventoryFromContext,
  getSuggestedPrintQueue
} from '$lib/ai';
import {
  FORECAST_LOOKBACK_DAYS,
  FORECAST_HORIZON_DAYS,
  FORECAST_TRIALS,
  RISK_THRESHOLDS
} from '$lib/ai/forecast';
import { getAllPrinters, getSpoolById } from '$lib/server';

export const load: PageServerLoad = async ({ platform, url }) => {
  const db = platform?.env?.DB;
  const ai = platform?.env?.AI;
  if (!db) {
    return {
      error: 'Database not available',
      printers: [],
      selectedPrinterId: null,
      config: forecastConfig(),
      inventory: [],
      prioritized: emptyPrioritized(),
      spoolSuggestions: [],
      queue: [],
      loadedSpool: null
    };
  }

  const printerIdRaw = url.searchParams.get('printerId');
  const selectedPrinterId = printerIdRaw ? Number(printerIdRaw) : null;

  const printers = (await getAllPrinters(db)) as Array<{
    id: number;
    name: string;
    loaded_spool_id: number | null;
    printer_model_name: string | null;
  }>;

  const builder = new AIContextBuilder(db);
  const modules = await builder.getModulesContext();
  const aiContext = await builder.getAdjustedInventoryContext(modules);
  const prioritized = prioritizeInventoryFromContext(aiContext);
  const forecast = builder.getForecast();

  const inventory = aiContext.adjustedInventory
    .slice()
    .sort((a, b) => b.stockout_risk - a.stockout_risk);

  let spoolSuggestions: Awaited<ReturnType<AIRecommendationService['suggestSpoolToLoad']>> = [];
  let queue: Awaited<ReturnType<typeof getSuggestedPrintQueue>> = [];
  let loadedSpool: Awaited<ReturnType<typeof getSpoolById>> | null = null;

  if (ai && selectedPrinterId) {
    const service = new AIRecommendationService(db, ai);
    spoolSuggestions = await service.suggestSpoolToLoad(selectedPrinterId);
  }

  if (selectedPrinterId) {
    const printer = printers.find((p) => p.id === selectedPrinterId);
    if (printer?.loaded_spool_id) {
      loadedSpool = await getSpoolById(db, printer.loaded_spool_id);
      queue = await getSuggestedPrintQueue(db, selectedPrinterId, prioritized, modules, forecast);
    }
  }

  return {
    error: null,
    printers,
    selectedPrinterId,
    config: forecastConfig(),
    inventory,
    prioritized,
    spoolSuggestions,
    queue,
    loadedSpool
  };
};

function forecastConfig() {
  return {
    lookbackDays: FORECAST_LOOKBACK_DAYS,
    horizonDays: FORECAST_HORIZON_DAYS,
    trials: FORECAST_TRIALS,
    thresholds: RISK_THRESHOLDS
  };
}

function emptyPrioritized() {
  return { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [], VERY_LOW: [] };
}
