import { sql } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  real,
  text,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";

/**
 * SaaS migration scope convention
 * -------------------------------
 * Every table is tagged with its tenancy scope.
 *
 * - SCOPE: per-workspace => domain data. Phase 3 adds
 *     workspaceId integer NOT NULL references workspaces.id ON DELETE CASCADE
 *   as column 2 of the table, and converts single-column unique constraints
 *   into composite (workspaceId, x) constraints.
 *
 * - SCOPE: hybrid       => catalog tables that are seeded globally but can
 *   be extended per-workspace (custom printers, custom plates). Phase 3 adds
 *     workspaceId integer NULL references workspaces.id ON DELETE CASCADE
 *   where NULL = system catalog row, set = user-defined. Unique constraints
 *   become (COALESCE(workspaceId, 0), brand, model) (or equivalent partial
 *   indexes) so catalog rows stay deduped across the global namespace.
 *
 * Timestamp convention: integer mode "timestamp" stores Unix seconds.
 * createdAt / updatedAt default to unixepoch(). updatedAt is touched in app code.
 */

// =============================================================================
// PRINTER PRESETS
// SCOPE: hybrid — Bambu P1S/H2S etc. seeded as system catalog (workspaceId NULL
// in Phase 3); users can add custom/DIY printer models scoped to their workspace.
// =============================================================================
export const printerPresets = sqliteTable(
  "printer_presets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    model: text("model").notNull(),
    brand: text("brand").notNull(),
    dimensionX: integer("dimension_x"),
    dimensionY: integer("dimension_y"),
    dimensionZ: integer("dimension_z"),
    // Path on the device where gcode files live (same for all printers of this model).
    deviceFilePath: text("device_file_path").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    // Catalog dedup: one row per (brand, model).
    // Phase 3: becomes UNIQUE(COALESCE(workspaceId, 0), brand, model).
    uniqueIndex("uniq_printer_presets_brand_model").on(t.brand, t.model),
  ],
);

// =============================================================================
// PLATE PRESETS
// SCOPE: hybrid — common plates seeded globally; users can add custom plates.
// =============================================================================
export const platePresets = sqliteTable(
  "plate_presets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(), // e.g., "engineering plate"
    dimensionX: integer("dimension_x"),
    dimensionY: integer("dimension_y"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    // Phase 3: becomes UNIQUE(COALESCE(workspaceId, 0), name).
    uniqueIndex("uniq_plate_presets_name").on(t.name),
  ],
);

// =============================================================================
// SPOOL PRESETS
// SCOPE: per-workspace (each user maintains their own filament library)
// =============================================================================
export const spoolPresets = sqliteTable("spool_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  color: text("color").notNull(),
  // Hex value (e.g. "#1a1a1a") used for UI swatches/gauges. `color` stays the
  // human-readable name. Nullable: legacy presets fall back to the name.
  colorHex: text("color_hex"),
  brand: text("brand").notNull(),
  material: text("material").notNull(), // PLA, PETG, ABS, ...
  defaultWeight: integer("default_weight").notNull(), // nominal weight in grams
  cost: integer("cost").default(0).notNull(), // currency smallest unit (cents)
  // Count of *unused* spools currently in storage (not yet broken out into
  // a `spools` row). Intentionally denormalized: an unopened spool is just
  // a counter, not a row in `spools` yet.
  inStorage: integer("in_storage").default(0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// =============================================================================
// OBJECTS (inventory items the print farm produces)
// SCOPE: per-workspace
// Declared before printModules because printModules.objectId references it.
// =============================================================================
// Object categories. One level of nesting: a category with parentId = null is a
// top-level category; parentId set makes it a subcategory of that parent.
export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    parentId: integer("parent_id").references((): any => categories.id, {
      onDelete: "cascade",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("idx_categories_parent").on(t.parentId)],
);

export const objects = sqliteTable(
  "objects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Name is the human display identifier. Must be unique per workspace.
    // "SKU" only lives in shopify_sku_mapping.shopify_sku — that's Shopify's concept.
    name: text("name").notNull(),
    inStock: integer("in_stock").notNull().default(0),
    minThreshold: integer("min_threshold").notNull().default(0),
    lastCountDate: integer("last_count_date", { mode: "timestamp" }),
    lastCountDiscrepancy: integer("last_count_discrepancy"),
    // Legacy free-text category (superseded by categoryId; kept non-destructively).
    category: text("category"),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    // Phase 3: becomes UNIQUE(workspaceId, name).
    uniqueIndex("uniq_objects_name").on(t.name),
    index("idx_objects_category").on(t.category),
    index("idx_objects_category_id").on(t.categoryId),
    index("idx_objects_stock").on(t.inStock, t.minThreshold),
  ],
);

// =============================================================================
// SPOOLS (physical rolls of filament that have been opened/are in use)
// SCOPE: per-workspace
// =============================================================================
export const spools = sqliteTable(
  "spools",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Nullable: ad-hoc spools that don't match any saved preset are allowed.
    presetId: integer("preset_id").references(() => spoolPresets.id, {
      onDelete: "set null",
    }),
    // Actual weight when this physical spool was added to the system.
    // Defaulted from preset.defaultWeight in app code, but stored here because
    // real-world spools deviate (Bambu "1kg" often weighs 1020g+).
    // Required so "grams consumed" = initialWeight - remainingWeight always works.
    initialWeight: integer("initial_weight").notNull(),
    remainingWeight: integer("remaining_weight").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("idx_spools_preset").on(t.presetId)],
);

// =============================================================================
// PRINTERS
// SCOPE: per-workspace
// =============================================================================
export const printers = sqliteTable(
  "printers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // Required: a printer must be tied to a known model.
    // "restrict" so a preset can't be deleted while printers reference it.
    printerPresetId: integer("printer_preset_id")
      .notNull()
      .references(() => printerPresets.id, { onDelete: "restrict" }),
    // Currently loaded plate. Loaded spools live in printer_loaded_spools
    // (multi-slot support for AMS / dual extruders).
    loadedPlateId: integer("loaded_plate_id").references(
      () => platePresets.id,
      { onDelete: "set null" },
    ),
    loadedNozzleDiameter: real("loaded_nozzle_diameter"),
    // Number of filament slots (1 = single-colour, 4 = AMS, etc.).
    // Drives how many rows exist in printer_loaded_spools for this printer.
    slotCount: integer("slot_count").notNull().default(1),
    // Soft-delete: set false when a printer is decommissioned but kept for
    // historical print_jobs references.
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("idx_printers_preset").on(t.printerPresetId),
    index("idx_printers_active").on(t.active),
  ],
);

// =============================================================================
// PRINTER LOADED SPOOLS (1:N — which physical spool sits in which slot)
// SCOPE: per-workspace (inherited via printer)
// Multi-color support: an AMS with 4 spools = 4 rows here. Single-color
// printer = 1 row at slotIndex 0. Spool deletion sets the slot to null
// (slot stays defined, just empty).
// =============================================================================
export const printerLoadedSpools = sqliteTable(
  "printer_loaded_spools",
  {
    printerId: integer("printer_id")
      .notNull()
      .references(() => printers.id, { onDelete: "cascade" }),
    // 0-based filament index as exposed by the slicer / printer firmware.
    slotIndex: integer("slot_index").notNull(),
    // Nullable: a slot can exist but be empty (between loads).
    spoolId: integer("spool_id").references(() => spools.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    primaryKey({ columns: [t.printerId, t.slotIndex] }),
    index("idx_printer_loaded_spools_spool").on(t.spoolId),
  ],
);

// =============================================================================
// PRINTER SECRETS
// SCOPE: per-workspace (split off so secrets can be encrypted without touching
// hot printer rows). 1:1 with printers — cascade so secrets die with the printer.
// =============================================================================
export const printerSecrets = sqliteTable(
  "printer_secrets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    printerId: integer("printer_id")
      .notNull()
      .references(() => printers.id, { onDelete: "cascade" }),
    printerIp: text("printer_ip"),
    serial: text("serial"),
    // Phase 3: replace with accessCodeEncrypted + Worker-secret KEK envelope encryption.
    accessCode: text("access_code"),
    // How to send commands: 'auto' picks direct (desktop) or Pi fallback, 'direct' forces MQTT, 'pi' forces Pi bridge.
    transport: text("transport", { enum: ["auto", "direct", "pi"] }).default("auto").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("uniq_printer_secrets_printer").on(t.printerId)],
);

// =============================================================================
// PRINT MODULES (a sliced, ready-to-print file + its metadata)
// SCOPE: per-workspace
// Filament requirements (which preset goes in which slot) live in
// module_filament_slots — handles single-color (one row, slotIndex 0) and
// multi-color (one row per slot) uniformly.
// =============================================================================
export const printModules = sqliteTable(
  "print_modules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // Total expected filament weight across all slots (sum of slot weights).
    weight: integer("weight").notNull().default(0),
    expectedTimeMinutes: integer("expected_time_minutes").notNull().default(0),
    objectsPerPrint: integer("objects_per_print").notNull().default(1),
    // Nullable: set during upload or edit; modules can exist before being assigned.
    platePresetId: integer("plate_preset_id").references(
      () => platePresets.id,
      { onDelete: "set null" },
    ),
    printerPresetId: integer("printer_preset_id").references(
      () => printerPresets.id,
      { onDelete: "set null" },
    ),
    // Optional: a module may produce a tracked object, or be a one-off/test print.
    objectId: integer("object_id").references(() => objects.id, {
      onDelete: "set null",
    }),
    nozzleDiameter: real("nozzle_diameter"),
    filename: text("filename").notNull(),
    thumbnail: text("thumbnail"),
    // Soft-delete flag (kept for historical print_jobs references).
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("idx_print_modules_object").on(t.objectId),
    index("idx_print_modules_printer_preset").on(t.printerPresetId),
    index("idx_print_modules_plate_preset").on(t.platePresetId),
    index("idx_print_modules_active").on(t.active),
  ],
);

// =============================================================================
// MODULE FILAMENT SLOTS (which preset goes in which slot for a module)
// SCOPE: per-workspace (inherited via module / preset)
// Single-color modules have one row at slotIndex 0. Multi-color modules have
// one row per slot. Subsumes the old module<->preset M2M by adding position.
// Restrict on spoolPresetId: a preset in use by a module cannot be deleted.
// =============================================================================
export const moduleFilamentSlots = sqliteTable(
  "module_filament_slots",
  {
    moduleId: integer("module_id")
      .notNull()
      .references(() => printModules.id, { onDelete: "cascade" }),
    slotIndex: integer("slot_index").notNull(),
    spoolPresetId: integer("spool_preset_id").references(
      () => spoolPresets.id,
      { onDelete: "restrict" },
    ),
    // Expected filament weight (grams) consumed from this slot per print.
    // Nullable: legacy modules without per-slot data fall back to module.weight.
    weight: integer("weight"),
  },
  (t) => [
    primaryKey({ columns: [t.moduleId, t.slotIndex] }),
    index("idx_module_filament_slots_preset").on(t.spoolPresetId),
  ],
);

// =============================================================================
// PRINT JOBS (history + currently running)
// SCOPE: per-workspace
// FKs use "set null" so history survives deletion of printers/modules.
// Per-slot spool usage lives in print_job_spools (multi-color support).
// =============================================================================
export const printJobs = sqliteTable(
  "print_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    moduleId: integer("module_id").references(() => printModules.id, {
      onDelete: "set null",
    }),
    printerId: integer("printer_id").references(() => printers.id, {
      onDelete: "set null",
    }),
    // ID generated by the printing device (currently the Pi — UUID string).
    // Authoritative identifier for the physical print, including prints we
    // didn't initiate (touchscreen / SD card / direct MQTT). Reconciliation
    // in /api/pi/status upserts by this. UNIQUE so the upsert is bulletproof.
    externalTaskId: text("external_task_id"),
    startTime: integer("start_time", { mode: "timestamp" }),
    expectedEndTime: integer("expected_end_time", { mode: "timestamp" }),
    status: text("status", {
      enum: [
        "queued",
        "printing",
        "print_finished",
        "paused",
        "failed",
        "failed_confirmed",
        "successful",
      ],
    })
      .notNull()
      .default("queued"),
    failureReason: text("failure_reason"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("uniq_print_jobs_external_task_id").on(t.externalTaskId),
    index("idx_print_jobs_printer").on(t.printerId),
    index("idx_print_jobs_module").on(t.moduleId),
    index("idx_print_jobs_status").on(t.status),
    index("idx_print_jobs_created_at").on(t.createdAt),
  ],
);

// =============================================================================
// PRINT JOB SPOOLS (which spool was used in which slot for a job, and how much)
// SCOPE: per-workspace (inherited via job)
// Multi-color: one row per slot used. Single-color: one row at slotIndex 0.
// spoolId is set-null so job history survives spool deletion.
// =============================================================================
export const printJobSpools = sqliteTable(
  "print_job_spools",
  {
    printJobId: integer("print_job_id")
      .notNull()
      .references(() => printJobs.id, { onDelete: "cascade" }),
    slotIndex: integer("slot_index").notNull(),
    spoolId: integer("spool_id").references(() => spools.id, {
      onDelete: "set null",
    }),
    // Grams consumed from this spool during this job. Nullable until the
    // job completes and reports its final usage.
    usedWeight: integer("used_weight"),
  },
  (t) => [
    primaryKey({ columns: [t.printJobId, t.slotIndex] }),
    index("idx_print_job_spools_spool").on(t.spoolId),
  ],
);

// =============================================================================
// GRID PRESETS (dashboard grid layout for displaying printers)
// SCOPE: per-workspace
// =============================================================================
export const gridPresets = sqliteTable(
  "grid_presets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    rows: integer("rows").notNull(),
    cols: integer("cols").notNull(),
    // JSON-serialized GridCell[] — stores which printer/widget sits in each cell.
    gridConfig: text("grid_config").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("idx_grid_presets_default").on(t.isDefault)],
);

// =============================================================================
// INVENTORY LOG (append-only audit trail of stock changes)
// SCOPE: per-workspace
// Restrict on objectId: deleting an object with history is blocked (don't orphan logs).
// printJobId is nullable+set null: links a "+ printed" entry to the job that
// produced it; null for manual stock counts / sales / adjustments.
// =============================================================================
export const inventoryLog = sqliteTable(
  "inventory_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    objectId: integer("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "restrict" }),
    changeType: text("change_type", {
      enum: [
        "+ printed",
        "+ stock count",
        "- stock count",
        "- sold b2c",
        "- sold b2b",
      ],
    }).notNull(),
    quantity: integer("quantity").notNull(),
    // Optional link back to the print job that caused this change ("+ printed" entries).
    printJobId: integer("print_job_id").references(() => printJobs.id, {
      onDelete: "set null",
    }),
    // Optional link back to the Shopify order that caused this change ("- sold b2c"
    // entries from the sync). Stores the Shopify order id (matches shopify_orders.order_id),
    // letting the activity feed group line items under their order.
    shopifyOrderId: text("shopify_order_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("idx_inventory_log_object").on(t.objectId),
    index("idx_inventory_log_change_type").on(t.changeType),
    index("idx_inventory_log_print_job").on(t.printJobId),
    index("idx_inventory_log_shopify_order").on(t.shopifyOrderId),
    index("idx_inventory_log_created_at").on(t.createdAt),
  ],
);

// =============================================================================
// SHOPIFY SETTINGS
// SCOPE: per-workspace
// =============================================================================
export const shopifySettings = sqliteTable(
  "shopify_settings",
  {
    // Phase 3 (multi-user): add workspaceId NOT NULL refs workspaces.id; the
    // saveShopifyConfig id=1 singleton upsert becomes a per-workspace upsert.
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeDomain: text("store_domain").notNull(),
    // AES-256-GCM ciphertext (see src/lib/server/crypto.ts), encrypted with the
    // ENCRYPTION_KEY Worker secret. Never store or return the raw token.
    accessToken: text("access_token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
);

// =============================================================================
// SHOPIFY SKU MAPPING
// SCOPE: per-workspace
// One Shopify SKU can map to multiple objects (bundles) — multiple rows share
// the same shopifySku. Cascade on objectId: deleting the object kills the mapping.
// =============================================================================
export const shopifySkuMapping = sqliteTable(
  "shopify_sku_mapping",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopifySku: text("shopify_sku").notNull(),
    objectId: integer("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    // Phase 3: becomes UNIQUE(workspaceId, shopifySku, objectId).
    uniqueIndex("uniq_shopify_sku_mapping_sku_object").on(
      t.shopifySku,
      t.objectId,
    ),
    index("idx_shopify_sku_mapping_sku").on(t.shopifySku),
  ],
);

// =============================================================================
// SHOPIFY ORDERS
// SCOPE: per-workspace
// UNIQUE(orderId) is non-negotiable: webhook retries must not double-deduct stock.
// =============================================================================
export const shopifyOrders = sqliteTable(
  "shopify_orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: text("order_id").notNull(),
    orderNumber: text("order_number"),
    processedAt: integer("processed_at", { mode: "timestamp" }),
    totalItems: integer("total_items"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    // Phase 3: becomes UNIQUE(workspaceId, orderId).
    uniqueIndex("uniq_shopify_orders_order_id").on(t.orderId),
    index("idx_shopify_orders_processed_at").on(t.processedAt),
  ],
);

// =============================================================================
// SHOPIFY SKUS (catalog cache)
// SCOPE: per-workspace
// Disposable mirror of Shopify product variants, refreshed (wipe + reinsert)
// on demand. Powers the SKU picker in the mapping UI. NOT user data —
// shopify_sku_mapping references the sku *string*, not a row here, so a mapping
// can outlive a catalog entry (shown as "not in catalog").
// =============================================================================
export const shopifySkus = sqliteTable(
  "shopify_skus",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sku: text("sku").notNull(),
    productTitle: text("product_title"),
    variantTitle: text("variant_title"),
    productId: text("product_id"),
    variantId: text("variant_id"),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("uniq_shopify_skus_sku").on(t.sku)],
);

// =============================================================================
// PRINTER QUEUED JOBS (per-printer recommended-next-up list)
// SCOPE: per-workspace (inherited via printer)
// Note: this is a *recommendation* queue, not a binding next-print contract.
// Items are marked isCompleted when the user starts the corresponding print,
// but there's intentionally no FK to print_jobs — the queue is advisory.
// =============================================================================
export const printerQueuedJobs = sqliteTable(
  "printer_queued_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    printerId: integer("printer_id")
      .notNull()
      .references(() => printers.id, { onDelete: "cascade" }),
    moduleId: integer("module_id")
      .notNull()
      .references(() => printModules.id, { onDelete: "cascade" }),
    // Why this item was added to *this* batch (free-form).
    reason: text("reason").notNull(),
    // Position within the printer's queue (1, 2, 3, ...).
    sortOrder: integer("sort_order").notNull(),
    isCompleted: integer("is_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    // No two slots in the same position on the same printer.
    uniqueIndex("uniq_printer_queued_jobs_printer_sort").on(
      t.printerId,
      t.sortOrder,
    ),
    index("idx_printer_queued_jobs_printer").on(t.printerId),
  ],
);
