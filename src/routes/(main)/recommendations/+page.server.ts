import type { PageServerLoad } from './$types';
import { AIContextBuilder } from '$lib/recomendation/context-builder';
import {
  AIRecommendationService,
  prioritizeInventoryFromContext,
  generateAndSaveSuggestedQueue
} from '$lib/recomendation';
import {
  FORECAST_LOOKBACK_DAYS,
  FORECAST_HORIZON_DAYS,
  FORECAST_TRIALS,
  RISK_THRESHOLDS
} from '$lib/recomendation/forecast';
import { getAllPrintersFull, getLoadedSpools, getSpoolById, getSpoolPresetById } from '$lib/server';
import type { SpoolWithPreset } from '$lib/types';

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

  const printers = await getAllPrintersFull(db);

  const builder = new AIContextBuilder(db);
  const modules = await builder.getModulesContext();
  const aiContext = await builder.getAdjustedInventoryContext(modules);
  const prioritized = prioritizeInventoryFromContext(aiContext);

  const inventory = aiContext.adjustedInventory
    .slice()
    .sort((a, b) => b.stockout_risk - a.stockout_risk);

  let spoolSuggestions: Awaited<ReturnType<AIRecommendationService['suggestSpoolToLoad']>> = [];
  let queue: Awaited<ReturnType<typeof generateAndSaveSuggestedQueue>> = [];
  let loadedSpool: SpoolWithPreset | null = null;

  if (ai && selectedPrinterId) {
    const service = new AIRecommendationService(db, ai);
    spoolSuggestions = await service.suggestSpoolToLoad(selectedPrinterId);
  }

  if (selectedPrinterId) {
    const loadedSlots = await getLoadedSpools(db, selectedPrinterId);
    const slot0 = loadedSlots.find(s => s.slot_index === 0);
    if (slot0?.spool_id) {
      const spool = await getSpoolById(db, slot0.spool_id);
      if (spool) {
        const preset = spool.preset_id ? await getSpoolPresetById(db, spool.preset_id) : null;
        loadedSpool = { ...spool, preset };
      }
      // Same global-queue-based assignment the dashboard uses (single source of truth).
      queue = await generateAndSaveSuggestedQueue(db, selectedPrinterId);
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
