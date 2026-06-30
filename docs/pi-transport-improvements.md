# Pi / Direct transport — receive path + control improvements

Plan covering both transports (Pi HTTP bridge + desktop-direct Rust MQTT). Goal: fix the
fragile/broken bits of the status-receive path, make the dashboard truly live, and expand
the printer control surface — at parity across `pi` and `direct`.

---

## Current architecture (as of this plan)

```
Printer ──MQTT(8883)──► [pi] BambuMQTTClient._on_message  (pi/bambu_client.py)
                          ├─► _status_cache[serial]                    (pi/main.py, in-mem)
                          └─► POST /api/pi/webhook  (every message)    persists only success/failed → print_finished
        ──MQTT(8883)──► [direct] run_eventloop → emit "printer-status" (desktop/src-tauri/src/bambu.rs)

Browser  [pi]     poll /api/pi/status?serial= every 10s → pi /status/{serial}
         [direct] Tauri listen("printer-status") → piStatusBySerial   ((main)/+page.svelte)

print_finished is set ONLY by: api/pi/webhook (success/failed) and +page.server.ts timeout.
→ Desktop-direct has NO event-driven completion; it relies on the time-based `timedOut`
  derivation + a window.location.reload() on the FINISH transition.
```

Key shared state: `piStatusBySerial` (keyed by serial) in `+page.svelte` is fed by **both**
transports, and `PrinterCard` renders from it. This is the natural reconciliation point.

---

## Phase 0 — Stuck "Printing 99%" completion bug

**Status: code in working tree (not yet deployed).**

- `PrinterCard.svelte` — `liveIsPrinting` now ignores an effectively-done frame
  (`progress≥99`, `layer≥total`, `remaining==0`) when there is no active DB job.
  Transport-agnostic (covers pi + direct display). ✅
- `pi/main.py` — `on_status` synthesizes `FINISH` after the stuck condition persists
  `STUCK_FINISH_SECONDS` (90s): rewrites cache state, fires the `success` webhook, stops the
  leaked monitor. ✅

**Remaining Phase 0 parity item:** desktop-direct has no equivalent completion → a stuck
direct print never moves to `print_finished`. Fold into Phase A's unified completion (below)
rather than duplicating the 90s heuristic into Rust.

Verify: `bun run check` (done, clean), `py_compile` (done). Deploy Pi bridge; confirm the
stuck printer self-heals within ~90s and the job lands in `print_finished`.

---

## Phase A — Correctness & robustness of the receive path

**Status: implemented in working tree (not yet deployed).** `bun run check` + `py_compile` clean.

1. ✅ **Fix + consolidate cancel/pause/resume.** All three (`api/pi/{cancel,pause,resume}/+server.ts`)
   `SELECT * FROM printers` and read `printer_ip/serial/access_code` off the printer row, but
   those columns moved to **`printer_secrets`** in the migration → they currently send
   `undefined` creds. Replace the three near-identical files with one
   **`/api/pi/control` route** (body `{ printer_id, action: 'pause'|'resume'|'cancel' }`) that
   JOINs `printer_secrets` (mirror the query in `api/pi/status/+server.ts:33`). Keep the
   cancel-only "stamp failure_reason = 'Cancelled by user'" behaviour. Update
   `sendPrinterControl` in `+page.svelte` to call the unified route.

2. ✅ **Unified, event-driven completion** (closes the direct-transport gap + Phase 0 parity).
   Add a server route `POST /api/printer/[id]/finished` (or reuse a form action) that moves the
   printer's `printing` job → `print_finished`. Call it from the **single** finish-transition
   handler in `+page.svelte` (both the Tauri `printer-status` listener and `fetchPiStatus`
   converge on the same `justFinished` logic — extract it into one helper). The Pi webhook stays
   as the authoritative server-side path; this adds the direct path and a frontend fallback when
   the printer sticks at 99% (reuse the `liveDone` predicate from Phase 0).

3. ✅ **Status cache staleness signal.** Add `updated_at` (unix secs) to each `_status_cache`
   entry (`pi/main.py`) and surface it through `/status`. Frontend marks a frame stale past N
   seconds so a cached `RUNNING` can't masquerade as live (defense-in-depth for the 99% class).

4. ✅ **Webhook only on transitions.** In `pi/main.py` `on_status`, track last-sent mapped status
   per serial and POST the webhook only when it changes (or on terminal states) — stop POSTing
   the same `printing` every ~5s.

5. ✅ **MQTT reconnect/backoff (Pi + direct).** `BambuMQTTClient._on_disconnect` currently only flips a
   flag. Use paho's `reconnect_delay_set` + `loop_start` auto-reconnect, and re-`subscribe` in
   `_on_connect` (already does). Ensures a monitor survives transient drops instead of going
   silent until the 60s idle watchdog. (Rust `run_eventloop` already loops; add matching backoff
   on `Err`.)

---

## Phase B — Real-time push to the browser (kill the 10s poll)

Desktop-direct is already push (Tauri events). The **pi/web path** is the poll. Add Server-Sent
Events:

- **`GET /api/pi/stream?serial=` (SSE)** on CF Workers: opens an upstream stream to a new Pi
  endpoint **`GET /stream/{serial}`** that yields status frames as the monitor produces them
  (push the same dict currently cached). Worker relays frames to the browser as SSE.
- Pi side: have `on_status` fan out to any connected SSE subscribers (an `asyncio`/queue per
  serial) in addition to the cache. Keep the cache + `/status` for initial state and fallback.
- Frontend: a single `subscribeStatus(serial)` that prefers SSE and **falls back to the existing
  10s poll** if the stream errors or the Pi is unreachable. Reuse the existing
  `piStatusBySerial` update + transition logic so `PrinterCard` is unchanged.

This removes per-printer polling, cuts latency to real-time, and the transition/finish logic
already centralised in Phase A fires immediately.

---

## Phase C — Expanded printer controls (pi + direct parity)

All commands publish to the same MQTT request topic. Build a **shared command-payload builder**
so pi (Python) and direct (Rust) emit identical payloads:

| Control | Payload |
|---|---|
| Pause / Resume / Stop | `{"print":{"command":"pause|resume|stop","param":""}}` (existing) |
| Chamber light | `{"system":{"command":"ledctrl","led_node":"chamber_light","led_mode":"on|off"}}` |
| Print speed | `{"print":{"command":"print_speed","param":"1|2|3|4"}}` (silent/standard/sport/ludicrous) |
| Nozzle temp | `{"print":{"command":"gcode_line","param":"M104 S{t}\n"}}` |
| Bed temp | `... "M140 S{t}\n"` |
| Fans | `... "M106 P{1|2|3} S{0-255}\n"` (part/aux/chamber) |
| Home / move | `... "G28\n"`, jog via `G91/G1` |
| Arbitrary gcode | `{"print":{"command":"gcode_line","param":"..."}}` |

Implementation:
- **Pi:** generalise `_send_mqtt_command` (`pi/main.py:310`) behind one
  `POST /control/{serial}` taking `{ command, args }`; build payloads from a shared spec. The
  unified `/api/pi/control` route (Phase A) forwards these.
- **Direct:** `send_printer_command` (`bambu.rs:179`) already passes a command through; extend
  to accept a structured command + params and build the same payloads. Frontend `sendPrinterControl`
  already branches pi/direct — extend its `commandMap` to the new actions.
- **UI:** add controls to the printer detail modal — start with **light toggle, speed selector,
  nozzle/bed temp set** (one-liners, low risk), then fans / gcode / move behind an "advanced"
  section. Gate destructive/raw-gcode controls.

---

## Sequencing

1. **Phase 0** (done) — deploy & confirm the 99% fix.
2. **Phase A** — correctness first (broken controls, unified completion, staleness, transition
   webhook, reconnect). Highest value, lowest risk.
3. **Phase B** — SSE live push.
4. **Phase C** — expanded controls, incrementally (light/speed/temp → fans/gcode/move).

## Verification per phase

- **A:** `bun run check`; exercise pause/resume/cancel against a real printer via both transports;
  confirm a direct print now lands in `print_finished`; confirm webhook POST volume drops to
  transitions only; kill/restore the printer network and confirm the Pi monitor reconnects.
- **B:** confirm the dashboard updates in real time with the poll disabled; pull the Pi tunnel and
  confirm graceful fallback to polling.
- **C:** toggle light / set speed / set temps from the modal on both transports; confirm payloads
  match between Pi and Rust (diff the MQTT logs).
