import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

// PRINTER PRESETS
export const printerPresets = sqliteTable("printer_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  model: text("model").notNull(),
  brand: text("brand").notNull(),
  dimensionX: integer("dimension_x"),
  dimensionY: integer("dimension_y"),
  dimensionZ: integer("dimension_z"),
  devicefilepath: text("devicefilepath").notNull(),
});

// PLATE PRESETS
export const platePresets = sqliteTable("plate_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // e.g., "engineering plate"
});

// SPOOL PRESETS
export const spoolPresets = sqliteTable("spool_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  color: text("color").notNull(),
  brand: text("brand").notNull(),
  defaultWeight: integer("default_weight").notNull(),
  cost: integer("cost").default(0).notNull(), // currency smallest unit (e.g. cents)
  inStorage: integer("in_storage").default(0).notNull(),
});

// SPOOLS
export const spools = sqliteTable("spools", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  presetId: integer("preset_id").references(() => spoolPresets.id),
  remainingWeight: integer("remaining_weight").notNull(),
});

// PRINTERS
export const printers = sqliteTable("printers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  printerPresetId: integer("printer_preset_id").references(
    () => printerPresets.id,
  ),
  loadedSpoolId: integer("loaded_spool_id").references(() => spools.id),
  loadedPlateId: integer("loaded_plate_id").references(() => platePresets.id),
});

// PRINTER SECRETS
export const printerSecrets = sqliteTable("printer_secrets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  printerId: integer("printer_id").references(() => printers.id),
  printerIp: text("printer_ip"),
  serial: text("serial"),
  accessCode: text("access_code"),
});

// PRINT MODULES
export const printModules = sqliteTable("print_modules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  weight: integer("weight").notNull(),
  time: integer("time").notNull(), // print time (seconds/minutes)
  objectsPerPrint: integer("objects_per_print").notNull(),
  defaultSpoolPresetId: integer("default_spool_preset_id").references(
    () => spoolPresets.id,
  ),
  platePresetId: integer("plate_preset_id").references(() => platePresets.id),
  printerPresetId: integer("printer_preset_id").references(
    () => printerPresets.id,
  ),
  objectId: integer("object_id").references(() => objects.id),
  nozzleDiameter: text("nozzle_diameter"),
  filename: text("filename").notNull(),
  filePath: text("file_path").notNull(),
  thumbnail: text("thumbnail"),
});

// PRINT JOBS
export const printJobs = sqliteTable("print_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  moduleId: integer("module_id").references(() => printModules.id),
  printerId: integer("printer_id").references(() => printers.id),
  spoolId: integer("spool_id").references(() => spools.id),
  startTime: integer("start_time", { mode: "timestamp" }),
  expectedEndTime: integer("expected_end_time", { mode: "timestamp" }),
  status: text("status", {
    enum: [
      "queued",
      "printing",
      "print_finished",
      "paused",
      "failed_by_printer",
      "failed_by_user",
      "successful",
    ],
  }),
  failureReason: text("failure_reason"),
  usedWeight: integer("used_weight"),
});

// GRID PRESETS
export const gridPresets = sqliteTable("grid_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name"),
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
  rows: integer("rows"),
  cols: integer("cols"),
});

export const objects = sqliteTable("objects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name"), // e.g., "Hook Blue"
  inStock: integer("in_stock"),
  minThreshold: integer("min_threshold"),
  lastCountDate: integer("last_count_date", { mode: "timestamp" }),
  lastCountDiscrepancy: integer("last_count_discrepancy"),
  category: text("category"),
});

// INVENTORY LOG
export const inventoryLog = sqliteTable("inventory_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  objectId: integer("object_id").references(() => objects.id),
  changeType: text("change_type"),
  quantity: integer("quantity"),
  date: integer("date", { mode: "timestamp" }),
});

// SHOPIFY SKU MAPPING
export const shopifySkuMapping = sqliteTable("shopify_sku_mapping", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopifySku: text("shopify_sku"),
  objectId: integer("object_id").references(() => objects.id),
  quantity: integer("quantity"),
});

// SHOPIFY ORDERS
export const shopifyOrders = sqliteTable("shopify_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: text("order_id"),
  orderNumber: integer("order_number"),
  processedAt: integer("processed_at", { mode: "timestamp" }),
  totalItems: integer("total_items"),
});

export const printerQueuedJobs = sqliteTable("printer_queued_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  // Which printer owns this batch?
  printerId: integer("printer_id")
    .notNull()
    .references(() => printers.id, { onDelete: "cascade" }),

  // What module is in this slot?
  moduleId: integer("module_id")
    .notNull()
    .references(() => printModules.id, { onDelete: "cascade" }),

  // The specific reason you added this item to *this* batch
  reason: text("reason").notNull(),

  // Keeps the order (e.g., 1, 2, 3, 4, 5)
  sortOrder: integer("sort_order").notNull(),

  isCompleted: integer("is_completed", { mode: "boolean" }).default(false),
});
