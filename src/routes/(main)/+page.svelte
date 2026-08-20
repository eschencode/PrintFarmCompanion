<script lang="ts">
    import type { PageData } from "./$types";
    import type {
        GridCell,
        SpoolSuggestion,
        DashboardPrinter,
        LiveStatus,
        FailurePrefill,
    } from "$lib/types";
    import { enhance } from "$app/forms";
    import { invalidateAll } from "$app/navigation";
    import { browser } from "$app/environment";
    import {
        formatTime,
        formatRemainingTime,
        getElapsedTime,
        getRemainingTime,
        getProgress,
    } from "$lib/utils/time";
    import {
        getActivePrintJob,
        getLastPrintJob,
        getCategorizedModules,
    } from "$lib/utils/printerData";
    import { shine } from "$lib/actions/shine";
    import StartQueueToast from "$lib/components/dashboard/StartQueueToast.svelte";
    import StartErrorToast from "$lib/components/dashboard/StartErrorToast.svelte";
    import GridNavigation from "$lib/components/dashboard/GridNavigation.svelte";
    import PrinterCard from "$lib/components/dashboard/PrinterCard.svelte";
    import QuickStartModal from "$lib/components/dashboard/QuickStartModal.svelte";
    import FailureReasonModal from "$lib/components/dashboard/FailureReasonModal.svelte";
    import SpoolSelectorModal from "$lib/components/dashboard/SpoolSelectorModal.svelte";
    import ModuleSelectorModal from "$lib/components/dashboard/ModuleSelectorModal.svelte";
    import PrinterDetailModal from "$lib/components/dashboard/PrinterDetailModal.svelte";
    import PrinterHistoryModal from "$lib/components/dashboard/PrinterHistoryModal.svelte";
    import type { SubmitFunction } from "@sveltejs/kit";
    import { onMount, onDestroy } from "svelte";
    import { writable, get } from "svelte/store";
    import { fileHandlerStore } from "$lib/stores/fileHandler";
    import { quickStartMode } from "$lib/stores/autoQueueStore";
    import {
        fileHandlerEnabled,
        directPrinterEnabled,
        manualModeEnabled,
    } from "$lib/stores/connectionToggles";
    import { isDesktop } from "$lib/stores/desktop";
    import type { TransportMode, DetectedExternalPrint } from "$lib/types";
    import {
        computeDepletion,
        worstStatus,
        STATUS_DOT,
    } from "$lib/spool-status";

    export let data: PageData;

    // Aggregate spool depletion status for the Materials card dot.
    $: spoolUsageById = new Map(
        (data.spoolUsage ?? []).map((u) => [Number(u.preset_id), u]),
    );
    $: spoolStatuses = (data.spoolPresets ?? [])
        .filter(
            (p) =>
                (p.in_storage ?? 0) > 0 ||
                (spoolUsageById.get(Number(p.id))?.used_30d ?? 0) > 0,
        )
        .map(
            (p) =>
                computeDepletion(
                    p.in_storage ?? 0,
                    spoolUsageById.get(Number(p.id))?.used_30d ?? 0,
                ).status,
        );
    $: spoolWorstStatus = worstStatus(spoolStatuses);

    let selectedPrinter: DashboardPrinter | null = null;

    // Success animation
    type Particle = {
        id: number;
        x: number;
        y: number;
        delay: number;
        drift: number;
        rotate: number;
        scale: number;
    };
    let successParticles: Particle[] = [];
    let successImageSrc: string | null = null;
    let particleCounter = 0;

    // Float-up "added to inventory" animation. Called directly on a successful
    // completion (no reload needed) — image is the finished module's thumbnail.
    function playSuccessAnimation(imagePath: string | null) {
        successImageSrc = imagePath;
        successParticles = [
            {
                id: particleCounter++,
                x: window.innerWidth * 0.5,
                y: window.innerHeight * 0.6,
                delay: 0,
                drift: (Math.random() - 0.5) * 20,
                rotate: (Math.random() - 0.5) * 10,
                scale: 1,
            },
        ];
        setTimeout(() => {
            successParticles = [];
            successImageSrc = null;
        }, 2200);
    }

    let showSpoolSelector: boolean = false;
    let spoolTargetSlotIndex: number = 0;
    let showModuleSelector: boolean = false;
    let showFailureReasonModal: boolean = false;
    let showHistoryModal: boolean = false;
    let failurePrefill: FailurePrefill | null = null;

    // Quick Start state
    let showQuickStart = false;
    let quickStartLoading = false;

    $: fileHandlerState = $fileHandlerStore;

    // Reactive clock for live progress updates
    const nowStore = writable(Date.now());
    $: now = $nowStore;
    let tickerInterval: ReturnType<typeof setInterval>;

    // Manual/direct/fallback prints have no printer to report FINISH — their only
    // completion signal is the estimated end time elapsing. When it passes, refresh
    // once so the server re-derives the printer as 'finished' (awaiting confirmation)
    // and the card surfaces the "Confirm result" prompt.
    const timedOutJobs = new Set<number>();
    $: if (browser && now) {
        for (const job of data.activePrintJobs as any[]) {
            if (
                job.status === "printing" &&
                job.expected_end_time != null &&
                job.expected_end_time * 1000 <= now &&
                !timedOutJobs.has(job.id)
            ) {
                timedOutJobs.add(job.id);
                invalidateAll();
            }
        }
    }
    onMount(async () => {
        // Restore dismissed/adopted external prints so they don't re-surface.
        try {
            const raw = localStorage.getItem(HANDLED_EXTERNAL_KEY);
            if (raw)
                for (const t of JSON.parse(raw) as string[])
                    handledExternalTasks.add(t);
        } catch {}

        // Restore start queue from localStorage
        const restored = loadStartQueue();
        if (restored.length > 0) {
            startQueue = restored;
            dispatchNextStart();
        }

        tickerInterval = setInterval(() => {
            nowStore.set(Date.now());
        }, 5000);

        const directOn = get(directPrinterEnabled);

        // Register the Tauri MQTT listeners BEFORE subscribing any printer, so the
        // first status frames emitted right after connect aren't dropped.
        if ($isDesktop && directOn) {
            const stateLabels: Record<string, string> = {
                IDLE: "Idle",
                PREPARE: "Preparing…",
                RUNNING: "Printing",
                PAUSE: "Paused",
                FINISH: "Done",
                FAILED: "Failed",
            };
            const { listen } = await import("@tauri-apps/api/event");
            const { emit } = await import("@tauri-apps/api/event");
            // Diagnostic: prove the status listener actually registers in the webview.
            let firstStatusLogged = false;
            import("@tauri-apps/api/core").then(({ invoke }) =>
                invoke("frontend_log", {
                    level: "info",
                    message: "UI status listener registered",
                    serial: null,
                    name: null,
                }).catch(() => {}),
            );

            const unlistenStatus = await listen<{
                serial: string;
                printer_id: number;
                gcode_state: string;
                stage: string;
                progress: number;
                layer_num: number;
                total_layer_num: number;
                remaining_time: number | null;
                nozzle_temp: number | null;
                bed_temp: number | null;
                chamber_temp: number | null;
                subtask_name: string | null;
                gcode_file: string | null;
                nozzle_target_temp: number | null;
                bed_target_temp: number | null;
                cooling_fan_speed: number | null;
                aux_fan_speed: number | null;
                chamber_fan_speed: number | null;
                speed_level: number | null;
                speed_mag: number | null;
                wifi_signal: string | null;
                hms: { attr: number; code: number }[] | null;
                error_code: number;
            }>("printer-status", ({ payload: s }) => {
                if (!firstStatusLogged) {
                    firstStatusLogged = true;
                    import("@tauri-apps/api/core").then(({ invoke }) =>
                        invoke("frontend_log", {
                            level: "info",
                            message: `UI received first printer-status: ${s.serial} state=${s.gcode_state}`,
                            serial: s.serial,
                            name: null,
                        }).catch(() => {}),
                    );
                }
                const prevState = get(liveBySerial)[s.serial]?.gcode_state;
                const newState = s.gcode_state;
                const label =
                    newState === "RUNNING"
                        ? `Printing ${s.progress}%`
                        : (stateLabels[newState] ?? newState);
                liveBySerial.update((m) => ({
                    ...m,
                    [s.serial]: {
                        gcode_state: newState,
                        progress: s.progress,
                        layer_num: s.layer_num,
                        total_layer_num: s.total_layer_num,
                        label,
                        remaining_time: s.remaining_time,
                        nozzle_temp: s.nozzle_temp,
                        bed_temp: s.bed_temp,
                        chamber_temp: s.chamber_temp,
                        subtask_name: s.subtask_name ?? null,
                        gcode_file: s.gcode_file ?? null,
                        hms: s.hms ?? null,
                        error_code: s.error_code ?? 0,
                        nozzle_target_temp: s.nozzle_target_temp,
                        bed_target_temp: s.bed_target_temp,
                        cooling_fan_speed: s.cooling_fan_speed,
                        aux_fan_speed: s.aux_fan_speed,
                        chamber_fan_speed: s.chamber_fan_speed,
                        speed_level: s.speed_level,
                        speed_mag: s.speed_mag,
                        wifi_signal: s.wifi_signal,
                        updated_at: Math.floor(Date.now() / 1000),
                        source: "direct",
                        last_seen: Math.floor(Date.now() / 1000),
                    },
                }));
                // A print we just sent still emits stale terminal frames from the
                // PREVIOUS print until the printer switches to the new job. Ignore
                // those (they'd otherwise trip the finish flow / advance the queue)
                // until it confirms the new print started (RUNNING/PREPARE).
                if (recentlyStarted.has(s.serial)) {
                    if (newState === "RUNNING" || newState === "PREPARE") {
                        recentlyStarted.delete(s.serial);
                    } else {
                        return;
                    }
                }
                // Advance the start queue once the head printer starts (RUNNING) or
                // genuinely terminates (a real fail before it ever ran).
                const isHeadOfQueue =
                    startQueue.length > 0 &&
                    startQueue[0].printer.printer_serial === s.serial;
                if (
                    isHeadOfQueue &&
                    ["RUNNING", "FINISH", "FAILED"].includes(newState)
                )
                    advanceStartQueue();
                // Trigger finish logic
                handleFinishTransition(s.serial, prevState, newState, {
                    progress: s.progress,
                    total_layer_num: s.total_layer_num,
                    layer_num: s.layer_num,
                    remaining_time: s.remaining_time,
                });
                // Surface / clear an untracked print running on this printer.
                detectExternalFromFrame(
                    s.printer_id,
                    newState,
                    s.subtask_name ?? s.gcode_file ?? null,
                );
            });

            const unlistenConnected = await listen<{
                serial: string;
                printer_id: number;
            }>("printer-connected", ({ payload }) => {
                directConnected.update((s) => new Set([...s, payload.serial]));
            });
            const unlistenDisconnected = await listen<{
                serial: string;
                printer_id: number;
            }>("printer-disconnected", ({ payload }) => {
                directConnected.update(
                    (s) =>
                        new Set(
                            [...s].filter((x) => x !== payload.serial),
                        ),
                );
            });

            tauriUnlisteners = [
                unlistenStatus,
                unlistenConnected,
                unlistenDisconnected,
            ];
        }

        // Subscribe each configured printer to direct MQTT (desktop, opt-in beta).
        // Standalone/browser printers have no live transport.
        if (directOn) {
            for (const printer of data.printers as any[]) {
                if (!printer.printer_serial) continue;
                await subscribeDirectPrinter(printer);
            }
        }
    });

    async function openFileLocally(
        filePath: string,
        moduleName: string,
        printerId: number,
    ) {
        if (!get(fileHandlerEnabled)) return false;
        return await fileHandlerStore.openFile(filePath, moduleName, printerId);
    }

    // ── Live status ───────────────────────────────────────────────────────────
    // Keyed by printer_serial — populated from direct MQTT (Tauri) events.
    // A Svelte store (not a plain `let`): updates from the Tauri MQTT callback must
    // trigger reactivity from outside Svelte's update cycle, which a store guarantees
    // and a plain `let` read through a {@const} in an {#each} does not.
    const liveBySerial = writable<Record<string, LiveStatus>>({});

    // ── Externally-started print detection ────────────────────────────────────
    // A direct frame shows a print we aren't tracking → surface it inline on the
    // printer card (not a blocking modal). Keyed by printer id so each card shows its own.
    let detectedExternalByPrinter: Record<number, DetectedExternalPrint> = {};
    // task_ids the user already acted on (added or dismissed). Persisted to
    // localStorage so a dismissed print stays dismissed across reloads (it used
    // to re-surface on every reload). Loaded in onMount.
    const HANDLED_EXTERNAL_KEY = "printfarm_handled_external_tasks";
    const handledExternalTasks = new Set<string>();
    function persistHandledExternal() {
        try {
            localStorage.setItem(
                HANDLED_EXTERNAL_KEY,
                JSON.stringify([...handledExternalTasks]),
            );
        } catch {}
    }
    // Guard: only trigger reload/auto-start once per serial per page load
    const reloadTriggered = new Set<string>();
    // Serials of direct prints we just sent — used to ignore stale terminal frames
    // from the previous print until the printer confirms the new one started.
    const recentlyStarted = new Set<string>();

    // ── Direct MQTT transport (Tauri desktop only) ────────────────────────────
    // Serials currently connected via direct MQTT
    // A store (not a plain `let`): updated from Tauri connect/disconnect events,
    // so it must be reactive from outside Svelte's update cycle. Drives the
    // per-printer connection indicator + control availability.
    const directConnected = writable(new Set<string>());
    // Unlisten callbacks for Tauri event subscriptions
    let tauriUnlisteners: Array<() => void> = [];

    /**
     * Resolves the active transport for a printer at runtime.
     * 'manual' overrides everything; 'direct' when the desktop app is running,
     * the beta toggle is on, and all Bambu credentials are present; else 'local'
     * (standalone — prints are started by opening the file).
     */
    function effectiveTransport(printer: any): "direct" | "manual" | "local" {
        if (get(manualModeEnabled)) return "manual";
        const canDirect =
            get(directPrinterEnabled) &&
            $isDesktop &&
            printer.printer_ip &&
            printer.printer_serial &&
            printer.printer_access_code;
        // Direct MQTT (opt-in beta) when fully configured; otherwise the printer
        // runs standalone and prints are started by opening the local file.
        return canDirect ? "direct" : "local";
    }

    async function updatePrinterTransport(
        printer: any,
        transport: TransportMode,
    ) {
        await fetch(`/api/printer/${printer.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ transport }),
        });
        // Optimistic local update so the badge flips immediately
        printer.transport = transport;
        // Re-subscribe if switching to direct
        if ($isDesktop && (transport === "direct" || transport === "auto")) {
            await subscribeDirectPrinter(printer);
        }
    }

    async function subscribeDirectPrinter(printer: any) {
        if (
            !$isDesktop ||
            !printer.printer_ip ||
            !printer.printer_serial ||
            !printer.printer_access_code
        )
            return;
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("subscribe_printer", {
            printerId: printer.id,
            ip: printer.printer_ip,
            serial: printer.printer_serial,
            accessCode: printer.printer_access_code,
            name: printer.name ?? "",
        }).catch((e: unknown) => console.error("subscribe_printer failed:", e));
    }

    /**
     * Single finish-transition handler shared by both transports (Tauri direct
     * listener + Pi poll). Fires once per printer when a tracked print completes:
     *   - true terminal transition (RUNNING/PREPARE/PAUSE → FINISH/FAILED), or
     *   - stuck-at-99 fallback (firmware never emits FINISH but the frame is done).
     * Moves the job → print_finished server-side (authoritative for direct, which
     * has no webhook; idempotent for pi) then hard-reloads for the success state.
     */
    async function handleFinishTransition(
        serial: string,
        prevState: string | undefined,
        newState: string,
        liveFrame?: {
            progress: number;
            total_layer_num: number;
            layer_num: number;
            remaining_time: number | null;
        },
    ): Promise<void> {
        if (reloadTriggered.has(serial)) return;
        // Only an actively-printing job should trigger the finish transition.
        // A `print_finished` job is already done and awaiting user confirmation —
        // it still appears in activePrintJobs, so matching it here would re-fire
        // /finished + reload on every fresh load (infinite refresh loop).
        const wasTrackedPrinting = (data.activePrintJobs as any[]).some(
            (j: any) => j.printer_serial === serial && j.status === "printing",
        );
        if (!wasTrackedPrinting) return;

        const isTerminal = newState === "FINISH" || newState === "FAILED";
        const prevWasTerminal =
            prevState === "FINISH" || prevState === "FAILED";
        const justFinished =
            isTerminal && prevState !== undefined && !prevWasTerminal;

        // Defense-in-depth: a frame that's effectively done while still RUNNING
        // (Phase 0 liveDone predicate) — some firmware sticks at 99% forever.
        const liveDone =
            !!liveFrame &&
            liveFrame.progress >= 99 &&
            liveFrame.total_layer_num > 0 &&
            liveFrame.layer_num >= liveFrame.total_layer_num &&
            (liveFrame.remaining_time ?? 0) === 0;

        if (!justFinished && !liveDone) return;

        reloadTriggered.add(serial);
        const printer = (data.printers as any[]).find(
            (p: any) => p.printer_serial === serial,
        );
        if (printer) {
            try {
                await fetch(`/api/printer/${printer.id}/finished`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        status: newState === "FAILED" ? "failed" : "success",
                    }),
                });
            } catch {
                /* reload still re-derives finished state from the server */
            }
        }
        setTimeout(() => window.location.reload(), 2000);
    }

    /**
     * Detect (or clear) an untracked print running on a printer, from a direct
     * MQTT frame. A printer that reports an actively-printing state while we have
     * no tracked job for it is running something started outside the app (e.g.
     * from the printer's screen) — surface it inline so the user can adopt it.
     *
     * Identity is the printer's current file/subtask name; the adopt flow matches
     * it to a module by filename. (A real Bambu task id from the MQTT layer would
     * be sturdier — a later refinement.)
     */
    function detectExternalFromFrame(
        printerId: number,
        state: string,
        fileHint: string | null,
    ): void {
        const pid = Number(printerId);
        const printing = ["RUNNING", "PREPARE", "PAUSE"].includes(state);
        const tracked = !!getActivePrintJob(pid, data.activePrintJobs);
        const taskId = fileHint ? `direct:${pid}:${fileHint}` : "";

        if (printing && !tracked && fileHint && !handledExternalTasks.has(taskId)) {
            const base = fileHint.split("/").pop() ?? fileHint;
            const match = (data.printModules as any[]).find(
                (m) => (m.filename?.split("/").pop() ?? m.filename) === base,
            );
            detectedExternalByPrinter = {
                ...detectedExternalByPrinter,
                [pid]: {
                    printer_id: pid,
                    task_id: taskId,
                    gcode_file: fileHint,
                    suggested_module_id: match?.id ?? null,
                    suggested_module_name: match?.name ?? null,
                },
            };
        } else if (
            detectedExternalByPrinter[pid] &&
            (tracked || !printing)
        ) {
            const { [pid]: _cleared, ...rest } = detectedExternalByPrinter;
            detectedExternalByPrinter = rest;
        }
    }

    onDestroy(() => {
        clearInterval(tickerInterval);
        tauriUnlisteners.forEach((u) => u());
    });

    let controlLoading: string | null = null;

    // ── Sequential start queue ────────────────────────────────────────────────
    type StartQueueEntry = {
        printer: any;
        module: any;
        enqueuedAt: number;
        startedAt: number | null;
    };
    let startQueue: StartQueueEntry[] = [];
    let startQueueTimeout: ReturnType<typeof setTimeout> | null = null;
    // Set when a print start fails so the operator sees the real cause (Pi
    // unreachable, FTPS upload failed, bad creds) instead of silent drop.
    let startError: { printer: string; message: string } | null = null;

    // Printers whose finished job is being confirmed right now. The completePrint
    // round trip (multi-query action + full load() re-run) is slow; during it the
    // card/modal would otherwise keep showing the stale "finished" job — inviting
    // a second confirm on the same jobId. Suppress the job optimistically until
    // invalidateAll() lands. Reassigned (not mutated) for legacy-mode reactivity.
    let completingPrinterIds = new Set<number>();
    $: visibleActivePrintJobs = (data.activePrintJobs as any[]).filter(
        (j) => !completingPrinterIds.has(Number(j.printer_id)),
    );
    $: startingPrinterIds = new Set(
        startQueue.map((e) => Number(e.printer.id)),
    );
    $: startQueueTotal = startQueue.length;

    const START_QUEUE_KEY = "printfarm_start_queue";
    type StoredQueueEntry = {
        printerId: number;
        moduleId: number;
        enqueuedAt: number;
        startedAt: number | null;
    };

    function saveStartQueue() {
        try {
            const serializable: StoredQueueEntry[] = startQueue.map((e) => ({
                printerId: e.printer.id,
                moduleId: e.module.id,
                enqueuedAt: e.enqueuedAt,
                startedAt: e.startedAt,
            }));
            localStorage.setItem(START_QUEUE_KEY, JSON.stringify(serializable));
        } catch {}
    }

    function loadStartQueue(): StartQueueEntry[] {
        try {
            const raw = localStorage.getItem(START_QUEUE_KEY);
            if (!raw) return [];
            const stored: StoredQueueEntry[] = JSON.parse(raw);
            return stored
                .map((s) => {
                    const printer = (data.printers as any[]).find(
                        (p) => p.id === s.printerId,
                    );
                    const module = (data.printModules as any[]).find(
                        (m) => m.id === s.moduleId,
                    );
                    if (!printer || !module) return null;
                    return {
                        printer,
                        module,
                        enqueuedAt: s.enqueuedAt,
                        startedAt: s.startedAt,
                    } as StartQueueEntry;
                })
                .filter((e): e is StartQueueEntry => e !== null);
        } catch {
            return [];
        }
    }

    function enqueueStart(module: any, printer: any) {
        closePrinterModal();
        startQueue = [
            ...startQueue,
            { printer, module, enqueuedAt: Date.now(), startedAt: null },
        ];
        saveStartQueue();
        if (startQueue.length === 1) dispatchNextStart();
    }

    /**
     * Sends the head of the start queue to its printer via one of three paths:
     *   1. Manual — DB job only; time-based progress, user confirms/fails.
     *   2. Direct + local file — registers the job in DB then invokes Bambu MQTT directly.
     *   3. Standalone — DB job + open the local file (desktop) or legacy handler; advances after 3 s.
     * The 120 s safety-net timeout on startQueueTimeout advances the queue even if
     * the printer never transitions through PREPARE, preventing a permanent stall.
     */
    async function dispatchNextStart() {
        if (startQueue.length === 0) return;
        startQueue[0] = { ...startQueue[0], startedAt: Date.now() };
        startQueue = [...startQueue];
        saveStartQueue();
        const { module, printer } = startQueue[0];
        startQueueTimeout = setTimeout(advanceStartQueue, 120_000);
        const hasLocalHandler = !!(
            module.filename && fileHandlerState.connected
        );
        const transport = effectiveTransport(printer);
        try {
            if (transport === "manual") {
                // Manual mode: register the job in DB only — no printer connection.
                // Progress is time-based; user confirms or fails the print manually.
                const formData = new FormData();
                formData.append("printerId", String(printer.id));
                formData.append("moduleId", String(module.id));
                await fetch("?/startPrint", { method: "POST", body: formData });
                await invalidateAll();
                setTimeout(advanceStartQueue, 3_000);
            } else if (transport === "direct") {
                // Direct beta: upload the local file to the printer over FTPS, then
                // send the MQTT print command. Every step logs to the Logs page.
                // Any failure surfaces as an error — we do NOT silently open the file.
                try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    // Ensure an MQTT session exists (idempotent) for the print command.
                    await subscribeDirectPrinter(printer);
                    const uploaded = await invoke<{
                        remote_path: string;
                        param: string;
                    }>("upload_file_direct", {
                        id: Number(module.id),
                        fileName: module.filename,
                        ip: printer.printer_ip,
                        serial: printer.printer_serial,
                        accessCode: printer.printer_access_code,
                        printerModel: printer.preset?.model ?? "",
                        name: printer.name ?? "",
                    });
                    await invoke("start_print_direct", {
                        serial: printer.printer_serial,
                        remotePath: uploaded.remote_path,
                        param: uploaded.param,
                    });
                    // Register the tracked job only once the printer accepted the send.
                    const formData = new FormData();
                    formData.append("printerId", String(printer.id));
                    formData.append("moduleId", String(module.id));
                    await fetch("?/startPrint", {
                        method: "POST",
                        body: formData,
                    });
                    // Drop the previous print's stale frame so the card doesn't
                    // flash its old 100%/finished state, and ignore stale terminal
                    // frames until the printer confirms the new print started. The
                    // card stays in the "starting" shimmer until it reports RUNNING
                    // (handler advances the queue then; 120s safety net covers stalls).
                    recentlyStarted.add(printer.printer_serial);
                    setTimeout(
                        () => recentlyStarted.delete(printer.printer_serial),
                        120_000,
                    );
                    reloadTriggered.delete(printer.printer_serial);
                    liveBySerial.update((m) => {
                        const { [printer.printer_serial]: _drop, ...rest } = m;
                        return rest;
                    });
                    await invalidateAll();
                } catch (e) {
                    const msg = String(e);
                    startError = {
                        printer: printer.name,
                        // The "no sliced gcode" error is already user-facing — show it
                        // as-is; wrap anything else with a pointer to the Logs.
                        message: msg.includes("no sliced gcode")
                            ? msg.replace(/^Error:\s*/, "")
                            : `Direct send failed: ${msg}. Open Logs for the full trace.`,
                    };
                    advanceStartQueue();
                }
            } else {
                // Default path: register the job, then open the local file so the
                // user starts it from their slicer. Direct MQTT / Pi are opt-in beta
                // addons handled above. See docs/local-file-flow.md.
                const formData = new FormData();
                formData.append("printerId", String(printer.id));
                formData.append("moduleId", String(module.id));
                const res = await fetch("?/startPrint", {
                    method: "POST",
                    body: formData,
                });
                if (res.ok) {
                    if ($isDesktop) {
                        const { invoke } = await import("@tauri-apps/api/core");
                        try {
                            await invoke("open_module_file", {
                                id: Number(module.id),
                                fileName: module.filename,
                            });
                        } catch (e) {
                            console.error("open_module_file failed:", e);
                            startError = {
                                printer: printer.name,
                                message: `Couldn't find the file for "${module.name}" on this machine. Re-attach it on the Modules page, then start again.`,
                            };
                        }
                    } else if (hasLocalHandler) {
                        // Browser fallback: legacy :3001 sidecar file handler.
                        await openFileLocally(
                            module.filename,
                            module.name,
                            printer.id,
                        );
                    }
                }
                await invalidateAll();
                setTimeout(advanceStartQueue, 3_000);
            }
        } catch (e) {
            startError = {
                printer: printer.name,
                message: `Couldn't reach the server: ${e}`,
            };
            advanceStartQueue();
        }
    }

    /**
     * Removes the head of the start queue and dispatches the next item if one exists.
     * No page reload — direct MQTT streams state into liveBySerial, so the printer
     * card's liveIsPrinting flag flips automatically without a reload.
     */
    function advanceStartQueue() {
        if (startQueueTimeout) {
            clearTimeout(startQueueTimeout);
            startQueueTimeout = null;
        }
        startQueue = startQueue.slice(1);
        saveStartQueue();
        if (startQueue.length > 0) {
            dispatchNextStart();
        }
        // No reload — direct MQTT streams live state into liveBySerial, and the
        // printer card uses liveIsPrinting to flip to "Printing" automatically.
    }

    /**
     * Printer controls. Pause/resume go over direct MQTT (desktop, beta) and are
     * no-ops without a live connection. Cancel is special: it removes the tracked
     * job as if it never happened (no "failed" record) and, when we have a live
     * connection, also tells the printer to stop.
     */
    async function sendPrinterControl(endpoint: string, printerId: number) {
        controlLoading = endpoint;
        try {
            const printer = (data.printers as any[]).find(
                (p: any) => Number(p.id) === printerId,
            );
            const isDirect = !!(
                printer?.printer_serial &&
                get(directConnected).has(printer.printer_serial)
            );

            if (endpoint === "cancel") {
                // Tell the printer to stop if we're connected — best effort.
                if (isDirect) {
                    const { invoke } = await import("@tauri-apps/api/core");
                    await invoke("send_printer_command", {
                        serial: printer.printer_serial,
                        command: "stop",
                    }).catch((e: unknown) =>
                        console.error("stop command failed:", e),
                    );
                }
                // Remove the job — cancelled prints leave no trace.
                const job = getActivePrintJob(printerId, data.activePrintJobs);
                if (job?.id) {
                    const fd = new FormData();
                    fd.append("jobId", String(job.id));
                    await fetch("?/deleteJob", { method: "POST", body: fd });
                }
                await invalidateAll();
                return;
            }

            // pause / resume — direct MQTT only.
            if (!isDirect) return;
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("send_printer_command", {
                serial: printer.printer_serial,
                command: endpoint,
            });
        } finally {
            controlLoading = null;
        }
    }

    async function togglePrinterBroken(
        printer: any,
        broken: boolean,
        alert?: { code: string; text: string },
    ) {
        controlLoading = broken ? "marking-broken" : "marking-repaired";
        await fetch(`/api/printer/${printer.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
                broken
                    ? {
                          action: "broken",
                          reason: alert?.text ?? null,
                          hmsCode: alert?.code ?? null,
                      }
                    : { action: "repaired" },
            ),
        });
        printer.status = broken ? "inactive" : "idle";
        // Mirror the server's breakage record so the modal updates immediately.
        printer.broken_reason = broken ? (alert?.text ?? null) : null;
        printer.broken_hms_code = broken ? (alert?.code ?? null) : null;
        if (selectedPrinter?.id === printer.id)
            selectedPrinter = { ...printer };
        // Refresh data.printers so the dashboard card re-derives status (and its tint).
        await invalidateAll();
        controlLoading = null;
    }

    async function selectPrinter(printer: any) {
        // Recommendations (suggested_queue / suggestedSpools) are mutated onto the
        // printer object client-side and never repopulated by load(). Flush the prior
        // printer's so stale recommendations don't bleed across printers until a reload.
        if (
            selectedPrinter &&
            Number(selectedPrinter.id) !== Number(printer.id)
        ) {
            delete selectedPrinter.suggested_queue;
        }
        suggestedSpools = [];
        spoolInitialPresetId = null;
        selectedPrinter = printer;
        // Quick Start mode only applies to network-connected printers; otherwise
        // the regular detail modal opens. Either way we still want the suggested
        // queue populated on open (below) so "Next Suggested Print" shows
        // immediately, not only after visiting the module selector.
        const isQuickStart =
            $quickStartMode && printer.printer_serial && printer.printer_ip;
        showQuickStart = isQuickStart;

        // Populate the suggested queue for whichever modal is showing, when a
        // spool is loaded and we don't already have a pending queue.
        const queue: any[] = printer.suggested_queue ?? [];
        const hasPending = queue.some((i: any) => i.status !== "DONE");
        if (!hasPending && printer.loaded_spool) {
            if (isQuickStart) quickStartLoading = true;
            try {
                const resp = await fetch(
                    `/api/ai-recommendations?type=queue&printerId=${printer.id}`,
                );
                const result = await resp.json();
                // Guard against a fast re-click landing on a different printer.
                if (
                    result &&
                    Array.isArray(result) &&
                    Number(selectedPrinter?.id) === Number(printer.id)
                ) {
                    selectedPrinter = {
                        ...printer,
                        suggested_queue: result,
                    };
                }
            } catch (e) {
                console.error("Failed to load suggested queue:", e);
            } finally {
                quickStartLoading = false;
            }
        }
    }

    function closePrinterModal() {
        if (selectedPrinter) delete selectedPrinter.suggested_queue;
        suggestedSpools = [];
        spoolInitialPresetId = null;
        selectedPrinter = null;
        showSpoolSelector = false;
        showModuleSelector = false;
        showFailureReasonModal = false;
        showQuickStart = false;
        showHistoryModal = false;
    }

    function closeFailureReasonModal() {
        showFailureReasonModal = false;
        failurePrefill = null;
    }

    // enhance callback for FailureReasonModal — defined here because it closes over selectedPrinter and the close functions
    const completePrintFailureEnhance: SubmitFunction = () => {
        // Optimistic UI (see completePrintSuccessEnhance): close modals and kick
        // off the queue regen immediately, soft-refresh once the server confirms.
        const printer = selectedPrinter;
        if (printer?.id) {
            fetch(
                `/api/ai-recommendations?type=queue&printerId=${printer.id}`,
                { keepalive: true },
            ).catch(() => {});
            // Same optimistic suppression as the success path.
            completingPrinterIds = new Set(completingPrinterIds).add(
                Number(printer.id),
            );
        }
        closeFailureReasonModal();
        closePrinterModal();

        return async () => {
            await invalidateAll();
            if (printer?.id) {
                const next = new Set(completingPrinterIds);
                next.delete(Number(printer.id));
                completingPrinterIds = next;
            }
        };
    };

    function clearDetectedExternal(detected: DetectedExternalPrint) {
        handledExternalTasks.add(detected.task_id);
        persistHandledExternal();
        const { [Number(detected.printer_id)]: _cleared, ...rest } =
            detectedExternalByPrinter;
        detectedExternalByPrinter = rest;
    }

    // Dismiss the inline banner without adopting (won't re-surface this session).
    function dismissExternal(detected: DetectedExternalPrint) {
        clearDetectedExternal(detected);
    }

    // Adopt the untracked print as a dashboard job (optionally with the matched
    // module), then refresh. Mirrors the old modal's confirmExternalPrint form.
    async function adoptExternal(detected: DetectedExternalPrint) {
        clearDetectedExternal(detected);
        const fd = new FormData();
        fd.append("printerId", String(detected.printer_id));
        fd.append("taskId", detected.task_id);
        if (detected.suggested_module_id != null)
            fd.append("moduleId", String(detected.suggested_module_id));
        try {
            await fetch("?/confirmExternalPrint", {
                method: "POST",
                body: fd,
            });
            await invalidateAll();
        } catch (e) {
            console.error("adoptExternal failed:", e);
        }
    }

    // enhance callback for PrinterDetailModal "Print Successful" button
    const completePrintSuccessEnhance: SubmitFunction = () => {
        // Optimistic UI: fire the animation, close the modal, and kick off the
        // per-printer queue regen immediately — the click feels instant instead
        // of blocking on the server round-trip. Capture the printer/job first
        // since we close the modal (which clears selectedPrinter) before awaiting.
        const printer = selectedPrinter;
        const job = printer
            ? getActivePrintJob(printer.id, data.activePrintJobs)
            : null;
        playSuccessAnimation((job as any)?.module_thumbnail ?? null);

        // Regenerate the per-printer queue server-side unless the finished module
        // is already queued. Fire-and-forget (its result is unused here).
        const finishedModuleId = job?.module_id;
        const queue = printer?.suggested_queue;
        const inQueue =
            Array.isArray(queue) && finishedModuleId != null
                ? queue.some(
                      (item: any) =>
                          item.module_id === finishedModuleId &&
                          item.status !== "DONE",
                  )
                : false;
        if (!inQueue && printer?.id) {
            fetch(
                `/api/ai-recommendations?type=queue&printerId=${printer.id}`,
                { keepalive: true },
            ).catch(() => {});
        }
        // Flip the card to idle immediately — suppress the stale finished job
        // until the server confirms, so a re-click can't re-confirm the same job.
        if (printer?.id) {
            completingPrinterIds = new Set(completingPrinterIds).add(
                Number(printer.id),
            );
        }
        closePrinterModal();

        // Soft-refresh once the server confirms — Svelte diffs the card from
        // "finished" → "idle" with no reload flash or stale-data flicker.
        return async () => {
            await invalidateAll();
            if (printer?.id) {
                const next = new Set(completingPrinterIds);
                next.delete(Number(printer.id));
                completingPrinterIds = next;
            }
        };
    };

    // Default Grid Configuration (fallback if no preset exists)
    const defaultGridLayout: GridCell[] = [
        { type: "printer", printerId: 1 },
        { type: "printer", printerId: 2 },
        { type: "printer", printerId: 3 },
        { type: "printer", printerId: 4 },
        { type: "printer", printerId: 5 },
        { type: "printer", printerId: 6 },
        { type: "printer", printerId: 7 },
        { type: "stats" },
        { type: "settings" },
    ];

    // Grid switching state
    let currentGridIndex = 0;
    let gridContainer: HTMLElement;

    // Get all available grids (from presets or default)
    function getAllGrids(): {
        name: string;
        config: GridCell[];
        rows: number;
        cols: number;
    }[] {
        if (data.gridPresets && data.gridPresets.length > 0) {
            // Sort to put default first
            const sorted = [...data.gridPresets].sort(
                (a, b) => Number(b.is_default) - Number(a.is_default),
            );
            return sorted.map((preset) => ({
                name: preset.name,
                config: parseGridConfig(preset.grid_config),
                rows: preset.rows || 3,
                cols: preset.cols || 3,
            }));
        }
        return [
            { name: "Default", config: defaultGridLayout, rows: 3, cols: 3 },
        ];
    }

    function parseGridConfig(jsonString: string): GridCell[] {
        try {
            return JSON.parse(jsonString);
        } catch {
            return defaultGridLayout;
        }
    }

    // Reactive grids list
    $: allGrids = getAllGrids();
    $: currentGrid = allGrids[currentGridIndex] || allGrids[0];
    $: gridLayout = currentGrid?.config || defaultGridLayout;
    $: gridRows = currentGrid?.rows || 3;
    $: gridCols = currentGrid?.cols || 3;

    // Grid navigation
    function goToGrid(index: number) {
        if (index >= 0 && index < allGrids.length) {
            currentGridIndex = index;
        }
    }

    function nextGrid() {
        if (currentGridIndex < allGrids.length - 1) {
            currentGridIndex++;
        }
    }

    function prevGrid() {
        if (currentGridIndex > 0) {
            currentGridIndex--;
        }
    }

    // Keyboard navigation
    function handleKeydown(event: KeyboardEvent) {
        // Only handle if no modal is open
        if (selectedPrinter) return;

        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            nextGrid();
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            prevGrid();
        }
    }

    // Touch/swipe handling
    let touchStartX = 0;
    let touchStartY = 0;

    function handleTouchStart(event: TouchEvent) {
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
    }

    function handleTouchEnd(event: TouchEvent) {
        const touchEndX = event.changedTouches[0].clientX;
        const touchEndY = event.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;

        // Only handle horizontal swipes (ignore vertical)
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
            if (deltaX < 0) {
                nextGrid();
            } else {
                prevGrid();
            }
        }
    }

    // Wheel/trackpad handling - simple swipe with black edge reveal
    let resetTimeout: ReturnType<typeof setTimeout> | null = null;
    let swipeOffset = 0; // Pixel offset for visual feedback
    let accumulatedDelta = 0;
    let isSwiping = false;
    const SWIPE_THRESHOLD = 100; // Pixels to trigger switch

    function handleWheel(event: WheelEvent) {
        if (selectedPrinter) return;

        // Only handle horizontal scrolling
        if (
            Math.abs(event.deltaX) > Math.abs(event.deltaY) &&
            Math.abs(event.deltaX) > 1
        ) {
            event.preventDefault();
            event.stopPropagation();

            isSwiping = true;

            // Accumulate the swipe
            accumulatedDelta += event.deltaX;

            // Check if we can navigate in that direction
            const canGoNext = currentGridIndex < allGrids.length - 1;
            const canGoPrev = currentGridIndex > 0;

            // Only allow offset if we can navigate that direction
            if (accumulatedDelta > 0 && canGoNext) {
                // Swiping left (going to next) - show black on right
                swipeOffset = -Math.min(accumulatedDelta * 0.4, 150);
            } else if (accumulatedDelta < 0 && canGoPrev) {
                // Swiping right (going to prev) - show black on left
                swipeOffset = -Math.max(accumulatedDelta * 0.4, -150);
            } else {
                // Can't navigate, no offset
                swipeOffset = 0;
            }

            // Clear existing timeout
            if (resetTimeout) clearTimeout(resetTimeout);

            // Check if we crossed threshold - switch immediately!
            if (Math.abs(accumulatedDelta) > SWIPE_THRESHOLD) {
                if (accumulatedDelta > 0 && canGoNext) {
                    currentGridIndex++;
                } else if (accumulatedDelta < 0 && canGoPrev) {
                    currentGridIndex--;
                }
                // Reset immediately after switch
                swipeOffset = 0;
                accumulatedDelta = 0;
                isSwiping = false;
                return;
            }

            // Reset after gesture ends
            resetTimeout = setTimeout(() => {
                isSwiping = false;
                swipeOffset = 0;
                accumulatedDelta = 0;
            }, 100);
        }
    }

    // Reference for cleanup
    let mainContainer: HTMLElement;

    onMount(() => {
        window.addEventListener("keydown", handleKeydown);
        document.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            window.removeEventListener("keydown", handleKeydown);
            document.removeEventListener("wheel", handleWheel);
            if (resetTimeout) clearTimeout(resetTimeout);
        };
    });

    // Modal handlers

    let suggestedSpools: SpoolSuggestion[] = [];
    let spoolInitialPresetId: number | null = null;

    // AI-suggested spools appear first so the most relevant choice is visible without scrolling.
    // Un-suggested presets are appended so the user can still pick any spool manually.
    $: orderedSpoolPresets = (() => {
        const presets = data.spoolPresets ?? [];
        if (presets.length === 0)
            return [] as Array<{
                preset: (typeof presets)[number];
                suggestion: SpoolSuggestion | null;
            }>;
        const suggestionByPreset = new Map<number, SpoolSuggestion>();
        suggestedSpools.forEach((s) => suggestionByPreset.set(s.preset_id, s));
        const suggested = suggestedSpools
            .map((s) => ({
                preset: presets.find((p) => p.id === s.preset_id),
                suggestion: s,
            }))
            .filter(
                (
                    x,
                ): x is {
                    preset: (typeof presets)[number];
                    suggestion: SpoolSuggestion;
                } => !!x.preset,
            );
        const unsuggested = presets
            .filter((p) => !suggestionByPreset.has(p.id))
            .map((p) => ({
                preset: p,
                suggestion: null as SpoolSuggestion | null,
            }));
        return [...suggested, ...unsuggested];
    })();

    async function handleLoadSpool() {
        if (!selectedPrinter?.id) {
            showSpoolSelector = true;
            return;
        }

        try {
            const resp = await fetch(
                `/api/ai-recommendations?type=spool&printerId=${selectedPrinter.id}`,
            );
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const body = await resp.json();

            suggestedSpools = Array.isArray(body) ? body : [];
            if (suggestedSpools[0])
                spoolInitialPresetId = suggestedSpools[0].preset_id;
        } catch (err) {
            console.error("Failed to fetch spool suggestion:", err);
        } finally {
            showSpoolSelector = true;
        }
    }

    function closeSpoolSelector() {
        showSpoolSelector = false;
        spoolInitialPresetId = null;
        spoolTargetSlotIndex = 0;
    }

    // enhance callback for SpoolSelectorModal — closes over selectedPrinter and closePrinterModal
    const loadSpoolEnhance: SubmitFunction = () => {
        return async ({ result }) => {
            if (result.type === "success") {
                if (!selectedPrinter) {
                    closePrinterModal();
                    window.location.reload();
                    return;
                }
                try {
                    const response = await fetch(
                        `/api/ai-recommendations?type=queue&printerId=${selectedPrinter.id}`,
                    );
                    const queueResult = await response.json();
                    if (queueResult && Array.isArray(queueResult)) {
                        selectedPrinter.suggested_queue = queueResult;
                    }
                } catch (e) {
                    console.error("Failed to refresh suggested queue:", e);
                }
                closePrinterModal();
                window.location.reload();
            }
        };
    };

    // enhance callback for manual spool weight deduction in PrinterDetailModal
    const adjustWeightEnhance: SubmitFunction = () => {
        return async ({ result }) => {
            if (result.type === "success") {
                await invalidateAll();
                // Re-sync the open modal's printer from refreshed data
                if (selectedPrinter) {
                    const fresh = data.printers.find(
                        (p) => Number(p.id) === Number(selectedPrinter!.id),
                    );
                    if (fresh) selectedPrinter = fresh;
                }
            }
        };
    };

    async function handleStartPrint() {
        if (!selectedPrinter?.loaded_spool) {
            alert("Please load a spool first");
            return;
        }
        // Open immediately — the "Recommended for this Spool" list is derived
        // client-side from data.printModules, so it doesn't need the server queue.
        showModuleSelector = true;

        // Populate the "Saved Print Queue" section in the background (this is the
        // slow generateAndSaveSuggestedQueue call). Guard against a fast re-open on
        // a different printer landing the result on the wrong one.
        const queue = selectedPrinter.suggested_queue;
        const shouldGenerateQueue =
            !queue ||
            queue.length === 0 ||
            queue.every((item) => item.status === "DONE");
        if (shouldGenerateQueue) {
            const pid = selectedPrinter.id;
            fetch(`/api/ai-recommendations?type=queue&printerId=${pid}`)
                .then((r) => r.json())
                .then((result) => {
                    if (
                        result &&
                        Array.isArray(result) &&
                        selectedPrinter &&
                        Number(selectedPrinter.id) === Number(pid)
                    ) {
                        selectedPrinter = {
                            ...selectedPrinter,
                            suggested_queue: result,
                        };
                    }
                })
                .catch(() => {});
        }
    }

    function closeModuleSelector() {
        showModuleSelector = false;
    }

    function handlePrintFailed(prefill: FailurePrefill | null = null) {
        failurePrefill = prefill;
        showFailureReasonModal = true;
    }
</script>

<div
    bind:this={mainContainer}
    class="h-screen w-screen bg-white dark:bg-[#060608] p-8 lg:p-10 overflow-hidden"
    ontouchstart={handleTouchStart}
    ontouchend={handleTouchEnd}
    role="region"
    aria-label="Grid navigation area"
>
    <!-- Header -->
    <div class="mb-8 flex justify-between items-end">
        <div>
            <div class="flex items-baseline gap-3">
                <h1
                    class="text-4xl font-extralight text-zinc-900 dark:text-zinc-50 tracking-tight"
                >
                    {data.workspaceName || "Print Farm"}
                </h1>
                {#if allGrids.length > 1}
                    <span
                        class="text-sm text-zinc-400 dark:text-zinc-600 font-light tracking-wide uppercase"
                    >
                        {currentGrid?.name || "Dashboard"}
                    </span>
                {/if}
            </div>
        </div>
        <div class="flex items-center gap-6">
            <div
                class="flex items-center gap-4 text-sm text-zinc-400 dark:text-zinc-500 font-light tracking-wide"
            ></div>
            <form method="POST" action="/logout">
                <button
                    type="submit"
                    title="Log out"
                    class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-[#161616] hover:bg-zinc-200 dark:hover:bg-[#1f1f1f] hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                    </svg>
                    Log out
                </button>
            </form>
        </div>
    </div>

    <!-- Swipeable Grid Container -->
    <div class="relative overflow-hidden h-[calc(100vh-140px)]">
        <!-- Current Grid (with swipe transform) -->
        <div
            class="absolute inset-0 ease-out"
            class:transition-transform={!isSwiping}
            class:duration-300={!isSwiping}
            style="transform: translateX({swipeOffset}px);"
        >
            <!-- Dynamic Grid (py-2 gives the top/bottom rows room for the hover-lift) -->
            <div
                class="grid gap-5 h-full py-2"
                style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr)); grid-template-rows: repeat({gridRows}, minmax(0, 1fr));"
            >
                {#each gridLayout as cell, i}
                    {#if cell.type === "printer"}
                        {@const printer = cell.printerId
                            ? data.printers.find(
                                  (p) =>
                                      Number(p.id) === Number(cell.printerId),
                              )
                            : null}

                        {#if printer}
                            <PrinterCard
                                printer={completingPrinterIds.has(
                                    Number(printer.id),
                                ) && printer.status === "finished"
                                    ? { ...printer, status: "idle" }
                                    : printer}
                                live={$liveBySerial[
                                    printer.printer_serial as string
                                ]}
                                directConnected={$directConnected.has(
                                    printer.printer_serial as string,
                                )}
                                liveIsStarting={startingPrinterIds.has(
                                    Number(printer.id),
                                )}
                                activePrintJobs={visibleActivePrintJobs}
                                printModules={data.printModules}
                                {startQueue}
                                {now}
                                detectedExternal={detectedExternalByPrinter[
                                    Number(printer.id)
                                ]}
                                onAdoptExternal={adoptExternal}
                                onDismissExternal={dismissExternal}
                                onSelect={() => selectPrinter(printer)}
                            />
                        {:else}
                            <!-- Empty Printer Slot -->
                            <div
                                class="bg-transparent border border-dashed border-zinc-200/40 dark:border-[#1a1a22]/60
                      rounded-xl p-2 flex items-center justify-center overflow-hidden"
                            >
                                <div class="text-center">
                                    <div
                                        class="w-8 h-8 mx-auto rounded-lg border border-dashed border-zinc-300/40 dark:border-zinc-700/40 flex items-center justify-center mb-1"
                                    >
                                        <svg
                                            class="w-4 h-4 text-zinc-300 dark:text-zinc-700"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="1.5"
                                                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                                            />
                                        </svg>
                                    </div>
                                    <p
                                        class="text-[clamp(0.4rem,1.3vw,0.65rem)] font-light text-zinc-300 dark:text-zinc-700 tracking-wide"
                                    >
                                        Empty
                                    </p>
                                </div>
                            </div>
                        {/if}
                    {:else if cell.type === "settings"}
                        <!-- Settings Card -->
                        <a
                            use:shine
                            href="/settings"
                            class="group bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
                        >
                            <div
                                class="group-hover:rotate-90 transition-transform duration-700 ease-out"
                            >
                                <svg
                                    class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                                    />
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                                    />
                                </svg>
                            </div>
                            <h3
                                class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight"
                            >
                                Settings
                            </h3>
                            <p
                                class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide"
                            >
                                Configure
                            </p>
                        </a>
                    {:else if cell.type === "stats"}
                        <!-- Stats Card -->
                        <a
                            use:shine
                            href="/stats"
                            class="group bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
                        >
                            <div
                                class="group-hover:scale-110 transition-transform duration-500 ease-out"
                            >
                                <svg
                                    class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
                                    />
                                </svg>
                            </div>
                            <h3
                                class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight"
                            >
                                Stats
                            </h3>
                            <p
                                class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide"
                            >
                                Inspect Data
                            </p>
                        </a>
                    {:else if cell.type === "spools"}
                        <!-- Spools Card -->
                        <a
                            use:shine
                            href="/spools"
                            class="group relative bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
                        >
                            {#if spoolWorstStatus !== "ok"}
                                <span
                                    class="absolute top-2 right-2 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#0c0c0f] {STATUS_DOT[
                                        spoolWorstStatus
                                    ]} {spoolWorstStatus === 'empty'
                                        ? 'animate-pulse'
                                        : ''}"
                                    title={spoolWorstStatus === "empty"
                                        ? "A spool is out of stock"
                                        : "A spool is running low"}
                                ></span>
                            {/if}
                            <div
                                class="group-hover:scale-110 transition-transform duration-500 ease-out"
                            >
                                <!-- Filament spool: reel rim, hub, and a loose filament strand -->
                                <svg
                                    class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                >
                                    <circle cx="10.5" cy="11.5" r="7.75" />
                                    <circle cx="10.5" cy="11.5" r="2.5" />
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M16 17.1c1.4 1.2 2.9 1.7 4.4 1.4 1-.2 1.6-.9 1.6-1.8 0-.8-.6-1.4-1.4-1.4"
                                    />
                                </svg>
                            </div>
                            <h3
                                class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight"
                            >
                                Spools & Consumables
                            </h3>
                            <p
                                class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide tabular-nums"
                            >
                                {data.spools.length} spools · shop
                            </p>
                        </a>
                    {:else if cell.type === "inventory"}
                        <!-- Inventory Card -->
                        <a
                            use:shine
                            href="/inventory"
                            class="group bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
                        >
                            <div
                                class="group-hover:scale-110 transition-transform duration-500 ease-out"
                            >
                                <svg
                                    class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3"
                                    />
                                </svg>
                            </div>
                            <h3
                                class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight"
                            >
                                Inventory
                            </h3>
                            <p
                                class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide"
                            >
                                Stock
                            </p>
                        </a>
                    {:else if cell.type === "products"}
                        <!-- Products Card -->
                        <a
                            use:shine
                            href="/products"
                            class="group bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
                        >
                            <div
                                class="group-hover:scale-110 transition-transform duration-500 ease-out"
                            >
                                <svg
                                    class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z"
                                    />
                                </svg>
                            </div>
                            <h3
                                class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight"
                            >
                                Products
                            </h3>
                            <p
                                class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide"
                            >
                                Catalog
                            </p>
                        </a>
                    {:else if cell.type === "modules"}
                        <!-- Modules Card -->
                        <a
                            use:shine
                            href="/modules"
                            class="group bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
                        >
                            <div
                                class="group-hover:scale-110 transition-transform duration-500 ease-out"
                            >
                                <svg
                                    class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                                    />
                                </svg>
                            </div>
                            <h3
                                class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight"
                            >
                                Modules
                            </h3>
                            <p
                                class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide"
                            >
                                Print catalog
                            </p>
                        </a>
                    {:else if cell.type === "setup"}
                        <!-- Guided Setup Card (onboarding — replaced by the real cell when finished) -->
                        <a
                            use:shine
                            href="/setup/{cell.step}"
                            class="group bg-zinc-50 dark:bg-[#0c0c0f] border-2 border-dashed border-zinc-300 dark:border-zinc-700
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden
                 hover:border-zinc-500 dark:hover:border-zinc-400 transition-colors"
                        >
                            <div
                                class="group-hover:scale-110 transition-transform duration-500 ease-out"
                            >
                                {#if cell.step === "printers"}
                                    <svg
                                        class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        stroke-width="1.5"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z"
                                        />
                                    </svg>
                                {:else if cell.step === "spools"}
                                    <svg
                                        class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        stroke-width="1.5"
                                    >
                                        <circle cx="12" cy="12" r="8.25" />
                                        <circle cx="12" cy="12" r="2.75" />
                                    </svg>
                                {:else if cell.step === "inventory"}
                                    <svg
                                        class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        stroke-width="1.5"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
                                        />
                                    </svg>
                                {:else if cell.step === "stats"}
                                    <svg
                                        class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        stroke-width="1.5"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
                                        />
                                    </svg>
                                {:else}
                                    <svg
                                        class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        stroke-width="1.5"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                                        />
                                    </svg>
                                {/if}
                            </div>
                            <h3
                                class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight"
                            >
                                {cell.step === "printers"
                                    ? "Set up printers"
                                    : cell.step === "spools"
                                      ? "Set up filament"
                                      : cell.step === "inventory"
                                        ? "Set up inventory"
                                        : cell.step === "stats"
                                          ? "Discover stats"
                                          : "Set up modules"}
                            </h3>
                            <p
                                class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide"
                            >
                                Get started →
                            </p>
                        </a>
                    {:else}
                        <!-- Empty/Unknown Slot -->
                        <div
                            class="bg-transparent border border-dashed border-zinc-200/40 dark:border-[#1a1a22]/60
                    rounded-xl p-2 flex items-center justify-center overflow-hidden"
                        ></div>
                    {/if}
                {/each}
            </div>
        </div>
    </div>

    <GridNavigation
        {allGrids}
        {currentGridIndex}
        onPrev={prevGrid}
        onNext={nextGrid}
        onGoTo={goToGrid}
    />
</div>

<!-- Printer Detail Modal -->
<!-- ── Quick Start Modal ─────────────────────────────────────────────────── -->
{#if selectedPrinter && showQuickStart && !showSpoolSelector && !showModuleSelector}
    {@const loadedSpool = selectedPrinter.loaded_spool}
    {@const nextPrint =
        !quickStartLoading && selectedPrinter.suggested_queue
            ? (selectedPrinter.suggested_queue as any[]).find(
                  (i: any) => i.status !== "DONE",
              )
            : null}
    {@const nextModule = nextPrint
        ? (data.printModules as any[]).find(
              (m: any) => m.id === nextPrint.module_id,
          )
        : null}
    <QuickStartModal
        printer={selectedPrinter}
        {loadedSpool}
        {nextPrint}
        {nextModule}
        {quickStartLoading}
        {startingPrinterIds}
        onClose={closePrinterModal}
        onLoadSpool={() => {
            showQuickStart = false;
            handleLoadSpool();
        }}
        onSwitchToManual={() => {
            showQuickStart = false;
        }}
        onEnqueue={enqueueStart}
    />
{/if}

{#if selectedPrinter && !showSpoolSelector && !showModuleSelector && !showQuickStart}
    {@const activePrintJob = getActivePrintJob(
        selectedPrinter.id,
        visibleActivePrintJobs,
    )}
    <PrinterDetailModal
        printer={completingPrinterIds.has(Number(selectedPrinter.id)) &&
        selectedPrinter.status === "finished"
            ? { ...selectedPrinter, status: "idle" }
            : selectedPrinter}
        {activePrintJob}
        live={$liveBySerial[selectedPrinter.printer_serial as string]}
        directConnected={$directConnected.has(
            selectedPrinter.printer_serial as string,
        )}
        {controlLoading}
        {startingPrinterIds}
        {now}
        printJobs={data.printJobs}
        printModules={data.printModules}
        onClose={closePrinterModal}
        onShowHistory={() => (showHistoryModal = true)}
        onLoadSpool={handleLoadSpool}
        onStartPrint={handleStartPrint}
        onPrintFailed={handlePrintFailed}
        onSendControl={sendPrinterControl}
        onToggleBroken={togglePrinterBroken}
        onEnqueue={enqueueStart}
        spareParts={data.sparePartsCatalog ?? []}
        {completePrintSuccessEnhance}
        {adjustWeightEnhance}
    />
{/if}

{#if selectedPrinter && showSpoolSelector}
    <SpoolSelectorModal
        printer={selectedPrinter}
        {orderedSpoolPresets}
        spoolPresets={data.spoolPresets}
        printModules={data.printModules}
        spools={data.spools}
        initialPresetId={spoolInitialPresetId}
        initialSlotIndex={spoolTargetSlotIndex}
        onClose={closeSpoolSelector}
        {loadSpoolEnhance}
    />
{/if}

{#if selectedPrinter && showModuleSelector}
    {@const loadedSpool = selectedPrinter.loaded_spool}
    {@const categorizedModules = getCategorizedModules(
        selectedPrinter,
        loadedSpool,
        data.printModules,
    )}
    <ModuleSelectorModal
        printer={selectedPrinter}
        {loadedSpool}
        {categorizedModules}
        spoolPresets={data.spoolPresets}
        {startingPrinterIds}
        onClose={closeModuleSelector}
        onEnqueue={enqueueStart}
    />
{/if}

{#if selectedPrinter && showHistoryModal}
    {#key selectedPrinter.id}
        <PrinterHistoryModal
            printer={selectedPrinter}
            onClose={() => (showHistoryModal = false)}
        />
    {/key}
{/if}

{#if selectedPrinter && showFailureReasonModal}
    <FailureReasonModal
        activePrintJob={getActivePrintJob(
            selectedPrinter.id,
            visibleActivePrintJobs,
        )}
        loadedSpool={selectedPrinter.loaded_spool}
        onClose={closeFailureReasonModal}
        completePrintEnhance={completePrintFailureEnhance}
        prefill={failurePrefill}
    />
{/if}

<!-- Success animation overlay -->
{#if successParticles.length > 0}
    <div class="pointer-events-none fixed inset-0 z-9999" aria-hidden="true">
        {#each successParticles as p (p.id)}
            <span
                class="absolute animate-float-up"
                style="left:{p.x}px; top:{p.y}px; animation-delay:{p.delay}ms; --drift:{p.drift}px; --rotate:{p.rotate}deg; --scale:{p.scale};"
            >
                {#if successImageSrc}
                    <img
                        src={successImageSrc}
                        alt=""
                        class="w-24 h-24 object-contain drop-shadow-xl"
                    />
                {:else}
                    <span class="text-3xl">📦</span>
                {/if}
            </span>
        {/each}
    </div>
{/if}

{#if startQueueTotal > 1}
    <StartQueueToast {startQueueTotal} />
{/if}

{#if startError}
    <StartErrorToast
        printer={startError.printer}
        message={startError.message}
        onDismiss={() => (startError = null)}
    />
{/if}
