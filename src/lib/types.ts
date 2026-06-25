// ============================================================================
// CATALOG TYPES (hybrid scope — global + per-workspace in Phase 3)
// ============================================================================

/** Printer model catalog row (P1S, H2S, custom DIY, ...) */
export interface PrinterPreset {
  id: number;
  model: string;
  brand: string;
  dimension_x: number | null;
  dimension_y: number | null;
  dimension_z: number | null;
  /** Path on the device where gcode files are stored. Same for all printers of this model. */
  device_file_path: string;
  created_at: number;
  updated_at: number;
}

/** Build plate catalog row (engineering plate, cool plate, ...) */
export interface PlatePreset {
  id: number;
  name: string;
  dimension_x: number | null;
  dimension_y: number | null;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// FILAMENT TYPES
// ============================================================================

/** A filament type in the user's library. Template for physical spools. */
export interface SpoolPreset {
  id: number;
  color: string;
  /** Hex value for UI swatches/gauges (e.g. "#1a1a1a"). Null = fall back to `color`. */
  color_hex: string | null;
  brand: string;
  material: string; // PLA, PETG, ABS, ...
  default_weight: number; // nominal weight in grams
  cost: number; // cents
  /** Count of unopened spools in storage (not yet opened into a `spools` row). */
  in_storage: number;
  created_at: number;
  updated_at: number;
}

/** A physical roll of filament that has been opened and is being tracked. */
export interface Spool {
  id: number;
  preset_id: number | null;
  /** Actual weight when first added. May differ from preset.default_weight. */
  initial_weight: number;
  remaining_weight: number;
  created_at: number;
  updated_at: number;
}

/** Spool with its preset data joined in — for display. */
export interface SpoolWithPreset extends Spool {
  preset?: SpoolPreset | null;
}

// ============================================================================
// PRINTER TYPES
// ============================================================================

/** A physical machine. Loaded spools are in printer_loaded_spools (per-slot). */
export interface Printer {
  id: number;
  name: string;
  printer_preset_id: number;
  loaded_plate_id: number | null;
  loaded_nozzle_diameter: number | null;
  /** Number of filament slots. 1 = single-colour, 4 = AMS, etc. */
  slot_count: number;
  /** false = decommissioned. Row kept so historical print_jobs still resolve. */
  active: boolean;
  created_at: number;
  updated_at: number;
}

/** Which spool is loaded in which slot of a printer right now. */
export interface PrinterLoadedSpool {
  printer_id: number;
  slot_index: number;
  spool_id: number | null;
  created_at: number;
  updated_at: number;
}

/** Printer secrets — IP, serial, access code, transport preference. Kept separate for future encryption. */
export interface PrinterSecrets {
  id: number;
  printer_id: number;
  printer_ip: string | null;
  serial: string | null;
  access_code: string | null;
  transport: TransportMode;
  created_at: number;
  updated_at: number;
}

/** Printer with all related data joined for dashboard display. */
export interface PrinterFull extends Printer {
  preset?: PrinterPreset | null;
  loaded_plate?: PlatePreset | null;
  loaded_spools?: (PrinterLoadedSpool & { spool: SpoolWithPreset | null })[];
  secrets?: PrinterSecrets | null;
}

/**
 * Dashboard-ready printer — PrinterFull with secrets and status flattened onto
 * the object so UI components can access printer_serial, printer_ip, etc. directly
 * without digging into nested objects. Built in the page load function.
 */
export interface DashboardPrinter extends PrinterFull {
  // Flattened from PrinterSecrets
  printer_serial: string | null;
  printer_ip: string | null;
  printer_access_code: string | null;
  transport: TransportMode;
  // Convenience: slot-0 spool (the primary loaded spool for single-color printers)
  loaded_spool: SpoolWithPreset | null;
  // Derived from active print_jobs — not stored in DB.
  // 'finished' = print physically ended (print_finished), awaiting manual success/fail confirmation.
  status: 'printing' | 'finished' | 'idle' | 'inactive';
  // Advisory next-up queue, fetched client-side from /api/ai-recommendations.
  suggested_queue?: SuggestedQueueItem[];
}

/**
 * Advisory print-queue item as attached to DashboardPrinter at runtime.
 * Mirrors the recommendation service's SuggestedPrintQueueItem, plus a
 * client-only `status` used to mark items already printed ('DONE').
 */
export interface SuggestedQueueItem {
  module_id: number;
  module_name: string;
  object_name?: string;
  // 'TOPUP' = filler print added to use up remaining spool weight.
  priority: InventoryPriority | 'TOPUP';
  // Days of cover left for the produced object (null if unknown / no velocity).
  days_left?: number | null;
  weight_of_print: number;
  spool_weight_after_print: number;
  status?: string;
}

// ============================================================================
// PRINT MODULE TYPES
// ============================================================================

/** Which filament preset is required at a specific slot for a module.
 *  `spool_preset_id = null` means the slot accepts any loaded spool.
 *  `weight` is expected grams consumed from this slot; null = unknown. */
export interface ModuleFilamentSlot {
  module_id: number;
  slot_index: number;
  spool_preset_id: number | null;
  weight: number | null;
}

/** A reusable print template: sliced gcode + metadata. */
export interface PrintModule {
  id: number;
  name: string;
  /** Total expected filament across all slots (grams). */
  weight: number;
  expected_time_minutes: number;
  objects_per_print: number;
  plate_preset_id: number;
  printer_preset_id: number;
  /** Nullable: test/one-off prints don't need to track an object. */
  object_id: number | null;
  nozzle_diameter: number | null;
  filename: string;
  thumbnail: string | null;
  /** false = soft-deleted. Kept so historical jobs still resolve the module name. */
  active: boolean;
  created_at: number;
  updated_at: number;
}

/** Module with related data joined for display. */
export interface PrintModuleFull extends PrintModule {
  printer_preset?: PrinterPreset | null;
  plate_preset?: PlatePreset | null;
  object?: ObjectItem | null;
  filament_slots?: (ModuleFilamentSlot & { preset?: SpoolPreset | null })[];
  /** Spool preset required at slot 0 — joined from module_filament_slots. */
  default_spool_preset_id?: number | null;
}

// ============================================================================
// PRINT JOB TYPES
// ============================================================================

export type PrintJobStatus =
  | 'queued'
  | 'printing'
  | 'print_finished'
  | 'paused'
  | 'failed'
  | 'failed_confirmed'
  | 'successful';

/** A single print execution — historical record. */
export interface PrintJob {
  id: number;
  module_id: number | null;
  printer_id: number | null;
  /** UUID from the Pi. Used to reconcile prints started outside the app. */
  external_task_id: string | null;
  start_time: number | null;
  expected_end_time: number | null;
  status: PrintJobStatus;
  failure_reason: string | null;
  created_at: number;
  updated_at: number;
}

/** Which spool was used in which slot for a job, and how many grams were consumed. */
export interface PrintJobSpool {
  print_job_id: number;
  slot_index: number;
  spool_id: number | null;
  /** Null until the job completes and reports final usage. */
  used_weight: number | null;
}

/** Print job with related data joined for display. */
export interface PrintJobFull extends PrintJob {
  module?: PrintModule | null;
  printer?: Printer | null;
  spools?: (PrintJobSpool & { spool?: SpoolWithPreset | null })[];
}

/**
 * PrintJob as returned by getActivePrintJobs / getAllPrintJobs —
 * includes ad-hoc columns from SQL joins (module + printer aliases).
 */
export interface PrintJobWithDetails extends PrintJob {
  module_name?: string | null;
  module_weight?: number | null;
  module_thumbnail?: string | null;
  expected_time_minutes?: number | null;
  objects_per_print?: number | null;
  printer_name?: string | null;
  printer_serial?: string | null;
  /** Optional client-side field set when the Pi reports live progress. */
  progress?: number | null;
}

// ============================================================================
// QUEUE TYPES
// ============================================================================

/** An entry in a printer's advisory recommended-next-up list. */
export interface PrinterQueuedJob {
  id: number;
  printer_id: number;
  module_id: number;
  reason: string;
  sort_order: number;
  is_completed: boolean;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// INVENTORY / OBJECTS TYPES
// ============================================================================

/** A finished product produced by the farm. Single source of truth for stock. */
export interface ObjectItem {
  id: number;
  /** Unique display name. "SKU" only lives in shopify_sku_mapping.shopify_sku. */
  name: string;
  in_stock: number;
  min_threshold: number;
  last_count_date: number | null;
  last_count_discrepancy: number | null;
  /** Legacy free-text category (superseded by category_id). */
  category: string | null;
  category_id: number | null;
  created_at: number;
  updated_at: number;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
  created_at: number;
}

export type InventoryChangeType =
  | '+ printed'
  | '+ stock count'
  | '- stock count'
  | '- sold b2c'
  | '- sold b2b';

/** One entry in the append-only audit trail of stock changes. */
export interface InventoryLog {
  id: number;
  object_id: number;
  change_type: InventoryChangeType;
  quantity: number;
  /** Links "+ printed" entries back to the job that produced them. */
  print_job_id: number | null;
  /** Links "- sold b2c" entries back to the Shopify order (matches shopify_orders.order_id). */
  shopify_order_id: string | null;
  created_at: number;
}

// ============================================================================
// SHOPIFY TYPES
// ============================================================================

export interface ShopifySkuMapping {
  id: number;
  shopify_sku: string;
  object_id: number;
  quantity: number;
  created_at: number;
  updated_at: number;
}

export interface ShopifyOrder {
  id: number;
  order_id: string;
  order_number: string | null;
  processed_at: number | null;
  total_items: number | null;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// GRID / DASHBOARD TYPES
// ============================================================================

export interface GridCell {
  type: 'printer' | 'stats' | 'settings' | 'spools' | 'empty' | 'inventory' | 'products';
  printerId?: number;
}

export interface GridPreset {
  id: number;
  name: string;
  is_default: boolean;
  rows: number;
  cols: number;
  /** JSON-serialized GridCell[]. Parse with JSON.parse(grid_config). */
  grid_config: string;
  created_at: number;
  updated_at: number;
}

export interface NewGridPreset {
  name: string;
  is_default?: boolean;
  rows: number;
  cols: number;
  grid_config: GridCell[];
}

// ============================================================================
// PI / LIVE STATUS TYPES (not persisted — live MQTT data)
// ============================================================================

/** How a printer sends print commands and receives status updates. */
export type TransportMode = 'auto' | 'direct' | 'pi';

/**
 * Live status snapshot for one printer, received via Pi polling or Tauri MQTT events.
 * Keyed by printer serial in the dashboard's piStatusBySerial map.
 */
export interface PiStatus {
  gcode_state: string;
  progress: number;
  layer_num: number;
  total_layer_num: number;
  /** Human-readable label derived from gcode_state and progress. */
  label: string;
  remaining_time?: number | null;
  nozzle_temp?: number | null;
  bed_temp?: number | null;
  chamber_temp?: number | null;
  subtask_name?: string | null;
  gcode_file?: string | null;
  /** Raw Bambu Health-Management-System entries (decode via $lib/utils/hms). */
  hms?: HmsEntry[] | null;
  // Temps + targets
  nozzle_target_temp?: number | null;
  bed_target_temp?: number | null;
  // Fans (Bambu reports a 0–15 gear value) + speed profile
  cooling_fan_speed?: number | null;
  aux_fan_speed?: number | null;
  chamber_fan_speed?: number | null;
  /** Speed profile: 1 Silent, 2 Standard, 3 Sport, 4 Ludicrous. */
  speed_level?: number | null;
  /** Speed magnitude as a percentage. */
  speed_mag?: number | null;
  // Connectivity
  wifi_signal?: string | null;
}

/** Raw HMS entry as the printer reports it. `attr`/`code` combine into a lookup code. */
export interface HmsEntry {
  attr: number;
  code: number;
}

/** Failure-reason modal pre-fill, e.g. when cancelling a print from an HMS error. */
export interface FailurePrefill {
  /** Pre-selected failure reason text. */
  reason: string;
  /** Canonical HMS code, e.g. "0700_8000_0001_0001". */
  code: string;
  /** Bambu wiki page explaining the code. */
  wikiUrl: string;
  /** HMS severity (fatal | serious | common | info). */
  severity: string;
}

// ============================================================================
// ANALYTICS / RECOMMENDATION TYPES
// ============================================================================

export type InventoryPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';

export interface ObjectWithVelocity {
  id: number;
  name: string;
  in_stock: number;
  min_threshold: number;
  daily_velocity: number;
  days_until_stockout: number;
  stockout_risk: number;
  confidence: 'high' | 'medium' | 'low';
  days_with_sales: number;
  // Bootstrap cumulative-demand quantiles over the forecast horizon.
  demand_p50: number;
  demand_p90: number;
}

export interface SalesVelocity {
  object_id: number;
  daily_velocity: number;
}

export interface AIRecommendationContext {
  adjustedInventory: ObjectWithVelocity[];
  salesVelocity: SalesVelocity[];
}

export interface PrioritizedObjectItem {
  id: number;
  name: string;
  in_stock: number;
  min_threshold: number;
  daily_velocity: number;
  days_until_stockout: number;
  stockout_risk: number;
  confidence: 'high' | 'medium' | 'low';
  priority: InventoryPriority;
}

export interface PrioritizedInventory {
  CRITICAL: PrioritizedObjectItem[];
  HIGH: PrioritizedObjectItem[];
  MEDIUM: PrioritizedObjectItem[];
  LOW: PrioritizedObjectItem[];
  VERY_LOW: PrioritizedObjectItem[];
}

export interface SpoolSuggestion {
  preset_id: number;
  priority: InventoryPriority;
  object_name: string;
  in_stock: number;
  daily_velocity: number;
  days_until_stockout: number;
  module_id: number;
  module_name: string;
  reason: string;
  /** Other inventory items this preset would also relieve, most urgent first. */
  also_relieves?: { object_name: string; priority: InventoryPriority }[];
}

// Global print backlog row (print_queue table) joined with object/module names.
export interface PrintQueueItem {
  id: number;
  object_id: number;
  object_name: string;
  module_id: number | null;
  module_name: string | null;
  quantity: number;
  priority: InventoryPriority;
  reason: string;
  source: 'auto' | 'manual';
  status: 'pending' | 'assigned' | 'done';
  assigned_printer_id: number | null;
  // Live forecast fields carried through for sorting/display.
  in_stock: number;
  daily_velocity: number;
  days_until_stockout: number;
  stockout_risk: number;
}

// Aggregated filament demand for one spool preset across the whole queue.
export interface QueueSpoolDemand {
  preset_id: number;
  preset_label: string; // "Brand Color (Material)"
  color_hex: string | null;
  grams_needed: number; // Σ slot weight × quantity across queued items
  grams_available: number; // loaded remaining + inStorage × defaultWeight
  grams_deficit: number; // max(0, needed − available)
  spools_to_buy: number; // ceil(deficit / defaultWeight)
}

export interface ModuleContext {
  id: number;
  name: string;
  object_id: number | null;
  /** Name of the linked object (joined from objects.name). */
  object_name: string | null;
  weight: number;
  expected_time_minutes: number;
  objects_per_print: number;
  printer_preset_id: number;
  /** Spool preset required at slot 0 (joined from module_filament_slots). */
  spool_preset_id: number | null;
}

// ============================================================================
// STATISTICS TYPES
// ============================================================================

export interface PrintStatistics {
  total_prints: number;
  successful_prints: number;
  failed_prints: number;
  total_print_time: number; // minutes
  total_material_used: number; // grams
  success_rate: number; // percentage
}

export interface PrinterStatistics extends PrintStatistics {
  printer_id: number;
  printer_name: string;
}

export interface MaterialUsage {
  brand: string;
  material: string;
  color: string;
  total_used: number; // grams
  print_count: number;
  average_per_print: number;
}

// ============================================================================
// SERVER RESPONSE TYPES
// ============================================================================

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

export interface ServerResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LoadSpoolResponse extends ServerResponse {
  needsUnload?: boolean;
  currentSpool?: Spool | null;
  spoolId?: number;
  printerId?: number;
}

export interface StartPrintResponse extends ServerResponse {
  jobId?: number;
  expectedTime?: number;
  expectedWeight?: number;
  lowMaterial?: boolean;
}

// ============================================================================
// FORM / INPUT TYPES
// ============================================================================

export interface NewSpool {
  preset_id?: number | null;
  initial_weight: number;
  remaining_weight: number;
}

export interface NewPrintModule {
  name: string;
  weight: number;
  expected_time_minutes: number;
  objects_per_print?: number;
  plate_preset_id: number;
  printer_preset_id: number;
  object_id?: number | null;
  nozzle_diameter?: number | null;
  filename: string;
  thumbnail?: string | null;
}

export interface NewSpoolPreset {
  color: string;
  brand: string;
  material: string;
  default_weight: number;
  cost?: number;
  in_storage?: number;
}

export interface NewPrinter {
  name: string;
  printer_preset_id: number;
  slot_count?: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isPrintJob(obj: unknown): obj is PrintJob {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as PrintJob).id === 'number' &&
    typeof (obj as PrintJob).status === 'string'
  );
}

export function isSpool(obj: unknown): obj is Spool {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as Spool).id === 'number' &&
    typeof (obj as Spool).remaining_weight === 'number'
  );
}

export function isPrinter(obj: unknown): obj is Printer {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as Printer).id === 'number' &&
    typeof (obj as Printer).name === 'string' &&
    typeof (obj as Printer).printer_preset_id === 'number'
  );
}
