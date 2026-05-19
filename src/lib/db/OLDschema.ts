import {
  sqliteTable,
  integer,
  text,
  real,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const spoolPresets = sqliteTable("spool_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  brand: text("brand"),
  material: text("material"),
  color: text("color"),
  defaultWeight: integer("default_weight").notNull(),
  cost: real("cost"),
  storageCount: integer("storage_count").default(0),
});

export const inventory = sqliteTable(
  "inventory",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    sku: text("sku").unique(),
    description: text("description"),
    imagePath: text("image_path"),
    stockCount: integer("stock_count").notNull().default(0),
    minThreshold: integer("min_threshold").notNull().default(5),
    totalAdded: integer("total_added").default(0),
    totalSold: integer("total_sold").default(0),
    totalSoldB2c: integer("total_sold_b2c").default(0),
    totalSoldB2b: integer("total_sold_b2b").default(0),
    totalRemovedManually: integer("total_removed_manually").default(0),
    lastCountDate: integer("last_count_date"),
    lastCountExpected: integer("last_count_expected"),
    lastCountActual: integer("last_count_actual"),
    category: text("category").notNull().default(""),
  },
  (t) => [
    index("idx_inventory_sku").on(t.sku),
    index("idx_inventory_slug").on(t.slug),
    index("idx_inventory_low_stock").on(t.stockCount, t.minThreshold),
  ],
);

export const inventoryLog = sqliteTable(
  "inventory_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    inventoryId: integer("inventory_id")
      .notNull()
      .references(() => inventory.id),
    changeType: text("change_type").notNull(),
    quantity: integer("quantity").notNull(),
    reason: text("reason"),
    createdAt: integer("created_at").default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("idx_inventory_log_inventory").on(t.inventoryId),
    index("idx_inventory_log_type").on(t.changeType),
    index("idx_inventory_log_created_at").on(t.createdAt),
    index("idx_inventory_log_change_type").on(t.changeType),
  ],
);

export const printerModels = sqliteTable("printer_models", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  buildVolumeX: real("build_volume_x"),
  buildVolumeY: real("build_volume_y"),
  buildVolumeZ: real("build_volume_z"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now') * 1000)`),
});

export const spools = sqliteTable(
  "spools",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    presetId: integer("preset_id").references(() => spoolPresets.id),
    brand: text("brand").notNull(),
    material: text("material").notNull(),
    color: text("color"),
    initialWeight: integer("initial_weight").notNull(),
    remainingWeight: integer("remaining_weight").notNull(),
    cost: real("cost"),
  },
  (t) => [index("idx_spools_preset").on(t.presetId)],
);

export const printers = sqliteTable(
  "printers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    model: text("model").default("P1S"),
    printerModelId: integer("printer_model_id").references(
      () => printerModels.id,
    ),
    status: text("status").default("WAITING"),
    loadedSpoolId: integer("loaded_spool_id").references(() => spools.id),
    totalHours: real("total_hours").default(0),
    suggestedQueue: text("suggested_queue"),
    printerIp: text("printer_ip"),
    printerSerial: text("printer_serial"),
    printerAccessCode: text("printer_access_code"),
    transport: text("transport").notNull().default("auto"),
  },
  (t) => [index("idx_printers_spool").on(t.loadedSpoolId)],
);

export const printerDowntime = sqliteTable(
  "printer_downtime",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    printerId: integer("printer_id")
      .notNull()
      .references(() => printers.id, { onDelete: "cascade" }),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
    note: text("note"),
  },
  (t) => [index("idx_printer_downtime_printer").on(t.printerId)],
);

export const printModules = sqliteTable(
  "print_modules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    expectedWeight: integer("expected_weight"),
    expectedTime: integer("expected_time"),
    objectsPerPrint: integer("objects_per_print").default(1),
    defaultSpoolPresetId: integer("default_spool_preset_id").references(
      () => spoolPresets.id,
    ),
    inventorySlug: text("inventory_slug").references(() => inventory.slug),
    printerModel: text("printer_model"),
    printerModelId: integer("printer_model_id").references(
      () => printerModels.id,
    ),
    localFileHandlerPath: text("local_file_handler_path"),
    imagePath: text("image_path"),
    fileName: text("file_name"),
    thumbnail: text("thumbnail"),
    filamentType: text("filament_type"),
    filamentColor: text("filament_color"),
    plateType: text("plate_type"),
    nozzleDiameter: real("nozzle_diameter"),
    piFilePath: text("pi_file_path"),
    fileStoredOnPi: integer("file_stored_on_pi").default(0),
    active: integer("active").notNull().default(1),
  },
  (t) => [index("idx_print_modules_inventory_slug").on(t.inventorySlug)],
);

export const moduleSpoolPresets = sqliteTable(
  "module_spool_presets",
  {
    moduleId: integer("module_id")
      .notNull()
      .references(() => printModules.id, { onDelete: "cascade" }),
    spoolPresetId: integer("spool_preset_id")
      .notNull()
      .references(() => spoolPresets.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.moduleId, t.spoolPresetId] })],
);

export const printJobs = sqliteTable(
  "print_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    moduleId: integer("module_id").references(() => printModules.id),
    printerId: integer("printer_id").references(() => printers.id),
    spoolId: integer("spool_id").references(() => spools.id),
    startTime: integer("start_time"),
    endTime: integer("end_time"),
    status: text("status").default("printing"),
    failureReason: text("failure_reason"),
    plannedWeight: integer("planned_weight").notNull(),
    actualWeight: integer("actual_weight"),
    wasteWeight: integer("waste_weight").default(0),
    piTaskId: text("pi_task_id"),
  },
  (t) => [
    index("idx_print_jobs_printer").on(t.printerId),
    index("idx_print_jobs_spool").on(t.spoolId),
    index("idx_print_jobs_module").on(t.moduleId),
  ],
);

export const gridPresets = sqliteTable(
  "grid_presets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    isDefault: integer("is_default").default(0),
    gridConfig: text("grid_config").notNull(),
    rows: integer("rows").notNull().default(3),
    cols: integer("cols").notNull().default(3),
    createdAt: integer("created_at").default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("idx_grid_presets_default").on(t.isDefault)],
);

export const shopifySkuMapping = sqliteTable(
  "shopify_sku_mapping",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopifySku: text("shopify_sku").notNull(),
    inventorySlug: text("inventory_slug")
      .notNull()
      .references(() => inventory.slug),
    quantity: integer("quantity").notNull().default(1),
    sourceType: text("source_type").notNull().default("inventory"),
    spoolPresetId: integer("spool_preset_id"),
  },
  (t) => [
    index("idx_shopify_sku_mapping_sku").on(t.shopifySku),
    index("idx_shopify_sku_mapping_slug").on(t.inventorySlug),
  ],
);

export const shopifySync = sqliteTable("shopify_sync", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lastOrderId: text("last_order_id"),
  lastSyncAt: integer("last_sync_at"),
  ordersProcessed: integer("orders_processed").default(0),
  itemsDeducted: integer("items_deducted").default(0),
});

export const shopifyOrders = sqliteTable(
  "shopify_orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopifyOrderId: text("shopify_order_id").notNull().unique(),
    shopifyOrderNumber: text("shopify_order_number"),
    processedAt: integer("processed_at"),
    totalItems: integer("total_items"),
    status: text("status").default("processed"),
  },
  (t) => [
    index("idx_shopify_orders_order_id").on(t.shopifyOrderId),
    index("idx_shopify_orders_processed_at").on(t.processedAt),
  ],
);

export const aiRecommendations = sqliteTable("ai_recommendations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  printerId: integer("printer_id").references(() => printers.id),
  recommendationType: text("recommendation_type").notNull(),
  contextHash: text("context_hash"),
  inputContext: text("input_context"),
  aiResponse: text("ai_response"),
  parsedRecommendations: text("parsed_recommendations"),
  createdAt: integer("created_at").default(sql`(unixepoch() * 1000)`),
  expiresAt: integer("expires_at"),
});
