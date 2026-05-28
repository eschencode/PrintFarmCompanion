# Graph Report - PrintFarmCompanion  (2026-05-28)

## Corpus Check
- 140 files · ~171,064 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 824 nodes · 1159 edges · 66 communities (54 shown, 12 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f8d8e43b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 58|Community 58]]

## God Nodes (most connected - your core abstractions)
1. `scripts` - 17 edges
2. `log()` - 16 edges
3. `BambuMQTTClient` - 13 edges
4. `compilerOptions` - 12 edges
5. `getAllInventoryItems()` - 12 edges
6. `AIContextBuilder` - 11 edges
7. `🖨️ Print Farm Companion` - 11 edges
8. `upload_file_ftps()` - 10 edges
9. `bundle` - 9 edges
10. `send_print_command()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `for()` --calls--> `number`  [INFERRED]
  src/lib/components/ZipBulkUpload.svelte → src/routes/(main)/inventory/+page.svelte
- `load()` --calls--> `prioritizeInventoryFromContext()`  [INFERRED]
  src/routes/(main)/recommendations/+page.server.ts → src/lib/ai/recommendation-service.ts
- `load()` --calls--> `getSuggestedPrintQueue()`  [INFERRED]
  src/routes/(main)/recommendations/+page.server.ts → src/lib/ai/recommendation-service.ts
- `load()` --calls--> `number`  [INFERRED]
  src/routes/app/+page.server.ts → src/routes/(main)/inventory/+page.svelte
- `load()` --calls--> `number`  [INFERRED]
  src/routes/(main)/recommendations/+page.server.ts → src/routes/(main)/inventory/+page.svelte

## Communities (66 total, 12 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (44): actions, buildSetLabel(), getSetDefinitions(), load(), SetComponent, SetDefinition, actions, load() (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (46): devDependencies, eslint, @eslint/compat, @eslint/js, eslint-plugin-svelte, globals, svelte-check, @sveltejs/adapter-cloudflare (+38 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (26): fd, mod, p, preset, { category, subcategory, color }, CategoryGroup, count, groupedItem (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (35): 1. Clone and install dependencies, 2. Create the `.env` file, 3. Set up the Cloudflare tunnel, 4. Install systemd services, 5. Verify, Check status, code:bash (sudo systemctl status printfarm cloudflared), code:bash (cd ~) (+27 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (7): createSpool(), deleteGridPreset(), getAllGridPresets(), getGridPresetById(), loadSpool(), loadSpoolToPrinter(), unloadSpool()

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (31): 1. Clone the Repository, 2. Install Dependencies, 3. Set Up the Database, 4. Run Development Server, 🙏 Acknowledgments, code:bash (git clone https://github.com/eschencode/PrintFarmCompanion.g), code:bash (bun install), code:bash (# Create D1 database) (+23 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (22): dependencies, echarts, @tauri-apps/api, $lib/components/stats/ModuleBreakdown.svelte, $lib/components/stats/TimeRangeSelector.svelte, categoryPercentage, colorPercentage, modulePercentage (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (14): POST(), @sveltejs/kit, closeOpenPrintJobsForPrinter(), GET(), POST(), DELETE(), GET(), PATCH() (+6 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (16): svelte/store, autoStartMode, quickStartMode, directPrinterEnabled, fileHandlerEnabled, manualModeEnabled, printerPiEnabled, desktopVersion (+8 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (21): D1Result, GridPreset, LoadSpoolResponse, MaterialUsage, NewGridPreset, NewPrinter, NewPrintModule, NewSpool (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (23): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+15 more)

### Community 11 - "Community 11"
Cohesion: 0.10
Nodes (19): cancel_print(), _idle_watchdog(), pause_print(), _poll_idle_printer(), Print Farm Companion — Pi Bridge Server Runs on the Raspberry Pi, exposed via Cl, Receive a .gcode.3mf file from CF Workers and save it to disk.     Returns the l, Connect, publish a single MQTT command, then disconnect., Send MQTT stop command to the printer. (+11 more)

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (12): BambuDirectManager, build_mqtt_client(), float_field(), int_field(), merge_status(), PrinterConn, PrinterConnectionEvent, PrinterStatusEvent (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (8): ShopifyClient, ShopifyLineItem, ShopifyOrder, ShopifyOrdersResponse, ShopifySyncService, SkuMapping, SyncResult, SyncState

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (16): @tauri-apps/api/event, [], formData, getActivePrintJob(), getLoadedSpool(), hasPending, { imagePath }, module (+8 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (12): ImplicitFTP_TLS, _path_candidates(), Bambu Lab printer client — FTPS file upload + MQTT print command + status monito, Pick FTP STOR subdirectories to try based on printer model.     H2S/H2D use USB, Upload a .gcode.3mf file to the printer via FTPS (implicit TLS, port 990).     R, High-level: upload file via FTPS then send MQTT print command.     Returns task_, FTP_TLS subclass that wraps the socket with TLS immediately on connect     (impl, Override to ignore TLS close_notify timeout — Bambu servers don't send it. (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (16): _find_gcode_param(), Inspect the .3mf zip archive and return the internal gcode path for the MQTT par, Read filament_sequence.json from the .3mf archive.     Returns a list of filamen, _read_filament_info(), get_logs(), log(), LogEntry, Structured in-memory log buffer for the Pi bridge server. Stores log entries in (+8 more)

### Community 17 - "Community 17"
Cohesion: 0.16
Nodes (14): Confidence, confidenceFromDaysWithSales(), RISK_THRESHOLDS, PRIORITY_SCORES, SuggestedPrintQueueItem, UnrolledItem, AIRecommendationContext, InventoryPriority (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.14
Nodes (10): handleNameInput(), product(), actions, Product, ProductModule, ProductSkuMapping, slugify(), stockBadge() (+2 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (13): 1. Prerequisites on the printer, 2. Set up the Pi, 3. Install as a systemd service, 4. Set up Cloudflare Tunnel, 5. Configure CF Workers, 6. Configure printers in the app, 7. Verify end-to-end, code:bash (# Create working directory) (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.16
Nodes (12): key, reader, val, value, k, reader, v, jszip (+4 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (13): compilerOptions, allowJs, checkJs, esModuleInterop, forceConsistentCasingInFileNames, moduleResolution, resolveJsonModule, rewriteRelativeImportExtensions (+5 more)

### Community 22 - "Community 22"
Cohesion: 0.36
Nodes (8): actions, load(), GET(), buildFailureAnalysis(), buildModuleBreakdown(), buildSpoolUsage(), computeUtilization(), SpoolUsageEntry

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (10): spool, @tauri-apps/api/core, $lib/components/EditModuleModal.svelte, $lib/components/settings/ConnectionsSection.svelte, $lib/assets/favicon.ico, $lib/stores/connectionToggles, $lib/stores/desktop, $lib/stores/fileHandler (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (10): code:bash (curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | ), code:bash (cargo install tauri-cli --version "^2.0"), code:bash (xcode-select --install), code:bash (cd desktop/src-tauri && cargo tauri icon icons/app-icon.png), code:bash (npm run desktop:dev     # starts SvelteKit on :5173 AND open), One-time setup, Print Farm Companion — Desktop Shell, Run (+2 more)

### Community 25 - "Community 25"
Cohesion: 0.31
Nodes (8): BaseModel, BambuMQTTClient, PrinterCredentials, PrintStatus, Long-lived MQTT client for a single printer.     Subscribes to status reports an, DeleteFileRequest, PrinterRequest, PrintRequest

### Community 26 - "Community 26"
Cohesion: 0.27
Nodes (8): AIRecommendationService, generateAndSaveSuggestedQueue(), getSuggestedPrintQueue(), prioritizeInventoryFromContext(), GET(), for(), number, updatePrinter()

### Community 27 - "Community 27"
Cohesion: 0.29
Nodes (7): getAllPrinters(), getAllPrintModules(), getSpoolById(), load(), emptyPrioritized(), forecastConfig(), load()

### Community 28 - "Community 28"
Cohesion: 0.29
Nodes (10): completePrintJob(), getPrinterById(), getPrintJobById(), getPrintModuleById(), markSuggestedQueueItemDone(), startPrintJob(), updatePrinterHours(), updatePrinterStatus() (+2 more)

### Community 29 - "Community 29"
Cohesion: 0.20
Nodes (6): Printer, PrintJobExtended, PrintModule, Spool, CategorizedModules, emptyCategorizedModules

### Community 30 - "Community 30"
Cohesion: 0.22
Nodes (9): compatModules, qPos, $lib/components/dashboard/ModuleSelectorModal.svelte, $lib/components/dashboard/PrinterCard.svelte, $lib/components/dashboard/PrinterDetailModal.svelte, $lib/actions/shine, $lib/utils/printerData, $lib/utils/printerImage (+1 more)

### Community 31 - "Community 31"
Cohesion: 0.24
Nodes (9): failureReasons, selectedPreset, $app/forms, $lib/components/dashboard/ConnectionStatusIndicator.svelte, $lib/components/dashboard/FailureReasonModal.svelte, $lib/components/dashboard/GridNavigation.svelte, $lib/components/dashboard/QuickStartModal.svelte, $lib/components/dashboard/SpoolSelectorModal.svelte (+1 more)

### Community 32 - "Community 32"
Cohesion: 0.36
Nodes (6): formatTimeAgo(), formatTime(), getElapsedTime(), getElapsedTimeMinutes(), getProgress(), getRemainingTime()

### Community 33 - "Community 33"
Cohesion: 0.25
Nodes (6): _build_ams_mapping(), build_print_command(), Build the ams_mapping array for the MQTT print command.     For external spool (, Build the MQTT 'project_file' print command payload.     remote_path is the path, Send MQTT print command for an already-uploaded file.     Designed to be called, send_print_command()

### Community 35 - "Community 35"
Cohesion: 0.32
Nodes (7): actions, computePrinterFlags(), EMPTY, getCompatibleModules(), load(), PrinterFlags, TopSuggested

### Community 36 - "Community 36"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 37 - "Community 37"
Cohesion: 0.33
Nodes (4): item, t, thresholdMarkers, ./$types

### Community 38 - "Community 38"
Cohesion: 0.40
Nodes (5): CATEGORY_COLORS, CategoryColor, getCategoryColor(), hashString(), UNCATEGORIZED_COLOR

### Community 39 - "Community 39"
Cohesion: 0.47
Nodes (3): generate_token(), run(), SidecarHandle

### Community 40 - "Community 40"
Cohesion: 0.53
Nodes (5): PATCH(), markPrinterBroken(), markPrinterRepaired(), updatePrinterTransport(), TransportMode

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (3): $lib/components/settings/AutoQueueSection.svelte, $lib/stores/autoQueueStore, ./$types

### Community 45 - "Community 45"
Cohesion: 0.50
Nodes (4): getSuggestedQueueByPrinterId(), actions, load(), ./$types

### Community 46 - "Community 46"
Cohesion: 0.50
Nodes (4): get_printers(), Return unique printers seen in logs., get_log_printers(), Return list of unique printers seen in the log buffer.

## Knowledge Gaps
- **270 isolated node(s):** `config`, `name`, `private`, `version`, `type` (+265 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Community 1` to `Community 20`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `svelte` connect `Community 20` to `Community 1`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `ShopifyClient` connect `Community 13` to `Community 7`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `config`, `name`, `private` to the rest of the system?**
  _300 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06464646464646465 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._