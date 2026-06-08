<script lang="ts">
  import type { PageData } from './$types';
  import type { GridCell, SpoolSuggestion, DashboardPrinter, PiStatus } from '$lib/types';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { browser } from '$app/environment';
  import { formatTime, formatRemainingTime, getElapsedTime, getRemainingTime, getProgress } from '$lib/utils/time';
  import { getActivePrintJob, getLastPrintJob, getCategorizedModules } from '$lib/utils/printerData';
  import { shine } from '$lib/actions/shine';
  import ConnectionStatusIndicator from '$lib/components/dashboard/ConnectionStatusIndicator.svelte';
  import StartQueueToast from '$lib/components/dashboard/StartQueueToast.svelte';
  import GridNavigation from '$lib/components/dashboard/GridNavigation.svelte';
  import PrinterCard from '$lib/components/dashboard/PrinterCard.svelte';
  import QuickStartModal from '$lib/components/dashboard/QuickStartModal.svelte';
  import FailureReasonModal from '$lib/components/dashboard/FailureReasonModal.svelte';
  import SpoolSelectorModal from '$lib/components/dashboard/SpoolSelectorModal.svelte';
  import ModuleSelectorModal from '$lib/components/dashboard/ModuleSelectorModal.svelte';
  import PrinterDetailModal from '$lib/components/dashboard/PrinterDetailModal.svelte';
  import ExternalPrintDetectedModal from '$lib/components/dashboard/ExternalPrintDetectedModal.svelte';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { onMount, onDestroy } from 'svelte';
  import { writable, get } from 'svelte/store';
  import { fileHandlerStore } from '$lib/stores/fileHandler';
  import { quickStartMode } from '$lib/stores/autoQueueStore';
  import { fileHandlerEnabled, directPrinterEnabled, printerPiEnabled, manualModeEnabled } from '$lib/stores/connectionToggles';
  import { isDesktop } from '$lib/stores/desktop';
  import type { TransportMode } from '$lib/types';
  import { computeDepletion, worstStatus, STATUS_DOT } from '$lib/spool-status';

  export let data: PageData;

  // Aggregate spool depletion status for the Materials card dot.
  $: spoolUsageById = new Map((data.spoolUsage ?? []).map((u) => [Number(u.preset_id), u]));
  $: spoolStatuses = (data.spoolPresets ?? [])
    .filter((p) => (p.in_storage ?? 0) > 0 || (spoolUsageById.get(Number(p.id))?.used_30d ?? 0) > 0)
    .map((p) => computeDepletion(p.in_storage ?? 0, spoolUsageById.get(Number(p.id))?.used_30d ?? 0).status);
  $: spoolWorstStatus = worstStatus(spoolStatuses);

  let selectedPrinter: DashboardPrinter | null = null;

  // Success animation
  type Particle = { id: number; x: number; y: number; delay: number; drift: number; rotate: number; scale: number };
  let successParticles: Particle[] = [];
  let successImageSrc: string | null = null;
  let particleCounter = 0;

  let showSpoolSelector: boolean = false;
  let spoolTargetSlotIndex: number = 0;
  let showModuleSelector: boolean = false;
  let showFailureReasonModal: boolean = false;

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
    for (const job of (data.activePrintJobs as any[])) {
      if (
        job.status === 'printing' &&
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
    // Restore start queue from localStorage
    const restored = loadStartQueue();
    if (restored.length > 0) {
      startQueue = restored;
      dispatchNextStart();
    }

    tickerInterval = setInterval(() => { nowStore.set(Date.now()); }, 5000);

    const piOn = get(printerPiEnabled);
    const directOn = get(directPrinterEnabled);

    for (const printer of data.printers as any[]) {
      if (!printer.printer_serial) continue;
      const transport = effectiveTransport(printer);
      if (transport === 'pi') {
        if (piOn) startPiPolling(printer.printer_serial);
      } else {
        // Direct-mode: subscribe via Tauri MQTT + still start Pi polling as fallback
        if (piOn) startPiPolling(printer.printer_serial);
        if (directOn) await subscribeDirectPrinter(printer);
      }
    }

    // Listen for Tauri MQTT status events
    if ($isDesktop && directOn) {
      const stateLabels: Record<string, string> = {
        IDLE: 'Idle', PREPARE: 'Preparing…', RUNNING: 'Printing', PAUSE: 'Paused', FINISH: 'Done', FAILED: 'Failed',
      };
      const { listen } = await import('@tauri-apps/api/event');
      const { emit } = await import('@tauri-apps/api/event');

      const unlistenStatus = await listen<{
        serial: string; printer_id: number;
        gcode_state: string; stage: string;
        progress: number; layer_num: number; total_layer_num: number;
        remaining_time: number | null; nozzle_temp: number | null; bed_temp: number | null; chamber_temp: number | null;
        subtask_name: string | null;
      }>('printer-status', ({ payload: s }) => {
        const prevState = piStatusBySerial[s.serial]?.gcode_state;
        const newState = s.gcode_state;
        const label = newState === 'RUNNING'
          ? `Printing ${s.progress}%`
          : (stateLabels[newState] ?? newState);
        piStatusBySerial = {
          ...piStatusBySerial,
          [s.serial]: {
            gcode_state: newState, progress: s.progress,
            layer_num: s.layer_num, total_layer_num: s.total_layer_num,
            label, remaining_time: s.remaining_time,
            nozzle_temp: s.nozzle_temp, bed_temp: s.bed_temp, chamber_temp: s.chamber_temp,
            subtask_name: s.subtask_name ?? null, gcode_file: null,
          },
        };
        // Advance start queue on PREPARE→RUNNING
        const isHeadOfQueue = startQueue.length > 0 && startQueue[0].printer.printer_serial === s.serial;
        if (isHeadOfQueue && prevState === 'PREPARE' && newState === 'RUNNING') advanceStartQueue();
        // Trigger finish logic
        const wasTrackedPrinting = (data.activePrintJobs as any[]).some((j: any) => j.printer_serial === s.serial);
        const isTerminal = newState === 'FINISH' || newState === 'FAILED';
        const prevWasTerminal = prevState === 'FINISH' || prevState === 'FAILED';
        const justFinished = isTerminal && prevState !== undefined && !prevWasTerminal;
        if (wasTrackedPrinting && justFinished && !reloadTriggered.has(s.serial)) {
          reloadTriggered.add(s.serial);
          setTimeout(() => window.location.reload(), 2000);
        }
      });

      const unlistenConnected = await listen<{ serial: string; printer_id: number }>(
        'printer-connected', ({ payload }) => {
          directConnected = new Set([...directConnected, payload.serial]);
        },
      );
      const unlistenDisconnected = await listen<{ serial: string; printer_id: number }>(
        'printer-disconnected', ({ payload }) => {
          directConnected = new Set([...directConnected].filter(s => s !== payload.serial));
        },
      );

      tauriUnlisteners = [unlistenStatus, unlistenConnected, unlistenDisconnected];
    }
  });

  async function openFileLocally(filePath: string, moduleName: string, printerId: number) {
    if (!get(fileHandlerEnabled)) return false;
    return await fileHandlerStore.openFile(filePath, moduleName, printerId);
  }

  // ── Pi live status polling ────────────────────────────────────────────────
  // Keyed by printer_serial — receives updates from Pi polling OR direct MQTT events
  let piStatusBySerial: Record<string, PiStatus> = {};
  let piPollingIntervals: Record<string, ReturnType<typeof setTimeout>> = {};

  // ── Externally-started print detection ────────────────────────────────────
  // Pi reports a print we aren't tracking → prompt the user to add it.
  type DetectedExternal = {
    printer_id: number;
    task_id: string;
    gcode_file: string | null;
    suggested_module_id: number | null;
    suggested_module_name: string | null;
  };
  let detectedExternal: DetectedExternal | null = null;
  // task_ids the user already acted on (added or dismissed) — don't re-prompt this session.
  const handledExternalTasks = new Set<string>();
  // Guard: only trigger reload/auto-start once per serial per page load
  const reloadTriggered = new Set<string>();

  // ── Direct MQTT transport (Tauri desktop only) ────────────────────────────
  // Serials currently connected via direct MQTT
  let directConnected = new Set<string>();
  // Unlisten callbacks for Tauri event subscriptions
  let tauriUnlisteners: Array<() => void> = [];

  /**
   * Resolves the active transport for a printer at runtime.
   * Precedence: explicit 'direct' > explicit 'pi' > auto-prefer-direct > fallback-pi.
   * 'auto' picks direct only when the desktop app is running and all Bambu credentials are present.
   */
  function effectiveTransport(printer: any): 'direct' | 'pi' | 'manual' {
    if (get(manualModeEnabled)) return 'manual';
    const t: TransportMode = printer.transport ?? 'auto';
    const directEnabled = get(directPrinterEnabled);
    const canDirect = directEnabled && $isDesktop && printer.printer_ip && printer.printer_serial && printer.printer_access_code;
    if (t === 'direct' && canDirect) return 'direct';
    if (t === 'pi') return 'pi';
    // auto: prefer direct in desktop, fall back to pi
    return canDirect ? 'direct' : 'pi';
  }

  async function updatePrinterTransport(printer: any, transport: TransportMode) {
    await fetch(`/api/printer/${printer.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transport }),
    });
    // Optimistic local update so the badge flips immediately
    printer.transport = transport;
    // Re-subscribe if switching to direct
    if ($isDesktop && (transport === 'direct' || transport === 'auto')) {
      await subscribeDirectPrinter(printer);
    }
  }

  async function subscribeDirectPrinter(printer: any) {
    if (!$isDesktop || !printer.printer_ip || !printer.printer_serial || !printer.printer_access_code) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('subscribe_printer', {
      printerId: printer.id,
      ip: printer.printer_ip,
      serial: printer.printer_serial,
      accessCode: printer.printer_access_code,
    }).catch((e: unknown) => console.error('subscribe_printer failed:', e));
  }

  /**
   * Polls Pi status for one printer and updates piStatusBySerial.
   * Also detects the PREPARE→RUNNING transition to advance the start queue,
   * and the →FINISH/FAILED transition to trigger a reload.
   * Transition detection requires a previous non-terminal state so that a fresh
   * page load while the printer is already in FINISH doesn't immediately reload again.
   */
  async function fetchPiStatus(serial: string): Promise<void> {
    try {
      const res = await fetch(`/api/pi/status?serial=${serial}`);
      if (!res.ok) return;
      const d = await res.json() as {
        connected: boolean;
        status: {
          gcode_state: string; progress: number; layer_num: number; total_layer_num: number;
          remaining_time?: number | null; nozzle_temp?: number | null; bed_temp?: number | null; chamber_temp?: number | null;
          subtask_name?: string | null; gcode_file?: string | null;
        } | null;
        detected_external?: DetectedExternal;
      };
      // Surface an externally-started print for confirmation (one prompt at a time).
      if (d.detected_external && !handledExternalTasks.has(d.detected_external.task_id) && !detectedExternal) {
        detectedExternal = d.detected_external;
      }
      if (!d.status) return;
      const stateLabels: Record<string, string> = {
        IDLE:    'Idle',
        PREPARE: 'Preparing…',
        RUNNING: `Printing ${d.status.progress}%`,
        PAUSE:   'Paused',
        FINISH:  'Done',
        FAILED:  'Failed',
      };
      const label = stateLabels[d.status.gcode_state] ?? d.status.gcode_state;
      // Capture previous observed state before overwriting — used for transition detection
      const prevState = piStatusBySerial[serial]?.gcode_state;
      const newState = d.status.gcode_state;
      piStatusBySerial = { ...piStatusBySerial, [serial]: {
        gcode_state: newState,
        progress: d.status.progress,
        layer_num: d.status.layer_num ?? 0,
        total_layer_num: d.status.total_layer_num ?? 0,
        label,
        remaining_time: d.status.remaining_time,
        nozzle_temp: d.status.nozzle_temp,
        bed_temp: d.status.bed_temp,
        chamber_temp: d.status.chamber_temp,
        subtask_name: d.status.subtask_name ?? null,
        gcode_file: d.status.gcode_file ?? null,
      }};
      // Only trigger reload when we observe the TRANSITION into FINISH/FAILED.
      // Requires prevState to be defined (we've seen at least one non-terminal poll)
      // AND prevState was not already a terminal state.
      // This prevents the reload loop caused by reloading while the printer is still
      // in FINISH state — every fresh page load would otherwise immediately reload again.
      const wasTrackedPrinting = (data.activePrintJobs as any[]).some((j: any) => j.printer_serial === serial);
      const isTerminal = newState === 'FINISH' || newState === 'FAILED';
      const prevWasTerminal = prevState === 'FINISH' || prevState === 'FAILED';
      const justFinished = isTerminal && prevState !== undefined && !prevWasTerminal;
      if (wasTrackedPrinting && justFinished && !reloadTriggered.has(serial)) {
        reloadTriggered.add(serial);
        setTimeout(() => window.location.reload(), 2000);
      }
      // Advance start queue when front-of-queue printer moves from PREPARE to RUNNING
      const isHeadOfQueue = startQueue.length > 0 && startQueue[0].printer.printer_serial === serial;
      if (isHeadOfQueue && prevState === 'PREPARE' && newState === 'RUNNING') {
        advanceStartQueue();
      }
    } catch { /* network error — will retry on next poll */ }
  }

  function startPiPolling(serial: string) {
    if (piPollingIntervals[serial]) return;
    fetchPiStatus(serial); // immediate fetch
    function scheduleNext() {
      piPollingIntervals[serial] = setTimeout(async () => {
        await fetchPiStatus(serial);
        scheduleNext();
      }, 10_000); // poll every 10s for all printers
    }
    scheduleNext();
  }

  function stopPiPolling(serial: string) {
    clearTimeout(piPollingIntervals[serial]);
    delete piPollingIntervals[serial];
  }

  onDestroy(() => {
    Object.values(piPollingIntervals).forEach(clearTimeout);
    clearInterval(tickerInterval);
    tauriUnlisteners.forEach((u) => u());
  });

  let controlLoading: string | null = null;

  // ── Sequential start queue ────────────────────────────────────────────────
  type StartQueueEntry = { printer: any; module: any; enqueuedAt: number; startedAt: number | null };
  let startQueue: StartQueueEntry[] = [];
  let startQueueTimeout: ReturnType<typeof setTimeout> | null = null;
  $: startingPrinterIds = new Set(startQueue.map(e => Number(e.printer.id)));
  $: startQueueTotal = startQueue.length;

  const START_QUEUE_KEY = 'printfarm_start_queue';
  type StoredQueueEntry = { printerId: number; moduleId: number; enqueuedAt: number; startedAt: number | null };

  function saveStartQueue() {
    try {
      const serializable: StoredQueueEntry[] = startQueue.map(e => ({
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
        .map(s => {
          const printer = (data.printers as any[]).find(p => p.id === s.printerId);
          const module = (data.printModules as any[]).find(m => m.id === s.moduleId);
          if (!printer || !module) return null;
          return { printer, module, enqueuedAt: s.enqueuedAt, startedAt: s.startedAt } as StartQueueEntry;
        })
        .filter((e): e is StartQueueEntry => e !== null);
    } catch {
      return [];
    }
  }

  function enqueueStart(module: any, printer: any) {
    closePrinterModal();
    startQueue = [...startQueue, { printer, module, enqueuedAt: Date.now(), startedAt: null }];
    saveStartQueue();
    if (startQueue.length === 1) dispatchNextStart();
  }

  /**
   * Sends the head of the start queue to its printer via one of three paths:
   *   1. Pi bridge — Pi handles file upload and triggers print; live state comes from polling.
   *   2. Direct + local file — registers the job in DB then invokes Bambu MQTT directly.
   *   3. Fallback — DB job + optional local file-handler open; advances after 3 s.
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
    const hasPi = !!(printer.printer_ip && printer.printer_serial && printer.printer_access_code);
    const hasLocalHandler = !!(module.filename && fileHandlerState.connected);
    const transport = effectiveTransport(printer);
    const hasDirect = transport === 'direct' && directConnected.has(printer.printer_serial ?? '');
    try {
      if (transport === 'manual') {
        // Manual mode: register the job in DB only — no printer connection.
        // Progress is time-based; user confirms or fails the print manually.
        const formData = new FormData();
        formData.append('printerId', String(printer.id));
        formData.append('moduleId', String(module.id));
        await fetch('?/startPrint', { method: 'POST', body: formData });
        await invalidateAll();
        setTimeout(advanceStartQueue, 3_000);
      } else if (hasPi) {
        // Pi path: Pi handles file upload and print start.
        // In direct mode, MQTT events (not Pi polling) deliver live status.
        const res = await fetch('/api/pi/print', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ module_id: module.id, printer_id: printer.id }),
        });
        const result = await res.json() as { success: boolean; error?: string };
        if (result.success) {
          startPiPolling(printer.printer_serial);
          await invalidateAll();
          // Stays in queue — advances on PREPARE→RUNNING or 30s timeout
        } else {
          advanceStartQueue();
        }
      } else if (hasDirect && module.filename) {
        // Direct mode with local file: register job in DB then send MQTT print command.
        // The file must already be on the printer SD card at /sdcard/cache/<filename>.
        const formData = new FormData();
        formData.append('printerId', String(printer.id));
        formData.append('moduleId', String(module.id));
        await fetch('?/startPrint', { method: 'POST', body: formData });
        const filename = (module.filename as string).split('/').pop() ?? '';
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('start_print_direct', {
          serial: printer.printer_serial,
          remotePath: `/cache/${filename}`,
          param: 'Metadata/plate_1.gcode',
        }).catch((e: unknown) => console.error('start_print_direct failed:', e));
        await invalidateAll();
        setTimeout(advanceStartQueue, 3_000);
      } else {
        const formData = new FormData();
        formData.append('printerId', String(printer.id));
        formData.append('moduleId', String(module.id));
        const res = await fetch('?/startPrint', { method: 'POST', body: formData });
        if (res.ok && hasLocalHandler) await openFileLocally(module.filename, module.name, printer.id);
        await invalidateAll();
        setTimeout(advanceStartQueue, 3_000);
      }
    } catch {
      advanceStartQueue();
    }
  }

  /**
   * Removes the head of the start queue and dispatches the next item if one exists.
   * No page reload — Pi polling continuously streams state into piStatusBySerial,
   * so the printer card's liveIsPrinting flag flips automatically without a reload.
   */
  function advanceStartQueue() {
    if (startQueueTimeout) { clearTimeout(startQueueTimeout); startQueueTimeout = null; }
    startQueue = startQueue.slice(1);
    saveStartQueue();
    if (startQueue.length > 0) {
      dispatchNextStart();
    }
    // No reload — Pi polling streams live state into piStatusBySerial, and
    // the printer card uses liveIsPrinting to flip to "Printing" automatically.
  }

  async function sendPrinterControl(endpoint: string, printerId: number) {
    controlLoading = endpoint;
    try {
      const printer = (data.printers as any[]).find((p: any) => Number(p.id) === printerId);
      const transport = printer ? effectiveTransport(printer) : 'pi';
      if (transport === 'manual') return; // no printer connected in manual mode
      const isDirect = transport === 'direct' && printer?.printer_serial && directConnected.has(printer.printer_serial);

      if (isDirect) {
        // Map Pi API endpoint names to Bambu MQTT command names
        const commandMap: Record<string, string> = { pause: 'pause', resume: 'resume', cancel: 'stop' };
        const command = commandMap[endpoint] ?? endpoint;
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('send_printer_command', { serial: printer.printer_serial, command });
      } else {
        await fetch(`/api/pi/${endpoint}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ printer_id: printerId }),
        });
      }
    } finally {
      if (endpoint !== 'cancel') {
        controlLoading = null;
      } else {
        // Cancel stays loading until the page reloads via the Pi webhook.
        // Safety reset after 30 s in case the webhook never arrives (Pi offline, etc.)
        setTimeout(() => { if (controlLoading === 'cancel') controlLoading = null; }, 30_000);
      }
    }
  }

  async function togglePrinterBroken(printer: any, broken: boolean) {
    controlLoading = broken ? 'marking-broken' : 'marking-repaired';
    await fetch(`/api/printer/${printer.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(broken ? { action: 'broken' } : { action: 'repaired' }),
    });
    printer.status = broken ? 'inactive' : 'idle';
    if (selectedPrinter?.id === printer.id) selectedPrinter = { ...printer };
    // Refresh data.printers so the dashboard card re-derives status (and its tint).
    await invalidateAll();
    controlLoading = null;
  }

  async function selectPrinter(printer: any) {
    selectedPrinter = printer;
    showQuickStart = false;
    if (printer.printer_serial) fetchPiStatus(printer.printer_serial);

    // Quick Start mode: only for Pi-connected printers
    if ($quickStartMode && printer.printer_serial && printer.printer_ip) {
      showQuickStart = true;
      const queue: any[] = printer.suggested_queue ?? [];
      const hasPending = queue.some((i: any) => i.status !== 'DONE');
      if (!hasPending) {
        quickStartLoading = true;
        try {
          const resp = await fetch(`/api/ai-recommendations?type=queue&printerId=${printer.id}`);
          const result = await resp.json();
          if (result && Array.isArray(result)) {
            selectedPrinter = { ...printer, suggested_queue: result };
          }
        } catch { /* ignore — will show empty state */ } finally {
          quickStartLoading = false;
        }
      }
    }
  }

  function closePrinterModal() {
    selectedPrinter = null;
    showSpoolSelector = false;
    showModuleSelector = false;
    showFailureReasonModal = false;
    showQuickStart = false;
  }

  function closeFailureReasonModal() {
    showFailureReasonModal = false;
  }

  // enhance callback for FailureReasonModal — defined here because it closes over selectedPrinter and the close functions
  const completePrintFailureEnhance: SubmitFunction = () => {
    return async ({ result }) => {
      if (result.type === 'success') {
        if (!selectedPrinter) { closeFailureReasonModal(); closePrinterModal(); window.location.reload(); return; }
        try {
          const response = await fetch(`/api/ai-recommendations?type=queue&printerId=${selectedPrinter.id}`);
          const queueResult = await response.json();
          if (queueResult && Array.isArray(queueResult)) {
            selectedPrinter.suggested_queue = queueResult;
          }
        } catch (e) {
          console.error('Failed to refresh suggested queue:', e);
        }
        closeFailureReasonModal();
        closePrinterModal();
        window.location.reload();
      }
    };
  };

  function dismissDetectedExternal() {
    if (detectedExternal) handledExternalTasks.add(detectedExternal.task_id);
    detectedExternal = null;
  }

  const confirmExternalEnhance: SubmitFunction = () => {
    return async ({ result }) => {
      if (detectedExternal) handledExternalTasks.add(detectedExternal.task_id);
      detectedExternal = null;
      if (result.type === 'success') await invalidateAll();
    };
  };

  // enhance callback for PrinterDetailModal "Print Successful" button
  const completePrintSuccessEnhance: SubmitFunction = () => {
    return async ({ result }) => {
      if (result.type === 'success') {
        if (!selectedPrinter) { closePrinterModal(); window.location.reload(); return; }
        try {
          const job = getActivePrintJob(selectedPrinter.id, data.activePrintJobs);
          const finishedModuleId = job?.module_id;
          const queue = selectedPrinter?.suggested_queue;
          // Only regenerate AI queue if the finished module isn't already tracked in the queue
          const inQueue = Array.isArray(queue) && finishedModuleId != null
            ? queue.some((item: any) => item.module_id === finishedModuleId && item.status !== 'DONE')
            : false;
          if (!inQueue && selectedPrinter?.id) {
            const resp = await fetch(`/api/ai-recommendations?type=queue&printerId=${selectedPrinter.id}`);
            const queueResult = await resp.json();
            if (queueResult && Array.isArray(queueResult)) {
              selectedPrinter.suggested_queue = queueResult;
            }
          }
          sessionStorage.setItem('printSuccessAnim', JSON.stringify({
            imagePath: (job as any)?.module_thumbnail ?? null,
          }));
        } catch (e) {
          console.error('Failed to refresh suggested queue:', e);
        }
        closePrinterModal();
        window.location.reload();
      }
    };
  };

  // Default Grid Configuration (fallback if no preset exists)
  const defaultGridLayout: GridCell[] = [
    { type: 'printer', printerId: 1 },
    { type: 'printer', printerId: 2 },
    { type: 'printer', printerId: 3 },
    { type: 'printer', printerId: 4 },
    { type: 'printer', printerId: 5 },
    { type: 'printer', printerId: 6 },
    { type: 'printer', printerId: 7 },
    { type: 'stats' },
    { type: 'settings' },
  ];

  // Grid switching state
  let currentGridIndex = 0;
  let gridContainer: HTMLElement;

  // Get all available grids (from presets or default)
  function getAllGrids(): { name: string; config: GridCell[]; rows: number; cols: number }[] {
    if (data.gridPresets && data.gridPresets.length > 0) {
      // Sort to put default first
      const sorted = [...data.gridPresets].sort((a, b) => Number(b.is_default) - Number(a.is_default));
      return sorted.map(preset => ({
        name: preset.name,
        config: parseGridConfig(preset.grid_config),
        rows: preset.rows || 3,
        cols: preset.cols || 3
      }));
    }
    return [{ name: 'Default', config: defaultGridLayout, rows: 3, cols: 3 }];
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

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      nextGrid();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
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
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && Math.abs(event.deltaX) > 1) {
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
    window.addEventListener('keydown', handleKeydown);
    document.addEventListener('wheel', handleWheel, { passive: false });

    // Play success animation if triggered before last reload
    const pending = sessionStorage.getItem('printSuccessAnim');
    if (pending) {
      sessionStorage.removeItem('printSuccessAnim');
      const { imagePath } = JSON.parse(pending);
      successImageSrc = imagePath;
      successParticles = [{
        id: particleCounter++,
        x: window.innerWidth * 0.5,
        y: window.innerHeight * 0.6,
        delay: 0,
        drift: (Math.random() - 0.5) * 20,
        rotate: (Math.random() - 0.5) * 10,
        scale: 1,
      }];
      setTimeout(() => { successParticles = []; successImageSrc = null; }, 2200);
    }

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('wheel', handleWheel);
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
    if (presets.length === 0) return [] as Array<{ preset: typeof presets[number]; suggestion: SpoolSuggestion | null }>;
    const suggestionByPreset = new Map<number, SpoolSuggestion>();
    suggestedSpools.forEach(s => suggestionByPreset.set(s.preset_id, s));
    const suggested = suggestedSpools
      .map(s => ({ preset: presets.find(p => p.id === s.preset_id), suggestion: s }))
      .filter((x): x is { preset: typeof presets[number]; suggestion: SpoolSuggestion } => !!x.preset);
    const unsuggested = presets
      .filter(p => !suggestionByPreset.has(p.id))
      .map(p => ({ preset: p, suggestion: null as SpoolSuggestion | null }));
    return [...suggested, ...unsuggested];
  })();

  async function handleLoadSpool() {
    if (!selectedPrinter?.id) {
	        showSpoolSelector = true;
        return;
    }

    try {
        const resp = await fetch(
        `/api/ai-recommendations?type=spool&printerId=${selectedPrinter.id}`
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const body = await resp.json();

        suggestedSpools = Array.isArray(body) ? body : [];
        if (suggestedSpools[0]) spoolInitialPresetId = suggestedSpools[0].preset_id;
    } catch (err) {
        console.error('Failed to fetch spool suggestion:', err);
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
      if (result.type === 'success') {
        if (!selectedPrinter) { closePrinterModal(); window.location.reload(); return; }
        try {
          const response = await fetch(`/api/ai-recommendations?type=queue&printerId=${selectedPrinter.id}`);
          const queueResult = await response.json();
          if (queueResult && Array.isArray(queueResult)) {
            selectedPrinter.suggested_queue = queueResult;
          }
        } catch (e) {
          console.error('Failed to refresh suggested queue:', e);
        }
        closePrinterModal();
        window.location.reload();
      }
    };
  };

  // enhance callback for manual spool weight deduction in PrinterDetailModal
  const adjustWeightEnhance: SubmitFunction = () => {
    return async ({ result }) => {
      if (result.type === 'success') {
        await invalidateAll();
        // Re-sync the open modal's printer from refreshed data
        if (selectedPrinter) {
          const fresh = data.printers.find(p => Number(p.id) === Number(selectedPrinter!.id));
          if (fresh) selectedPrinter = fresh;
        }
      }
    };
  };

  async function handleStartPrint() {
    if (!selectedPrinter?.loaded_spool) {
      alert('Please load a spool first');
      return;
    }
	// Only generate queue if empty or all items are DONE
  const queue = selectedPrinter.suggested_queue;
  const shouldGenerateQueue =
    !queue ||
    queue.length === 0 ||
    queue.every(item => item.status === 'DONE');

  if (shouldGenerateQueue) {
    const response = await fetch(`/api/ai-recommendations?type=queue&printerId=${selectedPrinter.id}`);
    const result = await response.json();
    if (result && Array.isArray(result)) {
      selectedPrinter.suggested_queue = result;
    }
  }

  showModuleSelector = true;
}

  function closeModuleSelector() {
    showModuleSelector = false;
  }

  function handlePrintFailed() {
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
        <h1 class="text-4xl font-extralight text-zinc-900 dark:text-zinc-50 tracking-tight">Print Farm</h1>
        {#if allGrids.length > 1}
          <span class="text-sm text-zinc-400 dark:text-zinc-600 font-light tracking-wide uppercase">
            {currentGrid?.name || 'Dashboard'}
          </span>
        {/if}
      </div>
    </div>
    <div class="flex items-center gap-6">
      <div class="flex items-center gap-4 text-sm text-zinc-400 dark:text-zinc-500 font-light tracking-wide">
      </div>
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

      {#if cell.type === 'printer'}
        {@const printer = cell.printerId ? data.printers.find(p => Number(p.id) === Number(cell.printerId)) : null}

        {#if printer}
          <PrinterCard
            printer={printer}
            piLive={piStatusBySerial[printer.printer_serial as string]}
            liveIsStarting={startingPrinterIds.has(Number(printer.id))}
            activePrintJobs={data.activePrintJobs}
            printModules={data.printModules}
            startQueue={startQueue}
            now={now}
            onSelect={() => selectPrinter(printer)}
          />
        {:else}
          <!-- Empty Printer Slot -->
          <div class="bg-transparent border border-dashed border-zinc-200/40 dark:border-[#1a1a22]/60
                      rounded-xl p-2 flex items-center justify-center overflow-hidden">
            <div class="text-center">
              <div class="w-8 h-8 mx-auto rounded-lg border border-dashed border-zinc-300/40 dark:border-zinc-700/40 flex items-center justify-center mb-1">
                <svg class="w-4 h-4 text-zinc-300 dark:text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p class="text-[clamp(0.4rem,1.3vw,0.65rem)] font-light text-zinc-300 dark:text-zinc-700 tracking-wide">Empty</p>
            </div>
          </div>
        {/if}

      {:else if cell.type === 'settings'}
        <!-- Settings Card -->
        <a
          use:shine
          href="/settings"
          class="group bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
        >
          <div class="group-hover:rotate-90 transition-transform duration-700 ease-out">
            <svg class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </div>
          <h3 class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight">Settings</h3>
          <p class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide">Configure</p>
        </a>

      {:else if cell.type === 'stats'}
        <!-- Stats Card -->
        <a
          use:shine
          href="/stats"
          class="group bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
        >
          <div class="group-hover:scale-110 transition-transform duration-500 ease-out">
            <svg class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <h3 class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight">Stats</h3>
          <p class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide">Inspect Data</p>
        </a>

      {:else if cell.type === 'spools'}
        <!-- Spools Card -->
        <a
          use:shine
          href="/spools"
          class="group relative bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
        >
          {#if spoolWorstStatus !== 'ok'}
            <span
              class="absolute top-2 right-2 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#0c0c0f] {STATUS_DOT[spoolWorstStatus]} {spoolWorstStatus === 'empty' ? 'animate-pulse' : ''}"
              title="{spoolWorstStatus === 'empty' ? 'A spool is out of stock' : 'A spool is running low'}"
            ></span>
          {/if}
          <div class="group-hover:scale-110 transition-transform duration-500 ease-out">
            <!-- Filament spool: reel rim, hub, and a loose filament strand -->
            <svg class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <circle cx="10.5" cy="11.5" r="7.75" />
              <circle cx="10.5" cy="11.5" r="2.5" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 17.1c1.4 1.2 2.9 1.7 4.4 1.4 1-.2 1.6-.9 1.6-1.8 0-.8-.6-1.4-1.4-1.4" />
            </svg>
          </div>
          <h3 class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight">Spools</h3>
          <p class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide tabular-nums">{data.spools.length} spools</p>
        </a>

      {:else if cell.type === 'inventory'}
        <!-- Inventory Card -->
        <a
          use:shine
          href="/inventory"
          class="group bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
        >
          <div class="group-hover:scale-110 transition-transform duration-500 ease-out">
            <svg class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3" />
            </svg>
          </div>
          <h3 class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight">Inventory</h3>
          <p class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide">Stock</p>
        </a>

      {:else if cell.type === 'products'}
        <!-- Products Card -->
        <a
          use:shine
          href="/products"
          class="group bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
        >
          <div class="group-hover:scale-110 transition-transform duration-500 ease-out">
            <svg class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
            </svg>
          </div>
          <h3 class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight">Products</h3>
          <p class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide">Catalog</p>
        </a>

      {:else}
        <!-- Empty/Unknown Slot -->
        <div class="bg-transparent border border-dashed border-zinc-200/40 dark:border-[#1a1a22]/60
                    rounded-xl p-2 flex items-center justify-center overflow-hidden">
        </div>
      {/if}

    {/each}

      </div>
    </div>
  </div>

  <GridNavigation
    allGrids={allGrids}
    currentGridIndex={currentGridIndex}
    onPrev={prevGrid}
    onNext={nextGrid}
    onGoTo={goToGrid}
  />
</div>

<!-- Printer Detail Modal -->
<!-- ── Quick Start Modal ─────────────────────────────────────────────────── -->
{#if selectedPrinter && showQuickStart && !showSpoolSelector && !showModuleSelector}
  {@const loadedSpool = selectedPrinter.loaded_spool}
  {@const nextPrint = !quickStartLoading && selectedPrinter.suggested_queue ? (selectedPrinter.suggested_queue as any[]).find((i: any) => i.status !== 'DONE') : null}
  {@const nextModule = nextPrint ? (data.printModules as any[]).find((m: any) => m.id === nextPrint.module_id) : null}
  <QuickStartModal
    printer={selectedPrinter}
    loadedSpool={loadedSpool}
    nextPrint={nextPrint}
    nextModule={nextModule}
    quickStartLoading={quickStartLoading}
    startingPrinterIds={startingPrinterIds}
    onClose={closePrinterModal}
    onLoadSpool={() => { showQuickStart = false; handleLoadSpool(); }}
    onSwitchToManual={() => { showQuickStart = false; }}
    onEnqueue={enqueueStart}
  />
{/if}

{#if selectedPrinter && !showSpoolSelector && !showModuleSelector && !showQuickStart}
  {@const activePrintJob = getActivePrintJob(selectedPrinter.id, data.activePrintJobs)}
  <PrinterDetailModal
    printer={selectedPrinter}
    activePrintJob={activePrintJob}
    piLive={piStatusBySerial[selectedPrinter.printer_serial as string]}
    controlLoading={controlLoading}
    startingPrinterIds={startingPrinterIds}
    now={now}
    printJobs={data.printJobs}
    printModules={data.printModules}
    onClose={closePrinterModal}
    onLoadSpool={handleLoadSpool}
    onStartPrint={handleStartPrint}
    onPrintFailed={handlePrintFailed}
    onSendControl={sendPrinterControl}
    onToggleBroken={togglePrinterBroken}
    onEnqueue={enqueueStart}
    completePrintSuccessEnhance={completePrintSuccessEnhance}
    adjustWeightEnhance={adjustWeightEnhance}
  />

{/if}

{#if selectedPrinter && showSpoolSelector}
  <SpoolSelectorModal
    printer={selectedPrinter}
    orderedSpoolPresets={orderedSpoolPresets}
    spoolPresets={data.spoolPresets}
    spools={data.spools}
    initialPresetId={spoolInitialPresetId}
    initialSlotIndex={spoolTargetSlotIndex}
    onClose={closeSpoolSelector}
    loadSpoolEnhance={loadSpoolEnhance}
  />
{/if}

{#if selectedPrinter && showModuleSelector}
  {@const loadedSpool = selectedPrinter.loaded_spool}
  {@const categorizedModules = getCategorizedModules(selectedPrinter, loadedSpool, data.printModules)}
  <ModuleSelectorModal
    printer={selectedPrinter}
    loadedSpool={loadedSpool}
    categorizedModules={categorizedModules}
    spoolPresets={data.spoolPresets}
    startingPrinterIds={startingPrinterIds}
    onClose={closeModuleSelector}
    onEnqueue={enqueueStart}
  />

{/if}

{#if detectedExternal}
  {@const ext = detectedExternal}
  {@const detectedPrinter = data.printers.find((p) => Number(p.id) === Number(ext.printer_id))}
  <ExternalPrintDetectedModal
    detected={ext}
    printerName={detectedPrinter?.name ?? `Printer ${ext.printer_id}`}
    onClose={dismissDetectedExternal}
    confirmEnhance={confirmExternalEnhance}
  />
{/if}

{#if selectedPrinter && showFailureReasonModal}
  <FailureReasonModal
    activePrintJob={getActivePrintJob(selectedPrinter.id, data.activePrintJobs)}
    loadedSpool={selectedPrinter.loaded_spool}
    onClose={closeFailureReasonModal}
    completePrintEnhance={completePrintFailureEnhance}
  />
{/if}

<ConnectionStatusIndicator
  fileHandlerState={fileHandlerState}
  isDesktop={$isDesktop}
  directConnected={directConnected}
  printers={data.printers as any[]}
/>

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
  <StartQueueToast startQueueTotal={startQueueTotal} />
{/if}
