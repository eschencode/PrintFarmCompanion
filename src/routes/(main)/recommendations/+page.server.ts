import type { PageServerLoad } from './$types';
import { AIContextBuilder } from '$lib/recomendation/context-builder';
import {
  AIRecommendationService,
  prioritizeInventoryFromContext,
  getSuggestedPrintQueue
} from '$lib/recomendation';
import {
  FORECAST_LOOKBACK_DAYS,
  FORECAST_HORIZON_DAYS,
  FORECAST_TRIALS,
  RISK_THRESHOLDS
} from '$lib/recomendation/forecast';
import { getAllPrinters, getLoadedSpools, getSpoolById } from '$lib/server';

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

  const printers = await getAllPrinters(db);

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
    const loadedSlots = await getLoadedSpools(db, selectedPrinterId);
    const slot0 = loadedSlots.find(s => s.slot_index === 0);
    if (slot0?.spool_id) {
      loadedSpool = await getSpoolById(db, slot0.spool_id);
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
