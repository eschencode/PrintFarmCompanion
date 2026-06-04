# Print Start Flow

How a print goes from "user clicks Start" to "printer card shows Printing". Covers the four transport paths, the sequential start queue, and the UI states the card cycles through.

---

## Entry points

All four flows end up calling the same function in `src/routes/(main)/+page.svelte`:

```ts
enqueueStart(module, printer)
```

The callers:

| UI surface | When |
|---|---|
| `QuickStartModal` | Single-tap start on a printer with a Quick Start recommendation |
| `ModuleSelectorModal` | Manual module pick after spool/printer is set up |
| `PrinterDetailModal` | "Print this" on a suggested-queue card inside the detail modal |

`enqueueStart` closes any open modal, pushes the entry into `startQueue`, persists to `localStorage` under `printfarm_start_queue`, and calls `dispatchNextStart()` if this is the only entry.

## Sequential dispatch

`startQueue` is a FIFO of `{ printer, module, enqueuedAt, startedAt }`. Only the head is in flight at any moment — the rest sit waiting. This matches real-world print farm behaviour: feeding G-code to two printers at the same time risks one of them silently dropping the file (we hit this with concurrent Pi uploads), and the "Starting…" badge would otherwise lose meaning if every printer claimed it simultaneously.

The queue is **persisted to localStorage**. If the user reloads or navigates away mid-dispatch, `onMount` restores the queue and resumes from the head.

A 120 s safety-net `setTimeout(advanceStartQueue, 120_000)` is armed every time the queue head is dispatched, so a printer that never transitions through `PREPARE` can't permanently stall the queue.

## Transport branches

`effectiveTransport(printer)` resolves to one of `'direct' | 'pi' | 'manual'`. Precedence:

1. `manualModeEnabled` toggle wins everything → `manual`.
2. Explicit `printer.transport === 'direct'` and direct is viable (Tauri desktop + IP + serial + access code) → `direct`.
3. Explicit `printer.transport === 'pi'` → `pi`.
4. Otherwise auto: direct if viable, else pi.

The dispatch in `dispatchNextStart()` then takes one of four branches:

### 1. Manual

```ts
POST  ?/startPrint   (form action → db.startPrintJob)
await invalidateAll()
setTimeout(advanceStartQueue, 3_000)
```

No printer connection. The DB row is created (with `expected_end_time = start_time + expected_time_minutes`), the page loader re-runs (so `data.activePrintJobs` and the derived `printer.status === 'printing'` flip), and the queue advances blindly after 3 s. Progress on the card becomes time-based via `getProgress(start_time, expected_time_minutes)`.

There's no printer to report FINISH, so the only completion signal is the clock: once `expected_end_time` passes, `+page.svelte` triggers a one-shot `invalidateAll()` and `+page.server.ts` derives `printer.status === 'finished'` (any active `printing` job with `expected_end_time` in the past). The card flips to the violet "Confirm result" prompt and the user confirms success/failure via the detail modal. Pi prints leave `expected_end_time` null and rely on the webhook instead, so this time fallback only governs the manual/direct/fallback paths.

### 2. Pi bridge (`hasPi`, default when a Pi is configured)

```ts
POST  /api/pi/print   (Pi handles file upload + print start, inserts print_jobs row)
startPiPolling(serial)
await invalidateAll()
// queue advances on PREPARE→RUNNING (or 120 s safety net)
```

The Pi-side endpoint owns the DB insert (`+api/pi/print/+server.ts`) — there's no client-side form POST. Pi-status polling (`/api/pi/status`) runs every 10 s; when it observes the `PREPARE → RUNNING` transition for the head-of-queue printer, `advanceStartQueue()` fires.

### 3. Direct MQTT (`hasDirect`, requires Tauri + local file)

```ts
POST   ?/startPrint                        (DB row first)
invoke 'start_print_direct'                (Tauri → Bambu MQTT)
await invalidateAll()
setTimeout(advanceStartQueue, 3_000)
```

The file is assumed already on the printer SD card at `/cache/<filename>` (the Tauri side handles upload elsewhere). The MQTT command kicks the print; the Bambu printer then emits its own status events on the `printer-status` Tauri channel, which feeds `piStatusBySerial` directly.

### 4. Fallback (no Pi, no direct)

```ts
POST  ?/startPrint
if (hasLocalHandler) openFileLocally(module.filename, ...)
await invalidateAll()
setTimeout(advanceStartQueue, 3_000)
```

DB row + optional local file-handler open (for legacy desktop file-association flow). Behaves like manual mode plus an OS-level file open.

## Why `invalidateAll()` and not `window.location.reload()`

Earlier versions reloaded the whole page after every start. Two problems:

1. The "Starting…" queue badge disappeared during navigation and reappeared after the load — visibly janky.
2. `localStorage` queue restoration worked but felt redundant when the only state that needed refreshing was `data.activePrintJobs`.

`invalidateAll()` re-runs only the `load()` function in `+page.server.ts`. Component-local state (`startQueue`, `startingPrinterIds`, `piStatusBySerial`, modal state, scroll position) survives because the component doesn't unmount. Net result: the amber "Starting…" stays visible across the data refresh, and when the 3 s timeout (or `PREPARE → RUNNING`) advances the queue, the card flips smoothly to blue "Printing" because `printer.status` is now `'printing'` from the refreshed `data`.

## Card UI states

`PrinterCard.svelte` resolves the status in this priority order:

```svelte
{#if liveIsStarting}              → amber "Starting…" or "Queue n/total"
{:else if liveIsPrinting || printer.status === "printing"}   → blue "Printing"
{:else if printer.status === "idle"}                          → green/yellow/red Idle (capacity dot)
{:else if printer.status === "inactive"}                      → red "Inactive"
```

Where:

- `liveIsStarting = startingPrinterIds.has(Number(printer.id))` — true while this printer is anywhere in `startQueue`. Keyed on **printer id**, not serial, because manual-mode printers have `printer_serial === null` and a Set keyed on null would match every manual printer at once.
- `liveIsPrinting = piLive && ["RUNNING","PREPARE","PAUSE"].includes(piLive.gcode_state)` — driven by Pi polling or direct MQTT events.
- `printer.status` is derived server-side in `+page.server.ts:34` from `activePrintJobs`. Refreshed by `invalidateAll()`.

For a manual print the transition is:

1. **t=0** Click Start → `liveIsStarting=true` → amber "Starting…".
2. **~100 ms** `invalidateAll()` resolves → `printer.status='printing'` in data, but `liveIsStarting` still wins.
3. **t=3 s** `advanceStartQueue()` removes from queue → `liveIsStarting=false`, falls to next branch → `printer.status==='printing'` → blue "Printing".

For Pi / direct the transition is the same, except the queue advances on the `PREPARE → RUNNING` event from the printer rather than a blind 3 s timer, and `liveIsPrinting` takes over from `printer.status` once `piLive` exists.

## Termination

`advanceStartQueue()` slices the head off, persists, and dispatches the next entry if any. It does **not** trigger a reload. Live state from polling or MQTT continues to flow into `piStatusBySerial` independently.

When a Pi-tracked print reaches `FINISH`/`FAILED`, the `FINISH`/`FAILED` transition handlers in `fetchPiStatus()` and the MQTT `printer-status` listener trigger a full `window.location.reload()` — a deliberate hard refresh from a clean server load. The reload does **not** complete the job: the Pi webhook has moved it to `print_finished` ("awaiting confirmation"), surfaced as a violet "Confirm result" card. The job is only marked `successful`/`failed` — and spool weight deducted, inventory updated — when the user confirms manually via `PrinterDetailModal`. The printer can't tell a good print from a failed one, so completion is never automatic.

## Key files

| File | Role |
|---|---|
| `src/routes/(main)/+page.svelte` | `enqueueStart`, `dispatchNextStart`, `advanceStartQueue`, queue persistence, Pi polling, MQTT listeners |
| `src/routes/(main)/+page.server.ts` | `startPrint` form action, status derivation in `load()` |
| `src/lib/server/jobs.ts` | `startPrintJob()` — inserts `print_jobs` + snapshots `print_job_spools` |
| `src/routes/(main)/api/pi/print/+server.ts` | Pi bridge: file upload + print kick + DB insert |
| `desktop/src-tauri/src/bambu.rs` | Direct MQTT: `start_print_direct`, status event emission |
| `src/lib/components/dashboard/PrinterCard.svelte` | UI state priority resolution |
| `src/lib/components/dashboard/StartQueueToast.svelte` | Bottom-left toast when `startQueue.length > 1` |

## Known constraints

- The 3 s timeout in manual/direct/fallback paths is arbitrary. Long enough to feel deliberate, short enough not to block the next start. If a user starts a batch of seven manual prints, total dwell is ~21 s before the last one is queue-released — acceptable because manual mode is the slow path anyway.
- `startingPrinterIds` (component state) and `print_jobs.status='printing'` (DB) can briefly disagree during the 3 s window. The card prefers `liveIsStarting` first so the user sees the in-flight visual.
- localStorage queue restoration on reload does **not** re-POST the start — it assumes the DB row already exists from the original dispatch. If the user reloads *before* the original POST completed, the entry will sit in the queue with no backing DB row until the 120 s safety net advances it.
