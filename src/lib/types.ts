/**
 * Spool - Represents a physical spool of filament
 */
export interface Spool {
  id: number;
  preset_id: number | null;
  brand: string;
  material: string;
  color: string | null;
  initial_weight: number;
  remaining_weight: number;
  cost: number | null;
}

/**
 * Printer - Represents a 3D printer
 */
export interface Printer {
  id: number;
  name: string;
  model: string | null;
  status: string; // 'WAITING' | 'IDLE' | 'PRINTING' | etc.
  loaded_spool_id: number | null;
  suggested_queue?: SuggestedPrintJob[];
  total_hours: number;
}

/**
 * Print Module - Represents a reusable print configuration
 */
export interface PrintModule {
  id: number;
  name: string;
  expected_weight: number;
  expected_time: number | null;
  objects_per_print: number;
  default_spool_preset_id: number | null;
  inventory_slug: string | null;  // Text reference to inventory item
  path: string;
  image_path: string | null;
}

/**
 * Print Job - Represents a single print execution
 */
export interface PrintJob {
  id: number;
  name: string;
  module_id: number | null;
  printer_id: number | null;
  spool_id: number | null;
  start_time: number;
  end_time: number | null;
  status: 'printing' | 'success' | 'failed'; // ✅ Changed from success: number | null
  failure_reason: string | null;
  planned_weight: number;
  actual_weight: number | null;
  waste_weight: number;
}

/**
 * Spool Preset - Template for common spool configurations
 */
export interface SpoolPreset {
  id: number;
  name: string;
  brand: string;
  material: string;
  color: string | null;
  default_weight: number;
  cost: number | null;
  storage_count: number;
}

/**
 * Extended Print Job - Includes joined data from related tables
 * Used for display purposes when querying with JOINs
 */
export interface PrintJobExtended extends PrintJob {
  printer_name?: string;
  module_name?: string;
  expected_weight?: number;
  expected_time?: number;
  printer_loaded_spool_id?: number | null;
  // Spool information
  spool_brand?: string;
  spool_material?: string;
  spool_color?: string | null;
}

/**
 * Printer with Spool - Includes loaded spool information
 */
export interface PrinterWithSpool extends Printer {
  spool?: Spool | null;
}

/**
 * Statistics - Aggregated data for dashboard
 */
export interface PrintStatistics {
  total_prints: number;
  successful_prints: number;
  failed_prints: number;
  total_print_time: number; // in minutes
  total_material_used: number; // in grams
  success_rate: number; // percentage
}

/**
 * Printer Statistics - Per-printer aggregated data
 */
export interface PrinterStatistics extends PrintStatistics {
  printer_id: number;
  printer_name: string;
}

/**
 * Material Usage - Track material consumption by type
 */
export interface MaterialUsage {
  brand: string;
  material: string;
  color: string | null;
  total_used: number; // in grams
  print_count: number;
  average_per_print: number;
}

/**
 * Database Query Result wrapper
 */
export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta: {
    changed_db?: boolean;
    changes?: number;
    duration?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
    size_after?: number;
  };
  error?: string;
}

/**
 * Type guards for runtime type checking
 */
export function isPrintJob(obj: any): obj is PrintJob {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'number' &&
    typeof obj.name === 'string' &&
    typeof obj.planned_weight === 'number'
  );
}

export function isSpool(obj: any): obj is Spool {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'number' &&
    typeof obj.brand === 'string' &&
    typeof obj.remaining_weight === 'number'
  );
}

export function isPrinter(obj: any): obj is Printer {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'number' &&
    typeof obj.name === 'string' &&
    typeof obj.status === 'string'
  );
}

/**
 * Helper type for form data
 */
export interface NewSpool {
  preset_id?: number | null;
  brand: string;
  material: string;
  color?: string | null;
  initial_weight: number;
  remaining_weight: number;
  cost?: number | null;
}

export interface NewPrintModule {
  name: string;
  expected_weight: number;
  expected_time: number;
  objects_per_print?: number;
  default_spool_preset_id?: number | null;
  path: string;
  image_path?: string | null;
}

export interface NewSpoolPreset {
  name: string;
  brand: string;
  material: string;
  color?: string | null;
  default_weight: number;
  cost?: number | null;
}

/**
 * New Printer - For creating printers
 */
export interface NewPrinter {
  name: string;
  model?: string | null;
}

/**
 * Grid Cell - Represents a single cell in the 3x3 grid
 */
export interface GridCell {
  type: 'printer' | 'stats' | 'settings' | 'spools' | 'storage' | 'empty' | 'inventory';
  printerId?: number;
}

/**
 * Grid Preset - Represents a saved grid configuration with configurable dimensions
 */
export interface GridPreset {
  id: number;
  name: string;
  is_default: number; // 0 or 1
  grid_config: string; // JSON stringified GridCell[]
  rows: number;
  cols: number;
  created_at: number;
}

/**
 * New Grid Preset - For creating grid presets
 */
export interface NewGridPreset {
  name: string;
  is_default?: boolean;
  grid_config: GridCell[];
  rows: number;
  cols: number;
}

/**
 * Enum-like types for better type safety
 */
export type PrinterStatus = 'WAITING' | 'IDLE' | 'PRINTING' | 'ERROR' | 'MAINTENANCE';

export type PrintResult = 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';

/**
 * Response types for server functions
 */
export interface ServerResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LoadSpoolResponse extends ServerResponse {
  needsUnload?: boolean;
  currentSpool?: Spool;
  spoolId?: number;
  printerId?: number;
}

export interface StartPrintResponse extends ServerResponse {
  jobId?: number;
  expectedTime?: number;
  expectedWeight?: number;
  lowMaterial?: boolean;
}

/**
 * Helper to get print job status
 */
export function getPrintJobStatus(job: PrintJob): 'printing' | 'success' | 'failed' {
  return job.status;
}


// Inventory types
export interface InventoryItem {
  id: number;
  name: string;
  slug: string;  // Unique text identifier
  sku: string | null;
  description: string | null;
  image_path: string | null;
  stock_count: number;
  min_threshold: number;
  total_added: number;
  total_sold: number;
  total_sold_b2c: number;
  total_sold_b2b: number;
  total_removed_manually: number;
  last_count_date: number | null;
  last_count_expected: number | null;
  last_count_actual: number | null;
}

export type InventoryChangeType = 'add' | 'remove' | 'sold_b2c' | 'sold_b2b' | 'defect' | 'count_adjust';

export interface InventoryLog {
  id: number;
  inventory_id: number;
  change_type: InventoryChangeType;
  quantity: number;
  reason: string | null;
  created_at: number;
}

export interface InventoryWithVelocity {
  slug: string;
  name: string;
  stock_count: number;
  min_threshold: number;
  stock_above_min: number;
  sold_7d: number;
  sold_14d: number;
  sold_30d: number;
  daily_velocity: number;
  days_until_stockout: number;
}

export interface SpoolContext {
  id: number;
  preset_id: number;
  preset_name: string;
  color: string;
  remaining_weight: number;
  printer_id: number | null;
  printer_name: string | null;
}

export interface ModuleContext {
  id: number;
  name: string;
  inventory_slug: string | null;
  expected_weight: number;
  expected_time: number;
  objects_per_print: number;
  preset_id: number | null;
  preset_name: string | null;
}

export interface SuggestedPrintJob {
  module_id: number;
  module_name: string;
  fillament_left: number;
}

export interface PrinterContext {
  id: number;
  name: string;
  status: string;
  loaded_spool: SpoolContext | null;
  suggested_queue: SuggestedPrintJob[];
}

export interface AIRecommendationContext {
  type: 'spool_selection' | 'module_selection';
  printer: PrinterContext;
  available_spools: SpoolContext[];
  available_modules: ModuleContext[];
  inventory: InventoryWithVelocity[];
  other_printers: PrinterContext[]; // To avoid duplicate recommendations
}

export interface SpoolRecommendation {
  spool_id: number;
  preset_name: string;
  color: string;
  remaining_weight: number;
  reason: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  print_plan: {
    module_name: string;
    prints_possible: number;
    will_produce: number;
    inventory_impact: string;
  }[];
  waste_estimate: number; // Estimated leftover grams
}

export interface ModuleRecommendation {
  module_id: number;
  module_name: string;
  reason: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  prints_recommended: number;
  inventory_slug: string | null;
  current_stock: number | null;
  days_until_stockout: number | null;
  will_produce: number;
  filament_needed: number;
  filament_remaining_after: number;
}

export interface AIRecommendationResult {
  type: 'spool_selection' | 'module_selection';
  recommendations: SpoolRecommendation[] | ModuleRecommendation[];
  summary: string;
  waste_optimization_note: string;
}