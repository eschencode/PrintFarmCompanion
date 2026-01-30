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