---
name: Unified print_modules schema
description: print_modules table supports both local file handler and Pi bridge systems; path renamed to local_file_handler_path in migration 015
type: project
---

The print_modules table was unified in migration 015 to support two independent print systems:

- **Local file handler** (`local_file_handler_path`): opens .3mf in Bambu Studio on the local machine via a Fastify service on port 3001
- **Pi bridge** (`pi_file_path`, `file_stored_on_pi`): pushes .3mf to Raspberry Pi for automated printing

New .3mf metadata columns added: `file_name`, `thumbnail` (base64 PNG), `filament_type`, `filament_color`, `plate_type`, `nozzle_diameter`

`expected_weight` and `local_file_handler_path` are now nullable (not required at creation time).

**Why:** Both systems should work independently — if Pi is unavailable, local file handler still works. Single source of truth for both.

**How to apply:** When creating/updating modules, use `localFileHandlerPath` (camelCase in TS) for the local path and `piFilePath` for the Pi path. `db:reset` runs schema.sql + seed.sql only (no separate migration files needed for local dev).
