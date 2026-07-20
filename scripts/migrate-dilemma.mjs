// One-off: migrate pre-multi-user DB (printfarmcompanion-db) into the new
// multi-tenant DB (printfarm), scoped to workspace 25 (Dilemma Studio).
// Generates a single SQL file; apply with wrangler d1 execute ... --file.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OLD_DB = "printfarmcompanion-db";
const WS = 25;
const OFFSET = 100000;
const PRESET_MAP = { 1: 12, 2: 22 }; // old printer_preset_id -> shared catalog id

function fetchRows(table) {
  const out = execFileSync(
    "bunx",
    ["wrangler", "d1", "execute", OLD_DB, "--remote", "--json", "--command", `SELECT * FROM ${table}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const json = JSON.parse(out.slice(out.indexOf("[")));
  return json[0].results;
}

const off = (v) => (v == null ? null : v + OFFSET);
const preset = (v) => (v == null ? null : PRESET_MAP[v] ?? off(v));

function lit(v) {
  if (v == null) return "NULL";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// table -> (row) => object of {col: value} to insert (workspace_id added automatically
// unless the table is one of the join tables that already includes it here).
const TABLES = [
  ["categories", (r) => ({ id: off(r.id), workspace_id: WS, name: r.name, parent_id: off(r.parent_id), sort_order: r.sort_order, created_at: r.created_at }), "id"],
  ["objects", (r) => ({ id: off(r.id), workspace_id: WS, name: r.name, in_stock: r.in_stock, min_threshold: r.min_threshold, last_count_date: r.last_count_date, last_count_discrepancy: r.last_count_discrepancy, category: r.category, category_id: off(r.category_id), created_at: r.created_at, updated_at: r.updated_at })],
  ["spool_presets", (r) => ({ id: off(r.id), workspace_id: WS, color: r.color, color_hex: r.color_hex, brand: r.brand, material: r.material, default_weight: r.default_weight, cost: r.cost, in_storage: r.in_storage, created_at: r.created_at, updated_at: r.updated_at })],
  ["spools", (r) => ({ id: off(r.id), workspace_id: WS, preset_id: off(r.preset_id), initial_weight: r.initial_weight, remaining_weight: r.remaining_weight, created_at: r.created_at, updated_at: r.updated_at })],
  ["printers", (r) => ({ id: off(r.id), workspace_id: WS, name: r.name, printer_preset_id: preset(r.printer_preset_id), loaded_plate_id: off(r.loaded_plate_id), loaded_nozzle_diameter: r.loaded_nozzle_diameter, slot_count: r.slot_count, active: r.active, created_at: r.created_at, updated_at: r.updated_at })],
  ["printer_secrets", (r) => ({ id: off(r.id), workspace_id: WS, printer_id: off(r.printer_id), printer_ip: r.printer_ip, serial: r.serial, access_code: r.access_code, transport: r.transport, created_at: r.created_at, updated_at: r.updated_at })],
  ["printer_loaded_spools", (r) => ({ workspace_id: WS, printer_id: off(r.printer_id), slot_index: r.slot_index, spool_id: off(r.spool_id), created_at: r.created_at, updated_at: r.updated_at })],
  ["print_modules", (r) => ({ id: off(r.id), workspace_id: WS, name: r.name, weight: r.weight, expected_time_minutes: r.expected_time_minutes, objects_per_print: r.objects_per_print, plate_preset_id: off(r.plate_preset_id), printer_preset_id: preset(r.printer_preset_id), object_id: off(r.object_id), nozzle_diameter: r.nozzle_diameter, filename: r.filename, thumbnail: r.thumbnail, active: r.active, created_at: r.created_at, updated_at: r.updated_at })],
  ["module_filament_slots", (r) => ({ workspace_id: WS, module_id: off(r.module_id), slot_index: r.slot_index, spool_preset_id: off(r.spool_preset_id), weight: r.weight })],
  ["print_jobs", (r) => ({ id: off(r.id), workspace_id: WS, module_id: off(r.module_id), printer_id: off(r.printer_id), external_task_id: r.external_task_id, start_time: r.start_time, expected_end_time: r.expected_end_time, status: r.status, failure_reason: r.failure_reason, created_at: r.created_at, updated_at: r.updated_at })],
  ["print_job_spools", (r) => ({ workspace_id: WS, print_job_id: off(r.print_job_id), slot_index: r.slot_index, spool_id: off(r.spool_id), used_weight: r.used_weight })],
  ["printer_queued_jobs", (r) => ({ id: off(r.id), workspace_id: WS, printer_id: off(r.printer_id), module_id: off(r.module_id), reason: r.reason, sort_order: r.sort_order, is_completed: r.is_completed, created_at: r.created_at, updated_at: r.updated_at })],
  ["print_queue", (r) => ({ id: off(r.id), workspace_id: WS, object_id: off(r.object_id), module_id: off(r.module_id), quantity: r.quantity, priority: r.priority, reason: r.reason, source: r.source, status: r.status, assigned_printer_id: off(r.assigned_printer_id), created_at: r.created_at, updated_at: r.updated_at })],
  ["inventory_log", (r) => ({ id: off(r.id), workspace_id: WS, object_id: off(r.object_id), change_type: r.change_type, quantity: r.quantity, print_job_id: off(r.print_job_id), shopify_order_id: r.shopify_order_id, created_at: r.created_at })],
  ["shopify_settings", (r) => ({ id: off(r.id), workspace_id: WS, store_domain: r.store_domain, access_token: r.access_token, created_at: r.created_at, updated_at: r.updated_at })],
  ["shopify_sku_mapping", (r) => ({ id: off(r.id), workspace_id: WS, shopify_sku: r.shopify_sku, object_id: off(r.object_id), quantity: r.quantity, created_at: r.created_at, updated_at: r.updated_at })],
  ["shopify_orders", (r) => ({ id: off(r.id), workspace_id: WS, order_id: r.order_id, order_number: r.order_number, processed_at: r.processed_at, total_items: r.total_items, created_at: r.created_at, updated_at: r.updated_at })],
  ["shopify_skus", (r) => ({ id: off(r.id), workspace_id: WS, sku: r.sku, product_title: r.product_title, variant_title: r.variant_title, product_id: r.product_id, variant_id: r.variant_id, synced_at: r.synced_at })],
];

let sql = "";
const summary = [];
for (const [table, map, sortCol] of TABLES) {
  let rows = fetchRows(table);
  if (sortCol) rows = rows.slice().sort((a, b) => a[sortCol] - b[sortCol]);
  summary.push(`${table}: ${rows.length}`);
  for (const r of rows) {
    const obj = map(r);
    const cols = Object.keys(obj);
    sql += `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => lit(obj[c])).join(", ")});\n`;
  }
}

writeFileSync("scripts/migrate-dilemma.sql", sql);
console.error(summary.join("\n"));
console.error("\nWrote scripts/migrate-dilemma.sql");
