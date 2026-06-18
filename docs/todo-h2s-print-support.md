# TODO: H2S/H2D print support (`mqtt message verify failed`)

Status as of 2026-06-17. Picking this up later.

The H2S (`Vorarbeiter 01`, `192.168.178.133`) can now receive files but **rejects the
print command**. P1S printers (Mitarbeiter 0x) work end-to-end. Everything except the
final print-start command is fixed.

## What's already fixed (done)

The whole FTPS upload pipeline now works for the H2S:

| Fix | File | Detail |
|---|---|---|
| TLS-close log read merged state | `pi/bambu_client.py` `_on_message` | temps no longer log `None` |
| `522 session reuse required` | `pi/bambu_client.py` | force TLS 1.2 + `ntransfercmd` reuses control session |
| `426 Failure reading network stream` | `pi/bambu_client.py` `storbinary` | send `close_notify` (don't block on printer's reply) |
| PASV hang guard | `pi/bambu_client.py` `makepasv` | force data channel to control host |
| Upload errors surfaced to in-app log | `pi/main.py` `trigger_print` | was stderr-only |
| Model passed through to Pi | `src/routes/(main)/api/pi/print/+server.ts` | joins `printer_presets.model`, sends `printer_model`; Pi `_path_candidates` now picks H2 USB paths instead of `model=unknown` → `['cache','model','']` |

Upload result on H2S: `STOR cache/Halterx1.gcode.3mf` → `226` → `/cache/Halterx1.gcode.3mf`. ✅

## The remaining blocker

Print command response from the H2S:

```json
{"command": "project_file", "err_code": 84033543,
 "reason": "mqtt message verify failed", "result": "failed",
 "task_id": "beb15381-e40d-45ab-99f4-3ccc3efee4a2", ...}
```

- `err_code` `84033543` = `0x05024007`.
- The H2-series firmware validates the `project_file` command differently than P1S/X1
  (which accept the identical payload). This is **not** the FTPS code — the file is on
  the printer correctly.
- Symptom on dashboard: printer never leaves `gcode_state=FINISH`, so polling marks the
  job "Done" instantly. That's a *symptom* of the rejected command, not a separate bug —
  it resolves once the printer actually goes `RUNNING`.

## Current command payload (works on P1S, rejected by H2S)

`build_print_command` in `pi/bambu_client.py`:

```json
{"print": {"sequence_id": "...", "command": "project_file",
  "param": "Metadata/plate_1.gcode",
  "url": "file:///sdcard/cache/Halterx1.gcode.3mf",
  "subtask_id": "0", "profile_id": "0",
  "task_id": "<uuid>", "project_id": "0",
  "bed_type": "auto", "bed_leveling": true, "flow_cali": false,
  "vibration_cali": true, "layer_inspect": false,
  "use_ams": false, "ams_mapping": [{"ams": 255, "slot": 255}],
  "timelapse": false}}
```

## Hypotheses to try (cheapest first)

Now that the model arrives as `H2S`, gate any H2-only change on the model so the working
P1S flow is untouched (e.g. `if "H2" in printer_model.upper()`).

1. **Numeric `task_id`** — send `task_id: "0"` to the printer; keep the UUID for webhook
   tracking (the monitor/webhook matching uses it, the printer command doesn't need to).
   Newer firmware often rejects non-numeric task ids for LAN prints. *One-line, gated.*
2. **URL scheme / path** — H2S may not mount FTP storage at `/sdcard`. Try
   `file:///cache/...` or the H2 USB mount path instead of `file:///sdcard/cache/...`.
3. **Missing required field** — newer firmware may require an `md5` of the uploaded file
   in the command, or other added fields.
4. **Possible hard limitation** — H2D/H2S local/LAN `project_file` printing is reportedly
   finicky/unsupported in third-party tools due to this verification change. Confirm
   before sinking time into payload tweaks.

## Next action

- [ ] Web-search the exact H2-series `project_file` / `mqtt message verify failed`
      requirement (was rate-limited 2026-06-17). Check community impls: `bambulabs_api`,
      `pybambu`, Home Assistant `ha-bambulab`, OrcaSlicer network code.
- [ ] Deploy the app (model passing) so the Pi sees `H2S`.
- [ ] Apply the chosen experiment, gated to H2, redeploy `pi/`, retry, read
      `journalctl -u printfarm -f | grep -Ei "mqtt|print|verify"`.

## Deploy reminders

- Pi files live in `~/printfarm/pi/` on `192.168.178.210` (NOT `~/printfarm/`):
  `scp pi/bambu_client.py pi/main.py linus@192.168.178.210:~/printfarm/pi/`
  then `ssh linus@192.168.178.210 sudo systemctl restart printfarm`.
- The `/api/pi/print` model change is app-side (Cloudflare Worker) — ships with the app
  build, no Pi scp.

## Minor cleanup (unrelated)

- `[FTPS] system:` / `[MQTT] system:` log lines from `storbinary`/`build_print_command`
  lack the printer name (those helpers have no printer context). Thread serial/name
  through if we want them grouped under the printer in the viewer.
