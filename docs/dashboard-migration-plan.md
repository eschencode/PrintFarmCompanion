# Dashboard migration plan — 2026-05-22

The dashboard (`/` route) is the highest-traffic page in the app and is still wired to the **old** schema in several places. Until these are fixed, the dashboard will display wrong data, crash on certain interactions, or silently fail when starting prints.

This document inventories every issue across the dashboard and its components, and describes the fixes in detail so we can execute them in a single focused pass.

---

## 1. Schema fields that no longer exist

These references appear in dashboard files and **will fail at runtime** because the columns are gone or were renamed in the new schema.

| Old reference | New equivalent | Where it's used |
|---|---|---|
| `module.file_stored_on_pi` | (removed — see §3 file routing) | `+page.svelte:352,484` `ModuleSelectorModal:395` |
| `module.local_file_handler_path` | `module.filename` | `+page.svelte:353,380,387,400` |
| `module.pi_file_path` | `module.filename` | (formerly in `+page.svelte`) |
| `module.expected_time` | `module.expected_time_minutes` | `ModuleSelectorModal:173,298` |
| `module.expected_weight` | `module.weight` | (cleared in earlier passes — verify) |
| `module.image_path` / `job.module_image_path` | `module.thumbnail` / `job.module_thumbnail` | `+page.svelte:589` |
| `module.inventory_slug` | `module.object_id` | (cleared — verify) |
| `module.printer_model` (string) | `module.printer_preset_id` (number) | (cleared — verify) |
| `printer.loaded_spool_id` | `printer.loaded_spool` (object, populated in `+page.server.ts:33`) | `+page.svelte:874,1115,1134,1169,1186` |
| `printer.model` | `printer.preset?.model` (or `${preset.brand} ${preset.model}`) | `PrinterDetailModal:55` |
| `printer.total_hours` | (removed — compute from job durations or drop UI section) | `PrinterDetailModal:321,387` |
| `printer.status === 'BROKEN'` | `printer.status === 'inactive'` (lowercase) | `PrinterDetailModal:80,377` |
| `lastPrintJob.status !== 'success'` | `... !== 'successful'` | `PrinterDetailModal:304` |
| `activePrintJob.weight` | `activePrintJob.module_weight` (SQL alias) | `PrinterDetailModal:179,185,241` |
| `loadedSpool.brand/material/color` (flat) | `loadedSpool.preset?.brand/...` | `PrinterDetailModal:266,267,271` |

---

## 2. Type imports that no longer exist

| File | Bad import | Should be |
|---|---|---|
| `PrinterDetailModal.svelte:6` | `PrintJobExtended` | `PrintJobFull` |
| `PrinterDetailModal.svelte:6` | `Printer` (for modal printer prop) | `DashboardPrinter` |
| `PrinterDetailModal.svelte:6` | `Spool` (for loadedSpool prop) | `SpoolWithPreset` |
| `PrinterDetailModal.svelte:6` | `PrintModule` (for printModules prop) | `PrintModuleFull` |
| `FailureReasonModal.svelte:4` | `Spool, PrintJobExtended` | `SpoolWithPreset, PrintJobFull` |
| `+page.svelte:29` | `Printer` for `selectedPrinter` | `DashboardPrinter` |

The reason these matter: `PrintJobExtended` doesn't exist in `types.ts` anymore — only `PrintJob` and `PrintJobFull`. The `PrintJobFull` type plus the SQL-aliased columns (`module_name`, `module_weight`, `module_thumbnail`, `printer_serial`, `expected_time_minutes`) is what active jobs actually look like at runtime.

---

## 3. The big one: file routing logic

The old schema stored **three** columns per module:
- `pi_file_path` — path on the Pi
- `local_file_handler_path` — path on the desktop machine
- `file_stored_on_pi` — boolean flag

The new schema has **one** column: `filename`.

The `dispatchNextStart` function in `+page.svelte:345-406` branches on which file location is available:

```js
const hasPi = module.file_stored_on_pi && printer.printer_ip && ...
const hasLocalHandler = module.local_file_handler_path && fileHandlerState.connected;
const hasDirect = transport === 'direct' && directConnected.has(...);
```

### Decision

For now, treat `module.filename` as **the** file path. The branching becomes:

| Transport | Behaviour |
|---|---|
| `manual` | Register job in DB only, no file send. |
| `pi` | Send `module.filename` to Pi via `/api/pi/print` (Pi already has it or will reject). |
| `direct` (MQTT) | Use `module.filename`'s basename as the SD-card path. |
| Fallback | Register job in DB, optionally open `module.filename` in local file handler. |

Concretely: `hasPi` becomes `printer.printer_ip && printer.printer_serial && printer.printer_access_code` (drop the `file_stored_on_pi` check — let the Pi reject if the file isn't there). `hasLocalHandler` becomes `module.filename && fileHandlerState.connected`. The direct-mode path takes `module.filename.split('/').pop()` as the filename.

This is a **pragmatic regression**: the user loses the explicit "is on Pi vs is local" distinction. A later UI change (the user mentioned this) should add visible state for where each module file lives, but that's a separate feature.

The auto-queue check at line 484 (`!nextModule?.file_stored_on_pi || !printer.printer_ip`) becomes simply `!printer.printer_ip` — if there's no Pi connection, fall through to the reload path instead of auto-queuing.

---

## 4. The `getLoadedSpool` helper that doesn't exist

`+page.svelte` imports `getLoadedSpool` from `$lib/utils/printerData` at line 6, and calls it 4 times with `selectedPrinter.loaded_spool_id` as the first arg.

**Two problems:**
1. `getLoadedSpool` (singular) does **not** exist in `printerData.ts` — only the server-side `getLoadedSpools` (plural) does.
2. `selectedPrinter.loaded_spool_id` doesn't exist either — see §1.

**Fix:** `+page.server.ts:33` already flattens slot-0 spool onto each printer as `printer.loaded_spool`. The dashboard should just use `selectedPrinter.loaded_spool` directly. Remove the import and the 4 helper calls.

The 4 spots:
- `+page.svelte:1115` — QuickStartModal `loadedSpool` prop → `selectedPrinter.loaded_spool`
- `+page.svelte:1134` — PrinterDetailModal `loadedSpool` prop → same
- `+page.svelte:1169` — ModuleSelectorModal `loadedSpool` prop → same
- `+page.svelte:1186` — FailureReasonModal `loadedSpool` prop → same

`handleStartPrint` at line 874 needs the same fix: `!selectedPrinter?.loaded_spool_id` → `!selectedPrinter?.loaded_spool`.

---

## 5. PrinterCard.svelte — missing import + serial reference

- Line 47 calls `getActivePrintJob(...)` but never imports it. Add `import { getActivePrintJob } from '$lib/utils/printerData';`.
- Lines 177, 201: use `printer.secrets?.serial` but `DashboardPrinter` has a flattened `printer_serial`. Switch both to `printer.printer_serial` for consistency with how the rest of the app keys the start queue.

---

## 6. PrinterDetailModal — accumulated fixes

This component has the most schema breakage. Concrete changes:

1. **Imports** (line 6): swap `PrintJobExtended → PrintJobFull`, `Spool → SpoolWithPreset`, `PrintModule → PrintModuleFull`, `Printer → DashboardPrinter`.
2. **Prop types** (lines 12-22): match the new imports.
3. **Line 55** `{printer.model}` → `{printer.preset?.brand} {printer.preset?.model}`.
4. **Lines 80, 377** `printer.status === 'BROKEN'` → `printer.status === 'inactive'`.
5. **Line 179, 185, 241** `activePrintJob.weight` → `(activePrintJob as any).module_weight` (or extend types).
6. **Lines 266, 267, 271** `loadedSpool.brand/material/color` → `loadedSpool.preset?.brand/...`.
7. **Line 304** `lastPrintJob.status !== 'success'` → `... !== 'successful'`.
8. **Line 321, 387** Total Runtime row: either delete the section, or replace with a derived sum from `print_jobs` durations (defer — small UI loss).
9. **Lines 327, 332** `printer.suggested_queue` is a runtime property attached client-side — leave as-is, but switch `printer.secrets?.serial` → `printer.printer_serial`.

---

## 7. ModuleSelectorModal — three fixes

1. Lines 173, 298: `module.expected_time` → `module.expected_time_minutes`.
2. Line 395: `selectedModule?.file_stored_on_pi` → simplify; check `printer?.printer_ip` only (or drop the check).
3. Line 91: `item.module_name` is fine — comes from `SuggestedPrintQueueItem`.

---

## 8. FailureReasonModal — type fixes only

1. Line 4: `Spool, PrintJobExtended` → `SpoolWithPreset, PrintJobFull`.
2. Verify all references inside the template still work with the new types — likely needs `loadedSpool.preset?.brand` etc.

---

## 9. QuickStartModal — minimal

The structural type `PrinterQueuedJob & { module_name?: string }` is acceptable since the runtime data does have `module_name` (from `SuggestedPrintQueueItem`). No changes needed unless we want stricter typing.

---

## 10. The `module_image_path` bug

`+page.svelte:589` stashes `job?.module_image_path` into sessionStorage for the success animation:

```js
sessionStorage.setItem('printSuccessAnim', JSON.stringify({
  imagePath: job?.module_image_path ?? null,
}));
```

The SQL aliases `pm.thumbnail as module_thumbnail`, not `module_image_path`. The animation either shows the fallback emoji or breaks. Fix: change to `job?.module_thumbnail`.

---

## 11. Recommendation API integration

`+page.svelte` and `PrinterDetailModal` call `/api/ai-recommendations?type=queue&printerId=...` and expect a `SuggestedPrintQueueItem[]`. In our previous pass we changed `SuggestedPrintQueueItem.object_sku` → `object_name`. The dashboard displays `nextPrint.module_name` only, so the rename is invisible here. ✅ No work needed unless we want to surface the object name too.

---

## Execution order

The fixes are mostly independent, but to minimize back-and-forth:

1. **Helper functions first** — fix `getLoadedSpool` removal + `PrinterCard` import + `module_image_path` rename. These are 1-line changes that unblock everything else.
2. **Type imports** — fix `PrintJobExtended` / `Printer` / `Spool` imports across the 3 modal components.
3. **Schema field renames inside each component** — `module.expected_time → expected_time_minutes`, `printer.model → preset.model`, `'BROKEN' → 'inactive'`, `'success' → 'successful'`, `activePrintJob.weight → module_weight`, `loadedSpool.brand → preset.brand`.
4. **File routing simplification in `dispatchNextStart`** — collapse the 3-path branching to use `module.filename` everywhere.
5. **Cosmetic cleanup** — drop the hardcoded `{0}h` total runtime rows or replace with computed value.
6. **Manual smoke test** — load dashboard, open each modal, start a print, complete a print, verify Pi polling still updates the card.

---

## What we're *not* fixing in this pass

- **Total runtime per printer** — was `printer.total_hours`, now needs to be derived from `print_jobs` durations. Defer; show `—` in the UI for now.
- **Module file location indicator** — user requested a UI badge for "stored on Pi" vs "local only". This needs a new column or a runtime probe; out of scope for the bug-fix pass.
- **Suggested queue advanced display** — could show `object_name` next to `module_name` now that `SuggestedPrintQueueItem` carries it, but the current UI works without it.
- **Stats page** — known separately broken; tracked in the main migration plan.

---

# Proposed fixes — file by file

This section turns the analysis above into a concrete edit list. Each change is described as one of: **add**, **replace**, **delete**, or **rewrite**. Imports and helper functions are addressed where they're broken — this is also a cleanup pass.

---

## A. `src/lib/types.ts` — add a join-aware print job type

**Why:** `PrintJobFull` describes only the columns of `print_jobs` plus nested relations. But the SQL in `getActivePrintJobs` / `getAllPrintJobs` adds ad-hoc joined columns (`module_name`, `module_weight`, `module_thumbnail`, `printer_name`, `printer_serial`, `expected_time_minutes`). Without a typed shape for these, every consumer needs `as any` casts.

**Add** a new exported type, immediately after `PrintJobFull`:

```ts
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
```

**Delete:** the type `PrintJobExtended` if it still appears anywhere in `types.ts` — it doesn't. So nothing to delete here, just verify with a grep.

---

## B. `src/lib/utils/printerData.ts` — verify, no changes

Already migrated correctly: uses `module.weight`, `module.filament_slots`, `module.printer_preset_id`, `loadedSpool.preset_id`, `loadedSpool.remaining_weight`. The signatures of `getActivePrintJob`, `getLastPrintJob`, `getCategorizedModules` are sound.

**No `getLoadedSpool` (singular) exists here** — confirm and rely on the upstream property instead.

---

## C. `src/routes/(main)/+page.svelte` — main dashboard rewrites

### C.1 Imports (line 3, 6)

**Replace** line 3:
```ts
import type { GridCell, SpoolSuggestion, Printer, PiStatus } from '$lib/types';
```
with:
```ts
import type { GridCell, SpoolSuggestion, DashboardPrinter, PiStatus } from '$lib/types';
```

**Replace** line 6:
```ts
import { getActivePrintJob, getLoadedSpool, getLastPrintJob, getCategorizedModules } from '$lib/utils/printerData';
```
with (drop `getLoadedSpool`):
```ts
import { getActivePrintJob, getLastPrintJob, getCategorizedModules } from '$lib/utils/printerData';
```

### C.2 `selectedPrinter` typing (line 29)

**Replace:**
```ts
let selectedPrinter: Printer | null = null;
```
with:
```ts
let selectedPrinter: DashboardPrinter | null = null;
```

### C.3 `dispatchNextStart` — collapse 3-path file routing (lines 345–406)

The file_stored_on_pi / local_file_handler_path branching no longer applies. Treat `module.filename` as the canonical file path.

**Replace** lines 352–353:
```ts
const hasPi = module.file_stored_on_pi && printer.printer_ip && printer.printer_serial && printer.printer_access_code;
const hasLocalHandler = module.local_file_handler_path && fileHandlerState.connected;
```
with:
```ts
const hasPi = !!(printer.printer_ip && printer.printer_serial && printer.printer_access_code);
const hasLocalHandler = !!(module.filename && fileHandlerState.connected);
```

**Replace** the `hasDirect && module.local_file_handler_path` block (line 380):
```ts
} else if (hasDirect && module.local_file_handler_path) {
  ...
  const filename = (module.local_file_handler_path as string).split('/').pop() ?? '';
```
with:
```ts
} else if (hasDirect && module.filename) {
  ...
  const filename = (module.filename as string).split('/').pop() ?? '';
```

**Replace** line 400:
```ts
if (res.ok && hasLocalHandler) await openFileLocally(module.local_file_handler_path, module.name, printer.id);
```
with:
```ts
if (res.ok && hasLocalHandler) await openFileLocally(module.filename, module.name, printer.id);
```

### C.4 `startAutoQueueNext` (line 484)

**Replace:**
```ts
if (!nextModule?.file_stored_on_pi || !printer.printer_ip) {
```
with:
```ts
if (!nextModule?.filename || !printer.printer_ip) {
```

### C.5 Success animation field (line 589)

**Replace:**
```ts
imagePath: job?.module_image_path ?? null,
```
with:
```ts
imagePath: (job as any)?.module_thumbnail ?? null,
```
(The `as any` cast goes away once `PrintJobWithDetails` is consumed at the type for `data.activePrintJobs`.)

### C.6 `handleStartPrint` spool check (line 874)

**Replace:**
```ts
if (!selectedPrinter?.loaded_spool_id) {
```
with:
```ts
if (!selectedPrinter?.loaded_spool) {
```

### C.7 Modal `loadedSpool` props — eliminate the helper call

Currently the four modal renderings call a non-existent helper:
```svelte
{@const loadedSpool = getLoadedSpool(selectedPrinter.loaded_spool_id, data.spools)}
```

**Replace** each of the four (lines 1115, 1134, 1169, 1186) with:
```svelte
{@const loadedSpool = selectedPrinter.loaded_spool}
```
(Or inline `loadedSpool={selectedPrinter.loaded_spool}` and drop the `{@const}` entirely. Inlining is cleaner.)

---

## D. `src/lib/components/dashboard/PrinterCard.svelte`

### D.1 Add the missing import

**Add** to the import block at line 6 (or anywhere in the script's import section):
```ts
import { getActivePrintJob } from '$lib/utils/printerData';
```

### D.2 Use the flat serial property (lines 177, 201)

**Replace** (both occurrences):
```ts
e.printer.secrets?.serial === printer.secrets?.serial
```
with:
```ts
e.printer.printer_serial === printer.printer_serial
```

### D.3 Type `activePrintForDot.module_weight` cleanly

Line 67 already uses `(activePrintForDot as any)?.module_weight || 0`. Once `data.activePrintJobs: PrintJobWithDetails[]` is typed end-to-end, the `as any` can go. Optional cleanup.

---

## E. `src/lib/components/dashboard/PrinterDetailModal.svelte`

### E.1 Imports (line 6)

**Replace:**
```ts
import type { Printer, Spool, PrintModule, PrintJobExtended, PiStatus } from '$lib/types';
```
with:
```ts
import type { DashboardPrinter, SpoolWithPreset, PrintModuleFull, PrintJobWithDetails, PiStatus } from '$lib/types';
```

### E.2 Prop types (lines 12–29)

**Replace** each:
- `printer: Printer` → `printer: DashboardPrinter`
- `activePrintJob: PrintJobExtended | undefined` → `activePrintJob: PrintJobWithDetails | undefined`
- `loadedSpool: Spool | null` → `loadedSpool: SpoolWithPreset | null`
- `printJobs: PrintJobExtended[]` → `printJobs: PrintJobWithDetails[]`
- `printModules: PrintModule[]` → `printModules: PrintModuleFull[]`
- `onToggleBroken: (printer: Printer, broken: boolean) => void` → `onToggleBroken: (printer: DashboardPrinter, broken: boolean) => void`
- `onEnqueue: (module: PrintModule, printer: Printer) => void` → `onEnqueue: (module: PrintModuleFull, printer: DashboardPrinter) => void`

### E.3 Printer model line (line 55)

**Replace:**
```svelte
<p class="...">{printer.model}</p>
```
with:
```svelte
<p class="...">{printer.preset?.brand ?? ''} {printer.preset?.model ?? ''}</p>
```

### E.4 BROKEN → inactive (lines 80, 377)

**Replace** both:
```svelte
{:else if printer.status === 'BROKEN'}
```
with:
```svelte
{:else if printer.status === 'inactive'}
```

### E.5 Active job weight field (lines 179, 185, 241)

**Replace** all `activePrintJob.weight` references:
- line 179: `loadedSpool.remaining_weight - (activePrintJob.weight ?? 0)` → `loadedSpool.remaining_weight - (activePrintJob.module_weight ?? 0)`
- line 185: `{activePrintJob.weight}g` → `{activePrintJob.module_weight ?? 0}g`
- line 241: `value={activePrintJob.weight}` → `value={activePrintJob.module_weight ?? 0}`

### E.6 Loaded spool nested fields (lines 266, 267, 271)

**Replace:**
```svelte
{loadedSpool.brand} {loadedSpool.material}
...
{loadedSpool.color || 'N/A'}
```
with:
```svelte
{loadedSpool.preset?.brand ?? ''} {loadedSpool.preset?.material ?? ''}
...
{loadedSpool.preset?.color || 'N/A'}
```

### E.7 Print success status comparison (line 304)

**Replace:**
```svelte
{#if lastPrintJob.status !== 'success' && lastPrintJob.failure_reason}
```
with:
```svelte
{#if lastPrintJob.status !== 'successful' && lastPrintJob.failure_reason}
```
(Line 292's `== 'successful'` is already correct.)

### E.8 Total Runtime rows (lines 318–323 and 384–389)

**Delete** both blocks for now (we can re-add a derived total later). The deletion removes the placeholder `{0}h` that misleadingly shows zero for every printer.

For idle state, delete:
```svelte
<div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
  <div class="flex justify-between items-center">
    <span class="text-sm text-zinc-400 dark:text-zinc-600">Total Runtime</span>
    <span class="text-zinc-900 dark:text-zinc-100 text-sm font-medium tabular-nums">{0}h</span>
  </div>
</div>
```
For broken state, delete the same block.

### E.9 Suggested queue serial reference (line 332)

**Replace:**
```svelte
disabled={startingSerials.has(printer.secrets?.serial ?? '')}
```
with:
```svelte
disabled={startingSerials.has(printer.printer_serial ?? '')}
```

---

## F. `src/lib/components/dashboard/ModuleSelectorModal.svelte`

### F.1 Imports (line 3)

**Replace:**
```ts
import type { Printer, Spool, PrintModule, SpoolPreset } from '$lib/types';
```
with:
```ts
import type { DashboardPrinter, SpoolWithPreset, PrintModuleFull, SpoolPreset } from '$lib/types';
```

### F.2 Prop types (lines 9, 10, 22)

- `printer: Printer` → `printer: DashboardPrinter`
- `loadedSpool: Spool | null` → `loadedSpool: SpoolWithPreset | null`
- `onEnqueue: (module: PrintModule, printer: Printer) => void` → `onEnqueue: (module: PrintModuleFull, printer: DashboardPrinter) => void`

### F.3 Loaded spool display (line 57)

**Replace:**
```svelte
Using: {loadedSpool.brand} {loadedSpool.material} - {loadedSpool.color} ({loadedSpool.remaining_weight}g)
```
with:
```svelte
Using: {loadedSpool.preset?.brand ?? ''} {loadedSpool.preset?.material ?? ''} - {loadedSpool.preset?.color ?? ''} ({loadedSpool.remaining_weight}g)
```

### F.4 Default spool preset derivation (lines 134, 199, etc.)

`module.default_spool_preset_id` is not populated by the server-side `getAllPrintModules` (it builds `filament_slots[]` instead). Two options:

**Option A (minimal):** derive at the top of the template:
```svelte
{@const defaultSpoolPresetId = module.filament_slots?.find(s => s.slot_index === 0)?.spool_preset_id ?? null}
```
and replace each `module.default_spool_preset_id` with `defaultSpoolPresetId`.

**Option B (cleaner):** add `default_spool_preset_id` to the SQL in `server/modules.ts:getAllPrintModules` (the GET handler at `api/print-modules` already does this). Then no derivation needed.

Prefer **Option B** for consistency between the two query paths. Adds one LEFT JOIN to module_filament_slots in the existing SELECT.

### F.5 Expected time field (lines 173, 298)

**Replace** both:
```svelte
{formatTime(module.expected_time ?? 0)}
```
with:
```svelte
{formatTime(module.expected_time_minutes ?? 0)}
```

### F.6 File-stored check (line 395)

**Replace:**
```svelte
{:else if selectedModule?.file_stored_on_pi && printer?.printer_ip}
```
with:
```svelte
{:else if selectedModule?.filename && printer?.printer_ip}
```

---

## G. `src/lib/components/dashboard/FailureReasonModal.svelte`

### G.1 Imports (line 4)

**Replace:**
```ts
import type { Spool, PrintJobExtended } from '$lib/types';
```
with:
```ts
import type { SpoolWithPreset, PrintJobWithDetails } from '$lib/types';
```

### G.2 Prop types (lines 11, 12)

- `activePrintJob: PrintJobExtended | undefined` → `activePrintJob: PrintJobWithDetails | undefined`
- `loadedSpool: Spool | null` → `loadedSpool: SpoolWithPreset | null`

### G.3 Template references

`loadedSpool.remaining_weight` at line 111 is unchanged (lives on `Spool`). If any other template reference uses `.brand` / `.material` / `.color`, add `.preset?.` prefix.

---

## H. `src/lib/components/dashboard/QuickStartModal.svelte`

### H.1 Imports + onEnqueue typing (line 19)

The script already imports the right types (`DashboardPrinter`, `SpoolWithPreset`, `PrintModuleFull`) — good. But `onEnqueue` is declared with the old `Printer` / `PrintModule` types:

**Replace:**
```ts
export let onEnqueue: (module: PrintModule, printer: Printer) => void;
```
with:
```ts
export let onEnqueue: (module: PrintModuleFull, printer: DashboardPrinter) => void;
```

### H.2 Loaded spool casts (lines 81, 82)

**Replace:**
```svelte
<div class="..." style="background-color: {(loadedSpool as any).color ?? '#888'}"></div>
<span class="...">{(loadedSpool as any).brand ?? ''} {(loadedSpool as any).material ?? ''}</span>
```
with:
```svelte
<div class="..." style="background-color: {loadedSpool.preset?.color ?? '#888'}"></div>
<span class="...">{loadedSpool.preset?.brand ?? ''} {loadedSpool.preset?.material ?? ''}</span>
```

---

## I. `src/lib/components/dashboard/SpoolSelectorModal.svelte`

### I.1 Imports (line 4)

**Replace:**
```ts
import type { Printer, SpoolPreset, SpoolSuggestion } from '$lib/types';
```
with:
```ts
import type { DashboardPrinter, SpoolPreset, SpoolSuggestion } from '$lib/types';
```

### I.2 Printer prop (line 11)

`export let printer: Printer;` → `export let printer: DashboardPrinter;`

---

## J. Server: include `default_spool_preset_id` in `getAllPrintModules`

In `src/lib/server/modules.ts`, the SELECT inside `getAllPrintModules` currently joins printer / plate / object but not `module_filament_slots`. The dashboard's ModuleSelectorModal expects `module.default_spool_preset_id` to exist. Either:

- **Add the join to the SELECT** (Option B from F.4), or
- **Add a `default_spool_preset_id` derivation step** after the rows come back.

The simpler and consistent fix is the join:

```ts
SELECT
  pm.*,
  pp.model  as printer_preset_model,
  pp.brand  as printer_preset_brand,
  plp.name  as plate_preset_name,
  o.name    as object_name,
  mfs.spool_preset_id as default_spool_preset_id
FROM print_modules pm
LEFT JOIN printer_presets pp  ON pm.printer_preset_id = pp.id
LEFT JOIN plate_presets   plp ON pm.plate_preset_id   = plp.id
LEFT JOIN objects         o   ON pm.object_id         = o.id
LEFT JOIN module_filament_slots mfs ON pm.id = mfs.module_id AND mfs.slot_index = 0
ORDER BY pm.name
```

Apply the same change to `getPrintModuleById` for parity.

If we keep `PrintModule` strict in `types.ts`, this aliased column won't fit — either extend `PrintModuleFull` with `default_spool_preset_id?: number | null` or accept `as any` casts at consumers. Recommend extending the type.

---

## K. Cleanup: dead imports across files

After the changes above, the following imports should not appear anywhere in `src/lib/components/dashboard/**` or `src/routes/(main)/**`:

- `PrintJobExtended` (type doesn't exist)
- `getLoadedSpool` from `printerData` (function doesn't exist)
- `Printer` as the type for a dashboard-level prop (use `DashboardPrinter`)
- `Spool` for loadedSpool props (use `SpoolWithPreset`)
- `PrintModule` for module props that need joined data (use `PrintModuleFull`)

A final grep step verifies the cleanup:
```
grep -rn "PrintJobExtended\|getLoadedSpool\b\|: Printer\b\|: Spool\b\|: PrintModule\b" src/routes/\(main\) src/lib/components/dashboard
```
Expected output: empty.

---

## L. Execution checklist

In order (each step keeps the build TypeScript-clean):

1. **types.ts** — add `PrintJobWithDetails`, extend `PrintModuleFull` with `default_spool_preset_id?: number | null`.
2. **server/modules.ts** — add the `module_filament_slots` LEFT JOIN to both queries.
3. **+page.svelte** — apply C.1 through C.7. The `data.activePrintJobs as any[]` casts can be tightened to `PrintJobWithDetails[]`.
4. **PrinterCard.svelte** — D.1, D.2.
5. **PrinterDetailModal.svelte** — E.1 through E.9.
6. **ModuleSelectorModal.svelte** — F.1 through F.6.
7. **FailureReasonModal.svelte** — G.1 through G.3.
8. **QuickStartModal.svelte** — H.1, H.2.
9. **SpoolSelectorModal.svelte** — I.1, I.2.
10. **Grep verification** — confirm no dead imports remain (section K).
11. **Manual smoke test** — load dashboard, open each modal, start a print, cancel it, fail one, complete one. Watch logs for runtime errors.

Each step should leave `npx tsc --noEmit` clean. If any step turns the build red, stop and debug before moving on.
