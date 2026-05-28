# PrintFarmCompanion — Database Design

Living reference document. Describes the schema structure, design decisions, and
key data flows. Use this as context when continuing work in a new chat session.

Schema source of truth: `src/lib/db/schema.ts` (Drizzle, SQLite / Cloudflare D1).

---

## Design philosophy

### Single source of truth
Every piece of data lives in exactly one place. Counters (`inStock`, `remainingWeight`)
are operational state — they live directly on the row. History (why they changed) lives
in append-only log tables (`inventoryLog`). Analytics are derived from logs, never stored.

### Presets vs. instances
A recurring pattern throughout the schema:

| Preset (template / type) | Instance (physical reality) |
|---|---|
| `spoolPresets` — filament type, brand, color | `spools` — a specific physical roll |
| `printerPresets` — printer model (P1S, H2S) | `printers` — a specific machine |
| `platePresets` — plate type | loaded on a specific printer |
| `printModules` — a sliced file + requirements | `printJobs` — one execution of that file |

Modules reference presets (what TYPE of filament is required). Jobs reference
physical instances (which specific spool was actually used). This means a module
is reusable forever; it never needs updating when spools run out.

### Preserve history
Foreign keys from historical tables (`printJobs`, `inventoryLog`) use `onDelete: "set null"`.
Deleting a printer, spool, or module does not delete the record of prints it ran.
Only log entries and queue items cascade-delete when their parent is gone.

### SaaS-ready scope
Every table is tagged with a tenancy scope (see comments in schema.ts). Phase 3 of
the migration plan adds `workspaceId` to all per-workspace tables. Two scopes exist:

- **per-workspace** — domain data owned by one tenant. Gets `workspaceId NOT NULL` in Phase 3.
- **hybrid** — catalog tables (`printerPresets`, `platePresets`) seeded globally but
  extensible per-workspace for custom printers/plates. Gets `workspaceId NULL` in Phase 3,
  where `NULL = system catalog`, set = user-defined row.

---

## Table map

```
GLOBAL / HYBRID CATALOG
  printer_presets        Model catalog (P1S, H2S, ...) — hybrid scope
  plate_presets          Build plate catalog — hybrid scope

PER-WORKSPACE: FILAMENT
  spool_presets          Filament library (brand, color, material, cost)
  spools                 Physical rolls currently in use

PER-WORKSPACE: HARDWARE
  printers               Individual machines
  printer_loaded_spools  Which spool sits in which slot right now (multi-color)
  printer_secrets        IP, serial, access code (kept separate for future encryption)

PER-WORKSPACE: PRINT PIPELINE
  print_modules          Sliced gcode files + requirements (reusable templates)
  module_filament_slots  Which filament preset each slot of a module requires
  printer_queued_jobs    Advisory recommended-next-up list per printer
  print_jobs             Every print ever run (historical record)
  print_job_spools       Which spool was used in which slot per job + weight consumed

PER-WORKSPACE: INVENTORY
  objects                Finished products with stock counter
  inventory_log          Append-only audit trail of every stock change

PER-WORKSPACE: SHOPIFY
  shopify_sku_mapping    Shopify SKU → object(s) mapping (supports bundles)
  shopify_orders         Deduped record of processed orders

PER-WORKSPACE: UI
  grid_presets           Dashboard printer grid layout configuration
```

---

## Table reference

### `printer_presets`
Catalog of printer models. Shared across all users (hybrid scope). Seeded with
Bambu P1S, H2S, etc. Users can add custom models.

| Column | Notes |
|---|---|
| `model`, `brand` | UNIQUE together — one row per (brand, model) |
| `dimension_x/y/z` | Build volume in mm |
| `device_file_path` | Path on the device where gcode files are stored (same for all printers of this model) |

---

### `plate_presets`
Build plate types (engineering plate, cool plate, ...). Hybrid scope — users can
add custom plates. `name` is UNIQUE.

---

### `spool_presets`
The user's filament library. Each row is a type of filament they stock.

| Column | Notes |
|---|---|
| `color`, `brand`, `material` | Identity of the filament (PLA, PETG, ABS, ...) |
| `default_weight` | Nominal spool weight in grams. Used as default when adding a new physical spool. |
| `cost` | Price in currency smallest unit (cents). Used for print cost calculations. |
| `in_storage` | Count of **unopened** spools of this type sitting in storage. Intentionally denormalized — an unopened spool has no physical tracking row yet. When a spool is opened it becomes a row in `spools`. |

---

### `spools`
Physical rolls that have been opened and are in use or tracked.

| Column | Notes |
|---|---|
| `preset_id` | Nullable — ad-hoc spools without a preset are allowed |
| `initial_weight` | Actual weight when first added. Defaults from `preset.default_weight` in app code but stored separately because real spools deviate (Bambu "1kg" ≈ 1020g+). |
| `remaining_weight` | Current weight. `initial_weight - remaining_weight` = total consumed. |

**Opening a spool from storage:** decrement `spool_presets.in_storage` by 1, insert a new `spools` row with `initial_weight` defaulted from `default_weight`.

---

### `printers`
Individual physical machines.

| Column | Notes |
|---|---|
| `printer_preset_id` | NOT NULL, restrict — must always be tied to a model |
| `loaded_plate_id` | Currently loaded plate, set null if unloaded |
| `loaded_nozzle_diameter` | e.g. 0.4, 0.6, 0.8 |
| `active` | false = decommissioned. Kept for historical print_jobs references. |

Loaded spools are in `printer_loaded_spools`, not on this row — supports multi-color.

---

### `printer_loaded_spools`
Tracks which physical spool is in which filament slot of a printer right now.
A single-color printer has one row (slot_index=0). A Bambu AMS has up to 4.

| Column | Notes |
|---|---|
| PK: `(printer_id, slot_index)` | One row per slot per printer |
| `spool_id` | Nullable — a slot can be defined but empty (between loads) |

---

### `printer_secrets`
IP address, serial number, and access code for connecting to a printer.
Kept in a separate table so these fields can be encrypted in Phase 3 without
touching the hot `printers` row on every dashboard load.

1:1 with `printers` (UNIQUE on `printer_id`). Cascades when printer is deleted.

---

### `print_modules`
A reusable print template: a sliced gcode file plus all the metadata needed to
run and track it. Not tied to any specific physical spool — that's the point.

| Column | Notes |
|---|---|
| `weight` | Total expected filament weight across all slots (grams) |
| `expected_time_minutes` | Used for scheduling and ETA display |
| `objects_per_print` | How many finished objects this module produces per run |
| `plate_preset_id` | Required — sliced for a specific plate type |
| `printer_preset_id` | Required — sliced for a specific printer model |
| `object_id` | Nullable — links to the inventory object produced. Null for test/one-off prints. |
| `nozzle_diameter` | Sliced for a specific nozzle size |
| `filename` | The gcode filename as stored on the device |
| `active` | false = soft-deleted, kept so historical jobs still resolve |

Filament requirements per slot are in `module_filament_slots`.

---

### `module_filament_slots`
What TYPE of filament each slot of a module needs. The bridge between a module
(template) and the physical spool that will fulfill it.

| Column | Notes |
|---|---|
| PK: `(module_id, slot_index)` | One row per slot |
| `spool_preset_id` | NOT NULL, restrict — specifies the required filament type |

A module with zero rows here has no filament requirements (any filament is fine).
Single-color: one row at slot_index=0. Multi-color: one row per slot.

---

### `printer_queued_jobs`
An advisory recommended-next-up list per printer. Not a binding contract —
the user is free to print something else. There is intentionally no FK linking
a queue entry to the resulting `print_jobs` row.

| Column | Notes |
|---|---|
| UNIQUE: `(printer_id, sort_order)` | Prevents duplicate positions |
| `reason` | Why this module was added to this printer's queue (free-form) |
| `is_completed` | Marked true when the user starts the print |

---

### `print_jobs`
The central historical record. Every print ever run — initiated by the app or
detected from the printer (SD card, touchscreen, direct MQTT).

| Column | Notes |
|---|---|
| `module_id` | set null on delete — history kept even if module is deleted |
| `printer_id` | set null on delete |
| `external_task_id` | UUID generated by the Pi. UNIQUE. Used for reconciliation: if the Pi reports a job we have no row for, we create one. Covers prints started outside the app. |
| `status` | enum: queued → printing → print_finished → paused → failed / failed_confirmed / successful |
| `failure_reason` | Free-form. Controlled values defined in app code. |

Per-slot spool usage is in `print_job_spools`.

---

### `print_job_spools`
Which physical spool was used in which slot for a job, and how much was consumed.
This is the actual fulfillment record — the module said "I need Bambu PLA Black at
slot 0" and this row records "spool #47 was in slot 0, 14g consumed."

| Column | Notes |
|---|---|
| PK: `(print_job_id, slot_index)` | One row per slot per job |
| `spool_id` | set null on delete — history kept if spool is deleted |
| `used_weight` | Nullable until job completes and reports final usage |

---

### `objects`
Finished products produced by the print farm. Single source of truth for inventory.

| Column | Notes |
|---|---|
| `sku` | UNIQUE. Stable human-readable identifier. Used for Shopify mapping, CSV imports, URLs, AI context. Survives renames (name can change, sku does not). |
| `in_stock` | Current count. Operational state — the source of truth. |
| `min_threshold` | Alert when in_stock falls below this. |
| `last_count_date` | When the last manual stock count was done. |
| `last_count_discrepancy` | Difference between expected and actual at last count. Used for audit. |

---

### `inventory_log`
Append-only. Every change to `objects.in_stock` is recorded here.
Analytics (total sold, total printed, etc.) are derived from this table — never stored.

| Column | Notes |
|---|---|
| `object_id` | NOT NULL, restrict — can't delete an object with history |
| `change_type` | enum: `+ printed`, `+ stock count`, `- stock count`, `- sold b2c`, `- sold b2b` |
| `quantity` | Always positive. The sign is encoded in `change_type`. |
| `print_job_id` | Nullable, set null on delete. Links `+ printed` entries to the job that produced them. |

**Invariant maintained by app code:** every write to `objects.in_stock` must be
accompanied by an `inventory_log` insert in the same transaction.

---

### `shopify_sku_mapping`
Maps Shopify SKUs to the objects they represent. Supports bundles by allowing
multiple rows with the same `shopify_sku` (one per object in the bundle).

| Column | Notes |
|---|---|
| UNIQUE: `(shopify_sku, object_id)` | No duplicate mappings |
| `quantity` | How many of `object_id` are in this SKU (e.g. 5 for a 5-pack) |

Example: SKU `HOOK-5PACK` → two rows: (HOOK-5PACK, object=hook, qty=5).
Example: SKU `STARTER-KIT` → two rows: (STARTER-KIT, object=hook, qty=2) + (STARTER-KIT, object=base, qty=1).

---

### `shopify_orders`
Deduped record of Shopify orders that have been processed. `order_id` is UNIQUE —
webhook retries are idempotent because of this constraint.

---

### `grid_presets`
Stores dashboard grid layout configurations (rows × cols). `is_default` marks
which layout loads by default. Phase 3 note: will need a per-workspace unique
partial index `UNIQUE(workspace_id) WHERE is_default = true`.

---

## Multi-color print flow

The schema handles single and multi-color prints uniformly via slot indexes.
Single-color is just slot 0. A Bambu AMS with 4 colors is slots 0–3.

### Compatibility check (before dispatching)
```
For each slot in module_filament_slots:
  required_preset = moduleFilamentSlots[slot].spoolPresetId
  loaded_spool    = printerLoadedSpools[slot].spoolId → spools.presetId

  If loaded_spool.presetId ≠ required_preset → warn user
  If slot has no entry in printerLoadedSpools → warn "slot empty"
```
A module with no `module_filament_slots` rows skips the check entirely.

### Job creation (on dispatch)
```
1. Insert print_jobs row (status = 'printing')
2. Snapshot current printer_loaded_spools → insert print_job_spools rows
   (used_weight = null, filled in on completion)
```
The snapshot happens at dispatch time — not queue time — so weight tracking
reflects what was physically loaded when the print ran.

### Job completion
```
1. Update print_job_spools.used_weight per slot (from printer/Pi report)
2. Deduct used_weight from spools.remaining_weight per slot (in one transaction)
3. If print_jobs.module.object_id is set:
   - Increment objects.in_stock by module.objects_per_print
   - Insert inventory_log row (change_type='+ printed', print_job_id=job.id)
```

---

## Key invariants (enforced by app code, not DB constraints)

1. **Stock counter + log:** every change to `objects.in_stock` has a matching
   `inventory_log` insert in the same DB transaction.
2. **Spool weight:** `spools.remaining_weight` is decremented atomically when
   `print_job_spools.used_weight` is written. The invariant
   `initial_weight - remaining_weight = SUM(used_weight for this spool)` should hold.
3. **updatedAt:** must be set to `unixepoch()` by app code on every UPDATE.
   There are no SQLite triggers managing this automatically.
4. **Spool from storage:** opening a spool decrements `spool_presets.in_storage`
   and inserts a `spools` row. Both happen in one transaction.

---

## What is NOT in this schema (intentionally)

- **Users / auth** — Phase 2 (better-auth). `user`, `session`, `account`, `verification` tables added then.
- **Workspaces** — Phase 3. `workspaces` table added, then `workspace_id` column added to all per-workspace tables.
- **Workspace members / roles** — Phase 4. For now one user per workspace.
- **Shopify sync state** (`last_sync_at`, `last_order_id`) — dropped in cleanup. If incremental sync is re-added, put it in a `shopify_sync` table scoped per-workspace.
- **AI recommendations** — dropped
- **Printer downtime** — dropped
- **Stripe / billing** — Phase 4.

---

## Migration phases (summary)

| Phase | What happens | Status |
|---|---|---|
| 0 | Drizzle adoption, swap raw `.prepare()` calls | Done |
| 1 | Schema cleanup — this document | **Done (TypeScript clean; stats page needs runtime rewrite)** |
| 2 | better-auth wiring, login/signup/logout, route guards | Pending |
| 3 | `workspace_id` on all domain tables, `forWorkspace()` DB helper, encrypt secrets | Pending |
| 4 | SaaS polish — invites, roles, billing, audit log | Future |

Full phase details in `docs/saas-migration-plan.md`.
