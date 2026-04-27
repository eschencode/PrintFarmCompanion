<script lang="ts">
  import type { PageData } from './$types';
  import type { GridCell, SpoolSuggestion } from '$lib/types';
  import p1sImage from '$lib/assets/p1s.png';
  import h2sImage from '$lib/assets/H2S.png';
  import { enhance } from '$app/forms';
  import { onMount, onDestroy } from 'svelte';
  import { writable, get } from 'svelte/store';
  import { fileHandlerStore } from '$lib/stores/fileHandler';
  import { quickStartMode, autoStartMode } from '$lib/stores/autoQueueStore';
  import { fileHandlerEnabled, directPrinterEnabled, printerPiEnabled } from '$lib/stores/connectionToggles';
  import { isDesktop } from '$lib/stores/desktop';
  import type { TransportMode } from '$lib/types';

  export let data: PageData;

  let selectedPrinter: any = null;

  // Success animation
  type Particle = { id: number; x: number; y: number; delay: number; drift: number; rotate: number; scale: number };
  let successParticles: Particle[] = [];
  let successImageSrc: string | null = null;
  let particleCounter = 0;

  function triggerSuccessAnimation(e: MouseEvent, count: number, imagePath: string | null) {
    const btn = (e.currentTarget as HTMLElement).closest('button') as HTMLElement;
    const rect = btn.getBoundingClientRect();
    successImageSrc = imagePath;
    successParticles = [{
      id: particleCounter++,
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.3,
      delay: 0,
      drift: (Math.random() - 0.5) * 20,
      rotate: (Math.random() - 0.5) * 10,
      scale: 1,
    }];
    setTimeout(() => { successParticles = []; successImageSrc = null; }, 2200);
  }
  let showSpoolSelector: boolean = false;
  let showModuleSelector: boolean = false;
  let showFailureReasonModal: boolean = false;
  let selectedPresetId: number | null = null;
  let selectedModuleId: number | null = null;
  let selectedFailureReason: string = ''; // ✅ This stores "deduct" or "keep"
  let customFailureReason: string = ''; // ✅ This stores the actual failure reason text
  let showCustomInput: boolean = false; // ✅ NEW: Track if "Custom" was selected

  // Auto Queue state
  let showQuickStart = false;
  let quickStartLoading = false;
  type AutoQueueCountdown = { seconds: number; moduleName: string; module: any; printer: any; timer: ReturnType<typeof setInterval> };
  let autoQueueCountdown: AutoQueueCountdown | null = null;

  $: fileHandlerState = $fileHandlerStore;

  // Reactive clock for live progress updates
  const nowStore = writable(Date.now());
  $: now = $nowStore;
  let tickerInterval: ReturnType<typeof setInterval>;
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
          if ($autoStartMode && newState === 'FINISH') startAutoQueueNext(s.serial);
          else setTimeout(() => window.location.reload(), 2000);
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

    return () => clearInterval(tickerInterval);
  });

  async function openFileLocally(filePath: string, moduleName: string, printerId: number) {
    if (!get(fileHandlerEnabled)) return false;
    return await fileHandlerStore.openFile(filePath, moduleName, printerId);
  }

  // ── Pi live status polling ────────────────────────────────────────────────
  type PiStatus = {
    gcode_state: string; progress: number; layer_num: number; total_layer_num: number; label: string;
    remaining_time?: number | null; nozzle_temp?: number | null; bed_temp?: number | null; chamber_temp?: number | null;
    subtask_name?: string | null; gcode_file?: string | null;
  };
  // Keyed by printer_serial — receives updates from Pi polling OR direct MQTT events
  let piStatusBySerial: Record<string, PiStatus> = {};
  let piPollingIntervals: Record<string, ReturnType<typeof setTimeout>> = {};
  // Guard: only trigger reload/auto-start once per serial per page load
  const reloadTriggered = new Set<string>();

  // ── Direct MQTT transport (Tauri desktop only) ────────────────────────────
  // Serials currently connected via direct MQTT
  let directConnected = new Set<string>();
  // Unlisten callbacks for Tauri event subscriptions
  let tauriUnlisteners: Array<() => void> = [];

  /** Effective transport for a given printer — resolved at runtime. */
  function effectiveTransport(printer: any): 'direct' | 'pi' {
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
      };
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
        if ($autoStartMode && newState === 'FINISH') {
          startAutoQueueNext(serial);
        } else {
          setTimeout(() => window.location.reload(), 2000);
        }
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

  onDestroy(() => { Object.values(piPollingIntervals).forEach(clearTimeout); });

  let controlLoading: string | null = null;

  // ── Sequential start queue ────────────────────────────────────────────────
  type StartQueueEntry = { printer: any; module: any; enqueuedAt: number; startedAt: number | null };
  let startQueue: StartQueueEntry[] = [];
  let startQueueTimeout: ReturnType<typeof setTimeout> | null = null;
  $: startingSerials = new Set(startQueue.map(e => e.printer.printer_serial));
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

  async function dispatchNextStart() {
    if (startQueue.length === 0) return;
    startQueue[0] = { ...startQueue[0], startedAt: Date.now() };
    startQueue = [...startQueue];
    saveStartQueue();
    const { module, printer } = startQueue[0];
    startQueueTimeout = setTimeout(advanceStartQueue, 120_000);
    const hasPi = module.file_stored_on_pi && printer.printer_ip && printer.printer_serial && printer.printer_access_code;
    const hasLocalHandler = module.local_file_handler_path && fileHandlerState.connected;
    const transport = effectiveTransport(printer);
    const hasDirect = transport === 'direct' && directConnected.has(printer.printer_serial ?? '');
    try {
      if (hasPi) {
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
          // Stays in queue — advances on PREPARE→RUNNING or 30s timeout
        } else {
          advanceStartQueue();
        }
      } else if (hasDirect && module.local_file_handler_path) {
        // Direct mode with local file: register job in DB then send MQTT print command.
        // The file must already be on the printer SD card at /sdcard/cache/<filename>.
        const formData = new FormData();
        formData.append('printerId', String(printer.id));
        formData.append('moduleId', String(module.id));
        await fetch('?/startPrint', { method: 'POST', body: formData });
        const filename = (module.local_file_handler_path as string).split('/').pop() ?? '';
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('start_print_direct', {
          serial: printer.printer_serial,
          remotePath: `/cache/${filename}`,
          param: 'Metadata/plate_1.gcode',
        }).catch((e: unknown) => console.error('start_print_direct failed:', e));
        setTimeout(advanceStartQueue, 3_000);
      } else {
        const formData = new FormData();
        formData.append('printerId', String(printer.id));
        formData.append('moduleId', String(module.id));
        const res = await fetch('?/startPrint', { method: 'POST', body: formData });
        if (res.ok && hasLocalHandler) await openFileLocally(module.local_file_handler_path, module.name, printer.id);
        setTimeout(advanceStartQueue, 3_000);
      }
    } catch {
      advanceStartQueue();
    }
  }

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
      // Cancel keeps loading until the page reloads via webhook; Pause/Resume reset immediately
      if (endpoint !== 'cancel') controlLoading = null;
    }
  }

  async function togglePrinterBroken(printer: any, broken: boolean) {
    controlLoading = broken ? 'marking-broken' : 'marking-repaired';
    await fetch(`/api/printer/${printer.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(broken ? { action: 'broken' } : { action: 'repaired' }),
    });
    printer.status = broken ? 'BROKEN' : 'IDLE';
    if (selectedPrinter?.id === printer.id) selectedPrinter = { ...printer };
    controlLoading = null;
  }

  function formatRemainingTime(mins: number | null | undefined): string {
    if (mins == null || mins <= 0) return '';
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${mins}m`;
  }

  // Predefined failure reasons
  const failureReasons = [
    'Spaghetti / Layer Adhesion Failure',
    'Werkzeug kopf abgefallen',
    'Filament Runout',
    'Poor quality',
    'Power Outage',
    'Poor First Layer',
    'Stringing / Oozing',
    'Custom' // This will show the custom input field
  ];

  // ── Auto Queue ────────────────────────────────────────────────────────────
  function startAutoQueueNext(serial: string) {
    const printer = (data.printers as any[]).find((p: any) => p.printer_serial === serial);
    if (!printer) { setTimeout(() => window.location.reload(), 2000); return; }

    const queue: any[] = printer.suggested_queue ?? [];
    const nextItem = queue.find((i: any) => i.status !== 'DONE');
    if (!nextItem) { setTimeout(() => window.location.reload(), 2000); return; }

    const nextModule = (data.printModules as any[]).find((m: any) => m.id === nextItem.module_id);
    if (!nextModule?.file_stored_on_pi || !printer.printer_ip) {
      setTimeout(() => window.location.reload(), 2000);
      return;
    }

    let secsLeft = 5;
    const timer = setInterval(() => {
      secsLeft--;
      if (autoQueueCountdown) autoQueueCountdown = { ...autoQueueCountdown, seconds: secsLeft };
      if (secsLeft <= 0) {
        clearInterval(timer);
        autoQueueCountdown = null;
        enqueueStart(nextModule, printer);
      }
    }, 1000);
    autoQueueCountdown = { seconds: secsLeft, moduleName: nextItem.module_name, module: nextModule, printer, timer };
  }

  function cancelAutoQueue() {
    if (autoQueueCountdown) {
      clearInterval(autoQueueCountdown.timer);
      autoQueueCountdown = null;
    }
    setTimeout(() => window.location.reload(), 300);
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
            selectedPrinter = { ...selectedPrinter, suggested_queue: result };
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
    selectedPresetId = null;
    selectedModuleId = null;
    selectedFailureReason = '';
    customFailureReason = '';
  }

  function closeFailureReasonModal() {
    showFailureReasonModal = false;
    selectedFailureReason = '';
    customFailureReason = '';
    showCustomInput = false; // ✅ Reset custom input visibility
  }

  // ✅ ADD THIS FUNCTION
  function selectFailureReason(choice: string) {
    selectedFailureReason = choice;
  }

  // Mouse-position-dependent shine effect
  function shine(node: HTMLElement) {
    function onMove(e: MouseEvent) {
      const rect = node.getBoundingClientRect();
      node.style.setProperty('--shine-x', `${e.clientX - rect.left}px`);
      node.style.setProperty('--shine-y', `${e.clientY - rect.top}px`);
      node.style.setProperty('--shine-opacity', '1');
    }
    function onLeave() {
      node.style.setProperty('--shine-opacity', '0');
    }
    node.addEventListener('mousemove', onMove);
    node.addEventListener('mouseleave', onLeave);
    return {
      destroy() {
        node.removeEventListener('mousemove', onMove);
        node.removeEventListener('mouseleave', onLeave);
      }
    };
  }

  function getPrinterImage(model: any) {
    if (model) {
      const modelLower = model.toLowerCase();
      if (modelLower.includes('h2s')) return h2sImage;
      if (modelLower.includes('p1s')) return p1sImage;
    }
    return p1sImage;
  }

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
      const sorted = [...data.gridPresets].sort((a, b) => (b.is_default || 0) - (a.is_default || 0));
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

  function getPrinterForPosition(printerId: number | undefined) {
    if (!printerId) return null;
    // Use == for type coercion since printerId from JSON might be string
    return data.printers.find(p => Number(p.id) === Number(printerId));
  }

  // Get active print job for selected printer
  function getActivePrintJob(printerId: number) {
    return data.activePrintJobs.find((job: any) => job.printer_id === printerId);
  }

  // Get spool info for printer
  function getLoadedSpool(spoolId: number | null) {
    if (!spoolId) return null;
    return data.spools.find((s: any) => s.id === spoolId);
  }

  // Get last completed print job for printer
  function getLastPrintJob(printerId: number) {
    if (!data.printJobs || data.printJobs.length === 0) return null;

    const completedJobs = data.printJobs.filter((job: any) =>
      job.printer_id === printerId && job.status !== 'printing'
    );

    if (completedJobs.length === 0) return null;

    // Sort by end_time descending and return the most recent
    return completedJobs.sort((a: any, b: any) => b.end_time - a.end_time)[0];
  }

  // Enhanced module filtering and sorting
  function getCategorizedModules() {
    if (!selectedPrinter || !selectedPrinter.loaded_spool_id) return {
      compatiblePrintable: [],
      compatibleInsufficientMaterial: [],
      anySpoolPrintable: [],
      anySpoolInsufficientMaterial: []
    };

    const loadedSpool = getLoadedSpool(selectedPrinter.loaded_spool_id);
    if (!loadedSpool) return {
      compatiblePrintable: [],
      compatibleInsufficientMaterial: [],
      anySpoolPrintable: [],
      anySpoolInsufficientMaterial: []
    };

    const categories = {
      compatiblePrintable: [] as any[],
      compatibleInsufficientMaterial: [] as any[],
      anySpoolPrintable: [] as any[],
      anySpoolInsufficientMaterial: [] as any[]
    };

    console.log('[DEBUG getCategorizedModules] printer:', selectedPrinter.name, 'printer_model_id:', selectedPrinter.printer_model_id, '(type:', typeof selectedPrinter.printer_model_id, ')');
    console.log('[DEBUG getCategorizedModules] loadedSpool preset_id:', loadedSpool.preset_id, '(type:', typeof loadedSpool.preset_id, ')');

    data.printModules.forEach((module: any) => {
      // Filter by printer model: skip if module requires a different model
      const modelFilteredOut = module.printer_model_id && selectedPrinter.printer_model_id && module.printer_model_id !== selectedPrinter.printer_model_id;
      if (modelFilteredOut) {
        console.log('[DEBUG] FILTERED OUT by model:', module.name, 'module_model_id:', module.printer_model_id, '(type:', typeof module.printer_model_id, ') vs printer_model_id:', selectedPrinter.printer_model_id, '(type:', typeof selectedPrinter.printer_model_id, ')');
        return;
      }

      const hasEnoughMaterial = loadedSpool.remaining_weight >= module.expected_weight;
      const moduleHasPreference = module.default_spool_preset_id !== null;
      const presetMatches = loadedSpool.preset_id === module.default_spool_preset_id;
      console.log('[DEBUG] Module:', module.name, '| model_id:', module.printer_model_id, '| preset:', module.default_spool_preset_id, '| spool_preset:', loadedSpool.preset_id, '| presetMatch:', presetMatches, '| hasPreference:', moduleHasPreference, '| enoughMaterial:', hasEnoughMaterial);

      if (moduleHasPreference) {
        // Module has a preset preference
        if (presetMatches) {
          // Preset matches loaded spool
          if (hasEnoughMaterial) {
            categories.compatiblePrintable.push(module);
          } else {
            categories.compatibleInsufficientMaterial.push(module);
          }
        }
        // If preset doesn't match, we don't show it
      } else {
        // Module works with any spool (no preset preference)
        if (hasEnoughMaterial) {
          categories.anySpoolPrintable.push(module);
        } else {
          categories.anySpoolInsufficientMaterial.push(module);
        }
      }
    });

    // Sort each category by weight (descending)
    const sortByWeight = (a: any, b: any) => b.expected_weight - a.expected_weight;
    categories.compatiblePrintable.sort(sortByWeight);
    categories.compatibleInsufficientMaterial.sort(sortByWeight);
    categories.anySpoolPrintable.sort(sortByWeight);
    categories.anySpoolInsufficientMaterial.sort(sortByWeight);

    return categories;
  }

	async function startSuggestedPrint(printItem) {
	// You can call your startPrint action here, e.g.:
	const response = await fetch('/?/startPrint', {
		method: 'POST',
		body: new URLSearchParams({
		printerId: selectedPrinter.id,
		moduleId: printItem.module_id
		})
	});
	const result = await response.json();
	// Optionally update UI or reload data
	if (result.success) {
		closePrinterModal();
		window.location.reload();
	}
	}
  // Modal handlers

  let suggestedSpools: SpoolSuggestion[] = [];

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
        if (suggestedSpools[0]) selectedPresetId = suggestedSpools[0].preset_id;
    } catch (err) {
        console.error('Failed to fetch spool suggestion:', err);
    } finally {
        showSpoolSelector = true;
    }
    }

  function closeSpoolSelector() {
    showSpoolSelector = false;
    selectedPresetId = null;
  }

  function selectSpoolPreset(presetId: number) {
    selectedPresetId = presetId;
  }

  async function handleStartPrint() {
    if (!selectedPrinter?.loaded_spool_id) {
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
    selectedModuleId = null;
  }

  function selectModule(moduleId: number) {
    selectedModuleId = moduleId;
  }

  function handlePrintFailed() {
    showFailureReasonModal = true;
  }

  // Time formatting helpers
  function formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  // Auto-detect seconds vs ms — old DB records stored Unix seconds, new ones store ms
  function getElapsedTimeMinutes(startTime: number): number {
    const ms = startTime < 10_000_000_000 ? startTime * 1000 : startTime;
    return Math.floor((now - ms) / 1000 / 60);
  }

  function getElapsedTime(startTime: number): string {
    const elapsed = getElapsedTimeMinutes(startTime);
    return formatTime(elapsed);
  }

  function getRemainingTime(startTime: number, expectedMinutes: number): string {
    const elapsed = getElapsedTimeMinutes(startTime);
    const remaining = Math.max(0, expectedMinutes - elapsed);
    return formatTime(remaining);
  }

  function getProgress(startTime: number, expectedMinutes: number): number {
    const elapsed = getElapsedTimeMinutes(startTime);
    return Math.min(100, Math.round((elapsed / expectedMinutes) * 100));
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
      <!-- Dynamic Grid -->
      <div
        class="grid gap-5 h-full"
        style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr)); grid-template-rows: repeat({gridRows}, minmax(0, 1fr));"
      >

    {#each gridLayout as cell, i}

      {#if cell.type === 'printer'}
        {@const printer = getPrinterForPosition(cell.printerId)}

        {#if printer}
          {@const piLive = piStatusBySerial[printer.printer_serial]}
          {@const liveIsPrinting = !!piLive && ['RUNNING','PREPARE','PAUSE'].includes(piLive.gcode_state)}
          {@const liveIsStarting = startingSerials.has(printer.printer_serial)}
          <!-- Active Printer Card -->
          <button
            use:shine
            onclick={() => selectPrinter(printer)}
            class="group relative bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                   rounded-xl p-3 card-lift card-shine
                   flex flex-col items-center justify-center overflow-hidden min-h-0"
          >
            <!-- Status Indicator — larger, with glow -->
            <div class="absolute top-3 right-3">
              {#if liveIsStarting}
                <div class="w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse"></div>
              {:else if liveIsPrinting || printer.status === 'printing'}
                {@const activePrintForDot = getActivePrintJob(Number(printer.id))}
                {@const progressForDot = activePrintForDot ? getProgress(Number(activePrintForDot.start_time), Number(activePrintForDot.expected_time)) : 0}
                {#if progressForDot >= 100}
                  <div class="w-2.5 h-2.5 bg-violet-500 rounded-full status-glow-violet"></div>
                {:else}
                  {@const spoolForDot = printer.loaded_spool_id ? getLoadedSpool(printer.loaded_spool_id) : null}
                  {@const weightAfterPrint = spoolForDot ? (spoolForDot as any).remaining_weight - (activePrintForDot?.expected_weight || 0) : 0}
                  {@const compatModules = data.printModules.filter((m: any) => {
                    if (m.printer_model_id && printer.printer_model_id && m.printer_model_id !== printer.printer_model_id) return false;
                    const hasPreset = m.default_spool_preset_id !== null;
                    const presetOk = spoolForDot && (spoolForDot as any).preset_id === m.default_spool_preset_id;
                    return !hasPreset || presetOk;
                  })}
                  {@const minWeight = compatModules.length > 0
                    ? Math.min(...compatModules.map((m: any) => m.expected_weight))
                    : Infinity}
                  {@const printsPossible = minWeight > 0 && minWeight !== Infinity
                    ? Math.floor(weightAfterPrint / minWeight)
                    : 0}
                  {#if !spoolForDot || printsPossible <= 0}
                    <div class="w-2.5 h-2.5 bg-red-500 rounded-full status-glow-red"></div>
                  {:else if printsPossible === 1}
                    <div class="w-2.5 h-2.5 bg-yellow-500 rounded-full status-glow-yellow"></div>
                  {:else}
                    <div class="w-2.5 h-2.5 bg-green-500 rounded-full status-glow-green"></div>
                  {/if}
                {/if}
              {:else if printer.status === 'IDLE'}
                {@const loadedSpoolForDot = printer.loaded_spool_id ? getLoadedSpool(printer.loaded_spool_id) : null}
                {@const remainingWeight = loadedSpoolForDot ? (loadedSpoolForDot as any).remaining_weight : 0}
                {@const compatibleModules = data.printModules.filter((m: any) => {
                  if (m.printer_model_id && printer.printer_model_id && m.printer_model_id !== printer.printer_model_id) return false;
                  const moduleHasPresetPreference = m.default_spool_preset_id !== null;
                  const presetMatches = loadedSpoolForDot && (loadedSpoolForDot as any).preset_id === m.default_spool_preset_id;
                  return !moduleHasPresetPreference || presetMatches;
                })}
                {@const minModuleWeight = compatibleModules.length > 0
                  ? Math.min(...compatibleModules.map((m: any) => m.expected_weight))
                  : Infinity}
                {@const maxPrintsPossible = minModuleWeight > 0 && minModuleWeight !== Infinity
                  ? Math.floor(remainingWeight / minModuleWeight)
                  : 0}
                {#if !loadedSpoolForDot}
                  <div class="w-2.5 h-2.5 bg-red-500 rounded-full status-glow-red"></div>
                {:else if maxPrintsPossible === 0}
                  <div class="w-2.5 h-2.5 bg-red-500 rounded-full status-glow-red"></div>
                {:else if maxPrintsPossible === 1}
                  <div class="w-2.5 h-2.5 bg-yellow-500 rounded-full status-glow-yellow"></div>
                {:else}
                  <div class="w-2.5 h-2.5 bg-green-500 rounded-full status-glow-green"></div>
                {/if}
              {:else if printer.status === 'BROKEN'}
                <div class="w-2.5 h-2.5 bg-red-500 rounded-full status-glow-red animate-pulse"></div>
              {:else}
                <div class="w-2.5 h-2.5 bg-zinc-400 dark:bg-zinc-600 rounded-full"></div>
              {/if}
            </div>

            <!-- Printer Image -->
            <div class="flex-1 flex items-center justify-center min-h-0 w-full group-hover:scale-[1.03] transition-transform duration-500 ease-out">
              <img
                src={getPrinterImage(printer.model)}
                alt="Printer"
                class="max-h-full max-w-full object-contain opacity-80 group-hover:opacity-100 transition-opacity duration-500"
              />
            </div>

            <!-- Printer Name & Status -->
            <div class="w-full text-center border-t border-zinc-200/60 dark:border-[#1a1a22] pt-2 mt-2 min-h-0 flex-shrink-0">
              <h3 class="text-[clamp(0.55rem,2vw,0.875rem)] font-medium text-zinc-900 dark:text-zinc-100 truncate px-1 tracking-tight">{printer.name}</h3>
              <p class="text-[clamp(0.4rem,1.5vw,0.7rem)] font-light tracking-wide uppercase mt-0.5">
                {#if liveIsStarting}
                  {@const qPos = startQueue.findIndex(e => e.printer.printer_serial === printer.printer_serial)}
                  <span class="text-amber-500 dark:text-amber-400">
                    {qPos === 0 ? 'Starting…' : `Queue ${qPos + 1}/${startQueueTotal}`}
                  </span>
                {:else if liveIsPrinting || printer.status === 'printing'}
                  <span class="text-blue-500 dark:text-blue-400">Printing</span>
                {:else if printer.status === 'IDLE'}
                  <span class="text-emerald-500 dark:text-emerald-400">Idle</span>
                {:else if printer.status === 'BROKEN'}
                  <span class="text-red-500 dark:text-red-400">Broken</span>
                {:else}
                  <span class="text-zinc-400 dark:text-zinc-500">{printer.status}</span>
                {/if}
              </p>

              <!-- Progress Bar for Active Prints -->
              {#if liveIsStarting}
                {@const qPos = startQueue.findIndex(e => e.printer.printer_serial === printer.printer_serial)}
                <div class="mt-2 px-1">
                  <div class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1 overflow-hidden">
                    <div class="bg-amber-400 h-full rounded-full progress-shimmer w-full opacity-70"></div>
                  </div>
                  <p class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-zinc-400 dark:text-zinc-500 mt-1">
                    {qPos === 0 ? 'Sending to printer…' : 'In queue…'}
                  </p>
                </div>
              {:else if liveIsPrinting || printer.status === 'printing'}
                {@const activePrint = getActivePrintJob(Number(printer.id))}
                {#if activePrint}
                  {@const progress = piLive ? piLive.progress : getProgress(Number(activePrint.start_time), Number(activePrint.expected_time))}
                  <div class="mt-2 px-1">
                    <div class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1 overflow-hidden">
                      <div
                        class="{progress >= 100 ? 'bg-violet-500' : 'bg-blue-500'} h-full rounded-full transition-all duration-500 progress-shimmer"
                        style="width: {Math.min(progress, 100)}%"
                      ></div>
                    </div>
                    <p class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-zinc-400 dark:text-zinc-500 mt-1 tabular-nums">
                      {#if piLive}{piLive.label}{:else}{progress}%{/if}
                    </p>
                  </div>
                {:else if piLive}
                  <!-- External / un-reconciled print: show whatever Pi gives us -->
                  <div class="mt-2 px-1">
                    {#if piLive.subtask_name}
                      <p class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-zinc-500 dark:text-zinc-400 truncate mb-1">{piLive.subtask_name}</p>
                    {/if}
                    <div class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1 overflow-hidden">
                      <div class="bg-blue-500 h-full rounded-full transition-all duration-500 progress-shimmer" style="width: {Math.min(piLive.progress, 100)}%"></div>
                    </div>
                    <p class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-zinc-400 dark:text-zinc-500 mt-1 tabular-nums">{piLive.label}</p>
                  </div>
                {/if}
              {/if}
            </div>
          </button>
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

      {:else if cell.type === 'storage'}
        <!-- Storage Card -->
        <a
          use:shine
          href="/storage"
          class="group bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
        >
          <div class="group-hover:scale-110 transition-transform duration-500 ease-out">
            <svg class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
          </div>
          <h3 class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight">Storage</h3>
          <p class="text-[clamp(0.4rem,1.3vw,0.65rem)] text-zinc-400 dark:text-zinc-600 font-light tracking-wide">Inventory</p>
        </a>

      {:else if cell.type === 'spools'}
        <!-- Materials/Spools Card -->
        <a
          use:shine
          href="/spools"
          class="group bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
                 rounded-xl p-2 card-lift card-shine
                 flex flex-col items-center justify-center overflow-hidden"
        >
          <div class="group-hover:scale-110 transition-transform duration-500 ease-out">
            <svg class="w-[clamp(1.5rem,4vw,2.5rem)] h-[clamp(1.5rem,4vw,2.5rem)] text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125V11.25a1.5 1.5 0 0 1-1.5 1.5H6.75" />
            </svg>
          </div>
          <h3 class="text-[clamp(0.5rem,2vw,0.8rem)] font-medium text-zinc-900 dark:text-zinc-200 mt-2 tracking-tight">Materials</h3>
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

  <!-- Grid Navigation Indicators -->
  {#if allGrids.length > 1}
    <div class="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2">
      <!-- Left Arrow -->
      <button
        onclick={prevGrid}
        disabled={currentGridIndex === 0}
        class="p-1.5 rounded-full text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-300 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        aria-label="Previous grid"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
      </button>

      <!-- Dots -->
      <div class="flex items-center gap-1.5">
        {#each allGrids as grid, i}
          <button
            onclick={() => goToGrid(i)}
            class="w-1.5 h-1.5 rounded-full transition-all duration-300 {i === currentGridIndex ? 'bg-zinc-500 scale-125' : 'bg-zinc-200 dark:bg-[#262626] hover:bg-zinc-300 dark:hover:bg-zinc-600'}"
            aria-label="Go to grid {grid.name}"
          ></button>
        {/each}
      </div>

      <!-- Right Arrow -->
      <button
        onclick={nextGrid}
        disabled={currentGridIndex === allGrids.length - 1}
        class="p-1.5 rounded-full text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-300 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        aria-label="Next grid"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </button>
    </div>
  {/if}
</div>

<!-- Printer Detail Modal -->
<!-- ── Quick Start Modal ─────────────────────────────────────────────────── -->
{#if selectedPrinter && showQuickStart && !showSpoolSelector && !showModuleSelector}
  {@const loadedSpool = getLoadedSpool(selectedPrinter.loaded_spool_id)}
  {@const nextPrint = !quickStartLoading && selectedPrinter.suggested_queue ? (selectedPrinter.suggested_queue as any[]).find((i: any) => i.status !== 'DONE') : null}
  {@const nextModule = nextPrint ? (data.printModules as any[]).find((m: any) => m.id === nextPrint.module_id) : null}

  <div
    class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6 cursor-default"
    onclick={closePrinterModal}
    onkeydown={(e) => e.key === 'Escape' && closePrinterModal()}
    role="button" tabindex="0" aria-label="Close modal (press Escape)"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal-panel bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-2xl max-w-md w-full shadow-2xl shadow-black/20"
      onclick={(e) => e.stopPropagation()}
      role="dialog" aria-modal="true"
    >
      <div class="p-8">
        <!-- Header -->
        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">{selectedPrinter.name}</h2>
            <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-1 uppercase tracking-widest">Quick Start</p>
          </div>
          <button
            onclick={closePrinterModal}
            class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
            aria-label="Close modal"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {#if quickStartLoading}
          <!-- Loading spinner -->
          <div class="flex flex-col items-center justify-center py-12 gap-4">
            <svg class="w-8 h-8 text-zinc-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <p class="text-sm text-zinc-400">Finding recommended print…</p>
          </div>

        {:else if !loadedSpool}
          <!-- No spool loaded -->
          <div class="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 mb-6">
            <p class="text-sm font-medium text-amber-600 dark:text-amber-400">No spool loaded</p>
            <p class="text-xs text-zinc-400 mt-1">Load a spool before starting a print.</p>
          </div>
          <button
            onclick={() => { showQuickStart = false; handleLoadSpool(); }}
            class="w-full py-3.5 rounded-xl bg-blue-500/8 hover:bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium border border-blue-500/10 hover:border-blue-500/20 transition-all"
          >
            Load Spool
          </button>

        {:else if nextPrint && nextModule}
          <!-- Spool info -->
          <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-4 border border-zinc-100 dark:border-[#1a1a22] mb-4">
            <p class="text-[10px] uppercase tracking-widest text-zinc-400 mb-2">Loaded Spool</p>
            <div class="flex items-center gap-3">
              <div class="w-3 h-3 rounded-full shrink-0" style="background-color: {loadedSpool.color ?? '#888'}"></div>
              <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100">{loadedSpool.brand} {loadedSpool.material}</span>
              <span class="ml-auto text-xs text-zinc-400 tabular-nums">{loadedSpool.remaining_weight}g left</span>
            </div>
          </div>

          <!-- Next print card (big start button) -->
          <button
            type="button"
            disabled={startingSerials.has(selectedPrinter?.printer_serial)}
            onclick={() => enqueueStart(nextModule, selectedPrinter)}
            class="w-full text-left bg-emerald-500/5 border-2 border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/40 rounded-2xl p-6 mb-4 transition-all duration-200 disabled:opacity-50 group"
          >
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 flex items-center justify-center shrink-0 transition-colors">
                <svg class="w-6 h-6 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[10px] uppercase tracking-widest text-zinc-400 mb-1">
                  {startingSerials.has(selectedPrinter?.printer_serial) ? 'Starting…' : 'Start Next Print'}
                </p>
                <p class="text-lg font-medium text-zinc-900 dark:text-zinc-50 leading-snug truncate">{nextPrint.module_name}</p>
                <div class="flex items-center gap-2 mt-1.5">
                  <span class="text-xs text-zinc-400 tabular-nums">{nextPrint.weight_of_print}g</span>
                  {#if nextPrint.priority}
                    <span class="text-xs px-1.5 py-0.5 rounded-full {nextPrint.priority === 'CRITICAL' ? 'bg-red-500/10 text-red-500' : nextPrint.priority === 'HIGH' ? 'bg-orange-500/10 text-orange-500' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}">{nextPrint.priority}</span>
                  {/if}
                </div>
              </div>
            </div>
          </button>

        {:else}
          <!-- No recommended print available -->
          <div class="text-center py-10">
            <p class="text-sm text-zinc-400">No recommended prints available.</p>
            <p class="text-xs text-zinc-500 mt-1">Add inventory items and spool presets to get recommendations.</p>
          </div>
        {/if}

        <!-- Manual mode link -->
        <button
          type="button"
          onclick={() => { showQuickStart = false; }}
          class="w-full text-center text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors py-1 mt-1"
        >
          Manual mode →
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Printer Modal ──────────────────────────────────────────────────────── -->
{#if selectedPrinter && !showSpoolSelector && !showModuleSelector && !showQuickStart}
  {@const activePrintJob = getActivePrintJob(selectedPrinter.id)}
  {@const loadedSpool = getLoadedSpool(selectedPrinter.loaded_spool_id)}

  <div
    class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6 border-0 cursor-default"
    onclick={closePrinterModal}
    onkeydown={(e) => e.key === 'Escape' && closePrinterModal()}
    role="button"
    tabindex="0"
    aria-label="Close modal (press Escape)"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal-panel bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/20"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div class="p-8">
        <!-- Modal Header -->
        <div class="flex justify-between items-start mb-8">
          <div>
            <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">{selectedPrinter.name}</h2>
            <p class="text-sm text-zinc-400 dark:text-zinc-600 mt-1 tracking-wide">{selectedPrinter.model}</p>
          </div>
          <button
            onclick={closePrinterModal}
            class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
            aria-label="Close modal"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Status Badge -->
        <div class="mb-8">
          {#if selectedPrinter.status === 'printing'}
            <span class="inline-flex items-center gap-2.5 px-4 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-sm font-light tracking-wide">
              <div class="w-2 h-2 bg-blue-500 rounded-full status-glow-blue"></div>
              Printing
            </span>
          {:else if selectedPrinter.status === 'IDLE'}
            <span class="inline-flex items-center gap-2.5 px-4 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full text-sm font-light tracking-wide">
              <div class="w-2 h-2 bg-emerald-500 rounded-full status-glow-green"></div>
              Idle
            </span>
          {:else if selectedPrinter.status === 'BROKEN'}
            <span class="inline-flex items-center gap-2.5 px-4 py-1.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded-full text-sm font-light tracking-wide">
              <div class="w-2 h-2 bg-red-500 rounded-full status-glow-red animate-pulse"></div>
              Broken / Under Repair
            </span>
          {/if}
        </div>

        <!-- Conditional Content Based on Status -->
        {#if selectedPrinter.status === 'printing' && activePrintJob}
          <!-- PRINTING STATUS MENU -->
          {@const piLive = piStatusBySerial[selectedPrinter.printer_serial]}
          {@const displayProgress = piLive?.progress ?? (activePrintJob.progress > 0 ? activePrintJob.progress : getProgress(activePrintJob.start_time, activePrintJob.expected_time))}
          <div class="space-y-5">
            <!-- Module Name -->
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
              <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1.5 tracking-wide uppercase">Print Module</p>
              <p class="text-xl text-zinc-900 dark:text-zinc-50 font-light tracking-tight">{activePrintJob.module_name}</p>
              {#if piLive}
                <p class="text-xs text-blue-500 mt-1">{piLive.label}</p>
              {/if}
            </div>

            <!-- Print Progress -->
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
              <div class="flex justify-between text-sm mb-3">
                <span class="text-zinc-400 dark:text-zinc-600 tracking-wide">Progress</span>
                <span class="text-zinc-900 dark:text-zinc-50 font-medium tabular-nums">{displayProgress}%</span>
              </div>
              <div class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  class="bg-blue-500 h-full rounded-full transition-all duration-500 progress-shimmer"
                  style="width: {displayProgress}%"
                ></div>
              </div>
              <div class="flex justify-between text-xs text-zinc-400 dark:text-zinc-600 mt-3 tabular-nums">
                <span>{getElapsedTime(activePrintJob.start_time)} elapsed</span>
                {#if piLive?.total_layer_num > 0}
                  <span>Layer {piLive.layer_num} / {piLive.total_layer_num}</span>
                {:else}
                  <span>{getRemainingTime(activePrintJob.start_time, activePrintJob.expected_time)} remaining</span>
                {/if}
              </div>
            </div>

            <!-- Live Temps + Remaining Time (from Pi) -->
            {#if piLive && (piLive.remaining_time != null || piLive.nozzle_temp != null)}
              <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-4 border border-zinc-100 dark:border-[#1a1a22]">
                <div class="flex flex-wrap gap-5">
                  {#if piLive.remaining_time != null && piLive.remaining_time > 0}
                    <div>
                      <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase">Remaining</p>
                      <p class="text-base text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{formatRemainingTime(piLive.remaining_time)}</p>
                    </div>
                  {/if}
                  {#if piLive.nozzle_temp != null}
                    <div>
                      <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase">Nozzle</p>
                      <p class="text-base text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{Math.round(piLive.nozzle_temp)}°C</p>
                    </div>
                  {/if}
                  {#if piLive.bed_temp != null}
                    <div>
                      <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase">Bed</p>
                      <p class="text-base text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{Math.round(piLive.bed_temp)}°C</p>
                    </div>
                  {/if}
                  {#if piLive.chamber_temp != null}
                    <div>
                      <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase">Chamber</p>
                      <p class="text-base text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{Math.round(piLive.chamber_temp)}°C</p>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            <!-- Time Info -->
            <div class="grid grid-cols-2 gap-4">
              <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-4 border border-zinc-100 dark:border-[#1a1a22]">
                <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1.5 tracking-wide uppercase">Total Time</p>
                <p class="text-lg text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{formatTime(activePrintJob.expected_time)}</p>
              </div>
              <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-4 border border-zinc-100 dark:border-[#1a1a22]">
                <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1.5 tracking-wide uppercase">Remaining</p>
                <p class="text-lg text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{getRemainingTime(activePrintJob.start_time, activePrintJob.expected_time)}</p>
              </div>
            </div>

            <!-- Spool Weight Info -->
            {#if loadedSpool}
              <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
                <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-4 tracking-wide uppercase">Spool Weight</p>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1">Before Print</p>
                    <p class="text-xl text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{loadedSpool.remaining_weight}g</p>
                  </div>
                  <div>
                    <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1">Expected After</p>
                    <p class="text-xl text-blue-500 dark:text-blue-400 font-light tabular-nums">{Math.max(0, loadedSpool.remaining_weight - activePrintJob.expected_weight).toFixed(1)}g</p>
                  </div>
                </div>
                <div class="mt-4 pt-4 border-t border-zinc-200/60 dark:border-[#1a1a22]">
                  <div class="flex justify-between text-xs">
                    <span class="text-zinc-400 dark:text-zinc-600">Material Usage</span>
                    <span class="text-amber-500 font-medium tabular-nums">{activePrintJob.expected_weight}g</span>
                  </div>
                </div>
              </div>
            {:else}
              <div class="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                <p class="text-sm text-red-500 dark:text-red-400 font-light">No spool loaded</p>
              </div>
            {/if}

            <!-- Pi Controls (Cancel / Pause / Resume) — only if printer has Pi credentials -->
            {#if selectedPrinter?.printer_ip && selectedPrinter?.printer_serial && selectedPrinter?.printer_access_code}
              <div class="grid grid-cols-2 gap-3 pt-1">
                <button
                  disabled={!!controlLoading}
                  onclick={async () => { await sendPrinterControl('cancel', selectedPrinter.id); }}
                  class="bg-red-500/8 hover:bg-red-500/15 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl transition-all duration-200 font-medium border border-red-500/10 hover:border-red-500/20 text-sm disabled:opacity-50"
                >
                  {controlLoading === 'cancel' ? 'Cancelling…' : 'Cancel Print'}
                </button>
                {#if piLive?.gcode_state === 'PAUSE'}
                  <button
                    disabled={!!controlLoading}
                    onclick={async () => { await sendPrinterControl('resume', selectedPrinter.id); }}
                    class="bg-blue-500/8 hover:bg-blue-500/15 text-blue-600 dark:text-blue-400 px-4 py-3 rounded-xl transition-all duration-200 font-medium border border-blue-500/10 hover:border-blue-500/20 text-sm disabled:opacity-50"
                  >
                    {controlLoading === 'resume' ? 'Resuming…' : 'Resume'}
                  </button>
                {:else}
                  <button
                    disabled={!!controlLoading}
                    onclick={async () => { await sendPrinterControl('pause', selectedPrinter.id); }}
                    class="bg-amber-500/8 hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 px-4 py-3 rounded-xl transition-all duration-200 font-medium border border-amber-500/10 hover:border-amber-500/20 text-sm disabled:opacity-50"
                  >
                    {controlLoading === 'pause' ? 'Pausing…' : 'Pause'}
                  </button>
                {/if}
              </div>
            {/if}

            <!-- Manual Override Buttons -->
            <div class="grid grid-cols-2 gap-4 pt-3">
               <button
                onclick={handlePrintFailed}
                class="w-full bg-red-500/8 hover:bg-red-500/15 text-red-600 dark:text-red-400 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium border border-red-500/10 hover:border-red-500/20"
              >
                Print Failed
              </button>

			<form
                method="POST"
                action="?/completePrint"
                use:enhance={() => {
                  return async ({ result }) => {
                    if (result.type === 'success') {
                      // Only regenerate AI queue if the finished job's module isn't already in the suggested queue
                      try {
                         const finishedModuleId = activePrintJob?.module_id;
						const queue = selectedPrinter?.suggested_queue;

						// Consider "inQueue" true only if there is a matching queue item that is NOT DONE.
						// If matching items exist but all are DONE, we treat it as not in queue (so we regenerate).
						const inQueue = Array.isArray(queue) && finishedModuleId != null
							? queue.some(item => item.module_id === finishedModuleId && item.status !== 'DONE')
							: false;

						if (!inQueue && selectedPrinter?.id) {
							const resp = await fetch(`/api/ai-recommendations?type=queue&printerId=${selectedPrinter.id}`);
							const queueResult = await resp.json();
							if (queueResult && Array.isArray(queueResult)) {
							selectedPrinter.suggested_queue = queueResult;
							}
						}
                      } catch (e) {
                        console.error('Failed to refresh suggested queue:', e);
                      }

                      sessionStorage.setItem('printSuccessAnim', JSON.stringify({
                        imagePath: activePrintJob?.module_image_path ?? null,
                      }));
                      closePrinterModal();
                      window.location.reload();
                    }
                  };
                }}
              >
                <input type="hidden" name="jobId" value={activePrintJob.id} />
                <input type="hidden" name="success" value="true" />
                <input type="hidden" name="actualWeight" value={activePrintJob.expected_weight} />

                <button
                  type="submit"
                  class="w-full bg-emerald-500/8 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium border border-emerald-500/10 hover:border-emerald-500/20"
                >
                  Print Successful
                </button>
              	</form>


            </div>
          </div>

        {:else if selectedPrinter.status === 'IDLE'}
          <!-- IDLE STATUS MENU -->
          {@const lastPrintJob = getLastPrintJob(selectedPrinter.id)}
          <div class="space-y-5">

            <!-- Loaded Spool Info -->
            {#if loadedSpool}
              <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
                <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-4 tracking-wide uppercase">Loaded Spool</p>
                <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <span class="text-sm text-zinc-400 dark:text-zinc-600">Name</span>
                    <span class="text-base text-zinc-900 dark:text-zinc-100 font-medium">
                      {loadedSpool.brand} {loadedSpool.material}
                    </span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-sm text-zinc-400 dark:text-zinc-600">Color</span>
                    <span class="text-base text-zinc-900 dark:text-zinc-100">{loadedSpool.color || 'N/A'}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-sm text-zinc-400 dark:text-zinc-600">Remaining Weight</span>
                    <span class="text-lg text-emerald-500 dark:text-emerald-400 font-medium tabular-nums">{loadedSpool.remaining_weight}g</span>
                  </div>
                </div>
              </div>
            {:else}
              <div class="bg-amber-500/5 border border-amber-500/10 rounded-xl p-5">
                <p class="text-sm text-amber-600 dark:text-amber-400 font-light">No spool loaded</p>
                <p class="text-xs text-zinc-400 dark:text-zinc-600 mt-1">Load a spool to start printing</p>
              </div>
            {/if}

            <!-- Last Print Info -->
            {#if lastPrintJob}
              <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
                <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-3 tracking-wide uppercase">Last Printed Module</p>
                <div class="flex justify-between items-center">
                  <span class="text-base text-zinc-900 dark:text-zinc-100 font-medium">{lastPrintJob.module_name || 'Unknown'}</span>
                  {#if lastPrintJob.status == 'success'}
                    <span class="inline-flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400 text-xs font-medium">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                      Success
                    </span>
                  {:else}
                    <span class="inline-flex items-center gap-1.5 text-red-500 dark:text-red-400 text-xs font-medium">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                      Failed
                    </span>
                  {/if}
                </div>
                {#if lastPrintJob.status !== 'success' && lastPrintJob.failure_reason}
                  <p class="text-xs text-red-500/70 dark:text-red-400/60 mt-3 pt-3 border-t border-zinc-200/60 dark:border-[#1a1a22]">
                    {lastPrintJob.failure_reason}
                  </p>
                {/if}
              </div>
            {:else}
              <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
                <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-3 tracking-wide uppercase">Last Printed Module</p>
                <p class="text-sm text-zinc-400 dark:text-zinc-600">No previous prints</p>
              </div>
            {/if}

            <!-- Printer Stats -->
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
              <div class="flex justify-between items-center">
                <span class="text-sm text-zinc-400 dark:text-zinc-600">Total Runtime</span>
                <span class="text-zinc-900 dark:text-zinc-100 text-sm font-medium tabular-nums">{selectedPrinter.total_hours.toFixed(1)}h</span>
              </div>
            </div>

			<!-- Next Suggested Print -->
			{#if selectedPrinter?.suggested_queue}
  {@const nextPrint = selectedPrinter.suggested_queue.find(item => item.status !== 'DONE')}
  {#if nextPrint}
    {@const allModules = data.printModules}
    {@const matchingModule = allModules.find(m => m.id === nextPrint.module_id)}
    <button
      type="button"
      disabled={startingSerials.has(selectedPrinter?.printer_serial)}
      onclick={() => matchingModule && enqueueStart(matchingModule, selectedPrinter)}
      class="w-full text-left bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-5 mt-4 hover:bg-emerald-500/10 hover:border-emerald-500/25 transition-all duration-200 disabled:opacity-50"
    >
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
          </div>
          <div>
            <div class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase">Next Suggested Print</div>
            <div class="text-base text-zinc-900 dark:text-zinc-100 font-medium">{nextPrint.module_name}</div>
            <div class="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 tabular-nums">
              {nextPrint.weight_of_print}g · {nextPrint.priority}
            </div>
          </div>
        </div>
      </button>
  {/if}
{/if}
            <!-- Action Buttons -->
            <div class="grid grid-cols-2 gap-4 pt-4">
              <button
                onclick={handleLoadSpool}
                class="bg-blue-500/8 hover:bg-blue-500/15 text-blue-600 dark:text-blue-400 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium border border-blue-500/10 hover:border-blue-500/20"
              >
                Load Spool
              </button>
              <button
                onclick={handleStartPrint}
                class="bg-emerald-500/8 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium border border-emerald-500/10 hover:border-emerald-500/20"
              >
                Start Print
              </button>
            </div>
            <button
              disabled={controlLoading === 'marking-broken'}
              onclick={() => togglePrinterBroken(selectedPrinter, true)}
              class="w-full bg-red-500/5 hover:bg-red-500/10 text-red-500/70 dark:text-red-400/60 hover:text-red-600 dark:hover:text-red-400 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm border border-red-500/8 hover:border-red-500/15 disabled:opacity-50"
            >
              {controlLoading === 'marking-broken' ? 'Marking as broken…' : 'Mark as Broken'}
            </button>
          </div>

        {:else if selectedPrinter.status === 'BROKEN'}
          <!-- BROKEN STATUS MENU -->
          <div class="space-y-5">
            <div class="bg-red-500/5 border border-red-500/15 rounded-xl p-5">
              <p class="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Printer is under repair</p>
              <p class="text-xs text-zinc-400 dark:text-zinc-600">Downtime is being tracked from when this printer was marked broken. Mark as repaired to stop the downtime clock.</p>
            </div>
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
              <div class="flex justify-between items-center">
                <span class="text-sm text-zinc-400 dark:text-zinc-600">Total Runtime</span>
                <span class="text-zinc-900 dark:text-zinc-100 text-sm font-medium tabular-nums">{selectedPrinter.total_hours.toFixed(1)}h</span>
              </div>
            </div>
            <button
              disabled={controlLoading === 'marking-repaired'}
              onclick={() => togglePrinterBroken(selectedPrinter, false)}
              class="w-full bg-emerald-500/8 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium border border-emerald-500/10 hover:border-emerald-500/20 disabled:opacity-50"
            >
              {controlLoading === 'marking-repaired' ? 'Marking as repaired…' : 'Mark as Repaired'}
            </button>
          </div>

        {:else}
          <!-- Fallback for other statuses -->
          <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22] text-center">
            <p class="text-zinc-400 dark:text-zinc-600">Status: {selectedPrinter.status}</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Spool Selector Modal - UPDATED with sticky footer -->
{#if selectedPrinter && showSpoolSelector}
  <div
    class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6"
    onclick={closeSpoolSelector}
    onkeydown={(e) => e.key === 'Escape' && closeSpoolSelector()}
    role="button"
    tabindex="0"
    aria-label="Close spool selector"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal-panel bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl shadow-black/20"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <!-- Scrollable Content Area -->
      <div class="overflow-y-auto flex-1">
        <div class="p-8">
          <!-- Header -->
          <div class="flex justify-between items-start mb-8">
            <div>
              <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">Load Spool</h2>
              <p class="text-sm text-zinc-400 dark:text-zinc-600 mt-1 tracking-wide">Select a spool preset for {selectedPrinter.name}</p>
            </div>
            <button
              onclick={closeSpoolSelector}
              class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
              aria-label="Close spool selector"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Spool Presets Grid (suggested ones first, in priority order) -->
          {#if orderedSpoolPresets.length > 0}
            <div class="grid grid-cols-2 gap-4">
              {#each orderedSpoolPresets as { preset, suggestion } (preset.id)}
                <button
                  type="button"
                  onclick={() => selectSpoolPreset(preset.id)}
                  class="text-left bg-zinc-50 dark:bg-[#111114] hover:bg-zinc-100 dark:hover:bg-[#151518] border-2 rounded-xl p-5 transition-all duration-200
                         {selectedPresetId === preset.id ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/5' : 'border-transparent'}"
                >
                  <div class="flex items-start justify-between mb-3">
                    <h3 class="text-base font-medium text-zinc-900 dark:text-zinc-100">{preset.name}</h3>
                    {#if selectedPresetId === preset.id}
                      <div class="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    {/if}
                  </div>
                  <div class="space-y-1.5 text-sm">
                    <p class="text-zinc-400 dark:text-zinc-500">{preset.brand} · {preset.material}</p>
                    <p class="{(preset.storage_count || 0) === 0 ? 'text-red-500 dark:text-red-400' : (preset.storage_count || 0) <= 2 ? 'text-amber-500 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'}">
                      Stock: {preset.storage_count || 0}
                    </p>
                    <div class="flex justify-between items-center mt-3 pt-3 border-t border-zinc-200/60 dark:border-[#1a1a22]">
                      <span class="text-zinc-400 dark:text-zinc-600">Weight</span>
                      <span class="text-zinc-900 dark:text-zinc-100 font-medium tabular-nums">{preset.default_weight}g</span>
                    </div>
                    {#if preset.cost}
                      <div class="flex justify-between items-center">
                        <span class="text-zinc-400 dark:text-zinc-600">Cost</span>
                        <span class="text-emerald-500 dark:text-emerald-400 tabular-nums">${preset.cost.toFixed(2)}</span>
                      </div>
                    {/if}
                    {#if suggestion?.reason}
                      <div class="text-xs text-zinc-400 dark:text-zinc-600 mt-3 pt-3 border-t border-zinc-200/60 dark:border-[#1a1a22]">{suggestion.reason}</div>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          {:else}
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-10 text-center border border-zinc-100 dark:border-[#1a1a22]">
              <p class="text-zinc-400 dark:text-zinc-600 mb-4">No spool presets available</p>
              <a
                href="/settings"
                class="inline-block bg-blue-500/8 hover:bg-blue-500/15 text-blue-600 dark:text-blue-400 px-5 py-2.5 rounded-xl transition-all duration-200 border border-blue-500/10 hover:border-blue-500/20 font-medium text-sm"
              >
                Create Spool Preset
              </a>
            </div>
          {/if}
        </div>
      </div>

      <!-- Sticky Footer -->
      <div class="sticky bottom-0 bg-white/80 dark:bg-[#0c0c0f]/80 backdrop-blur-xl border-t border-zinc-200/60 dark:border-[#1a1a22] p-6">
        <div class="flex gap-4">
          <button
            type="button"
            onclick={closeSpoolSelector}
            class="flex-1 bg-transparent border border-zinc-200/80 dark:border-[#1a1a22] hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 px-4 py-3.5 rounded-xl transition-all duration-200"
          >
            Cancel
          </button>
          <form
            method="POST"
            action="?/loadSpool"
            class="flex-1"
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === 'success') {
				const response = await fetch(`/api/ai-recommendations?type=queue&printerId=${selectedPrinter.id}`);
				const queueResult = await response.json();
				if (queueResult && Array.isArray(queueResult)) {
				selectedPrinter.suggested_queue = queueResult;
				}
                  closePrinterModal();
                  window.location.reload();
                }
              };
            }}
          >
            <input type="hidden" name="printerId" value={selectedPrinter.id} />
            {#if selectedPresetId}
              {@const selectedPreset = data.spoolPresets.find(p => p.id === selectedPresetId)}
              {#if selectedPreset}
                <input type="hidden" name="presetId" value={selectedPreset.id} />
                <input type="hidden" name="brand" value={selectedPreset.brand} />
                <input type="hidden" name="material" value={selectedPreset.material} />
                <input type="hidden" name="color" value={selectedPreset.color || ''} />
                <input type="hidden" name="initialWeight" value={selectedPreset.default_weight} />
                <input type="hidden" name="remainingWeight" value={selectedPreset.default_weight} />
                <input type="hidden" name="cost" value={selectedPreset.cost || ''} />
              {/if}
            {/if}
            <button
              type="submit"
              disabled={!selectedPresetId}
              class="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium
                     disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Load Selected Spool
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Module Selector Modal -->
{#if selectedPrinter && showModuleSelector}
  {@const categorizedModules = getCategorizedModules()}
  {@const loadedSpool = getLoadedSpool(selectedPrinter.loaded_spool_id)}
  {@const totalPrintable = categorizedModules.compatiblePrintable.length + categorizedModules.anySpoolPrintable.length}

  <div
    class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6"
    onclick={closeModuleSelector}
    onkeydown={(e) => e.key === 'Escape' && closeModuleSelector()}
    role="button"
    tabindex="0"
    aria-label="Close module selector"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal-panel bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-2xl max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl shadow-black/20"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <!-- Scrollable Content Area -->
      <div class="overflow-y-auto flex-1">
        <div class="p-8">
          <!-- Header -->
          <div class="flex justify-between items-start mb-8">
            <div>
              <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">Start Print</h2>
              <p class="text-sm text-zinc-400 dark:text-zinc-600 mt-1 tracking-wide">Select a module for {selectedPrinter.name}</p>
              {#if loadedSpool}
                {@const loadedPreset = data.spoolPresets.find(p => p.id === loadedSpool.preset_id)}
                <p class="text-xs text-zinc-400 dark:text-zinc-600 mt-2">
                  Using: {loadedSpool.brand} {loadedSpool.material} - {loadedSpool.color} ({loadedSpool.remaining_weight}g)
                  {#if loadedPreset}
                    <span class="text-blue-500 dark:text-blue-400 ml-1">(Preset: {loadedPreset.name})</span>
                  {/if}
                </p>
              {/if}
            </div>
            <button
              onclick={closeModuleSelector}
              class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
              aria-label="Close module selector"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
            </button>
          </div>

          {#if selectedPrinter?.suggested_queue && selectedPrinter.suggested_queue.length > 0}
  <div class="mb-8 bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-5">
    <div class="flex items-start gap-4">
      <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      </div>
      <div class="flex-1">
        <h3 class="text-zinc-900 dark:text-zinc-100 font-medium mb-3 text-sm tracking-wide">
          Saved Print Queue
        </h3>
        <div class="space-y-2">
          {#each selectedPrinter.suggested_queue as item, i}
            <div class="flex items-center justify-between text-sm">
              <span class="text-zinc-700 dark:text-zinc-300">
                {i + 1}. {item.module_name}
                {#if item.status === 'DONE'}
                  <span class="ml-2 text-green-600 dark:text-green-400 text-xs">✓ Done</span>
                {/if}
              </span>
              <span class="text-zinc-500">
                {item.weight_of_print}g ({item.priority})
              </span>
            </div>
          {/each}
        </div>
        <!-- Waste/leftover display -->
        {#if selectedPrinter.suggested_queue.length > 0 && loadedSpool}
          {@const lastPrint = selectedPrinter.suggested_queue[selectedPrinter.suggested_queue.length - 1]}
          <div class="mt-4 text-xs text-zinc-500">
            <span>
              Waste after queue:
              <span class="text-orange-400 font-medium">
                {lastPrint.spool_weight_after_print}g
              </span>
              / Start: {loadedSpool.remaining_weight}g
            </span>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}



          <!-- Module Categories -->
          <div class="space-y-6">

            <!-- Category 1: Compatible & Printable (PRIORITY) -->
            {#if categorizedModules.compatiblePrintable.length > 0}
              <div>
                <div class="flex items-center gap-2 mb-3">
                  <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                  <h3 class="text-sm font-medium text-green-600 dark:text-green-400">
                    Recommended for this Spool ({categorizedModules.compatiblePrintable.length})
                  </h3>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  {#each categorizedModules.compatiblePrintable as module}
                    {@const modulePreset = module.default_spool_preset_id ? data.spoolPresets.find(p => p.id === module.default_spool_preset_id) : null}
                    <button
                      type="button"
                      onclick={() => selectModule(module.id)}
                      class="text-left bg-zinc-50 dark:bg-[#111114] border-2 rounded-xl p-4 transition-all duration-200 hover:bg-zinc-100 dark:hover:bg-[#151518] cursor-pointer
                             {selectedModuleId === module.id ? 'border-green-500 bg-zinc-100 dark:bg-zinc-800' : 'border-transparent'}"
                    >
                      <!-- Module card content -->
                      {#if module.image_path}
                        <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                          <img
                            src={module.image_path}
                            alt={module.name}
                            class="max-w-full max-h-full object-contain"
                          />
                        </div>
                      {:else}
                        <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                          <span class="text-3xl opacity-50">📦</span>
                        </div>
                      {/if}

                      <div class="flex items-start justify-between mb-1">
                        <h4 class="text-sm font-medium text-zinc-900 dark:text-zinc-50">{module.name}</h4>
                        {#if selectedModuleId === module.id}
                          <div class="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                            <svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        {/if}
                      </div>

                      <div class="space-y-0.5 text-xs">
                        {#if modulePreset}
                          <div class="flex justify-between items-center text-blue-600 dark:text-blue-400">
                            <span class="text-zinc-500">Preset:</span>
                            <span>{modulePreset.name}</span>
                          </div>
                        {/if}
                        <div class="flex justify-between items-center">
                          <span class="text-zinc-500">Weight:</span>
                          <span class="text-zinc-900 dark:text-zinc-50 font-medium">{module.expected_weight}g</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-zinc-500">Time:</span>
                          <span class="text-zinc-500">{formatTime(module.expected_time)}</span>
                        </div>
                        {#if loadedSpool}
                          <div class="flex justify-between items-center pt-1 border-t border-zinc-200/60 dark:border-[#1a1a22]">
                            <span class="text-zinc-500">After print:</span>
                            <span class="text-green-600 dark:text-green-400">{loadedSpool.remaining_weight - module.expected_weight}g</span>
                          </div>
                        {/if}
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Category 2: Compatible but Insufficient Material -->
            {#if categorizedModules.compatibleInsufficientMaterial.length > 0}
              <div>
                <div class="flex items-center gap-2 mb-3">
                  <div class="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <h3 class="text-sm font-medium text-orange-400">
                    Compatible - Needs More Material ({categorizedModules.compatibleInsufficientMaterial.length})
                  </h3>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  {#each categorizedModules.compatibleInsufficientMaterial as module}
                    {@const modulePreset = module.default_spool_preset_id ? data.spoolPresets.find(p => p.id === module.default_spool_preset_id) : null}
                    {@const shortfall = module.expected_weight - (loadedSpool?.remaining_weight || 0)}
                    <button
                      type="button"
                      onclick={() => selectModule(module.id)}
                      class="text-left bg-zinc-50 dark:bg-[#111114] border-2 rounded-xl p-4 transition-all duration-200 hover:bg-zinc-100 dark:hover:bg-[#151518] cursor-pointer
                             {selectedModuleId === module.id ? 'border-orange-500 bg-zinc-100 dark:bg-zinc-800' : 'border-transparent'}"
                    >
                      <!-- Module card content -->
                      {#if module.image_path}
                        <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                          <img
                            src={module.image_path}
                            alt={module.name}
                            class="max-w-full max-h-full object-contain opacity-60"
                          />
                        </div>
                      {:else}
                        <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                          <span class="text-3xl opacity-30">📦</span>
                        </div>
                      {/if}

                      <div class="flex items-start justify-between mb-1">
                        <h4 class="text-sm font-medium text-zinc-900 dark:text-zinc-50">{module.name}</h4>
                        {#if selectedModuleId === module.id}
                          <div class="w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                            <svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        {/if}
                      </div>

                      <div class="space-y-0.5 text-xs">
                        {#if modulePreset}
                          <div class="flex justify-between items-center text-blue-600 dark:text-blue-400">
                            <span class="text-zinc-500">Preset:</span>
                            <span>{modulePreset.name}</span>
                          </div>
                        {/if}
                        <div class="flex justify-between items-center">
                          <span class="text-zinc-500">Needs:</span>
                          <span class="text-zinc-900 dark:text-zinc-50 font-medium">{module.expected_weight}g</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-zinc-500">Short by:</span>
                          <span class="text-orange-400 font-medium">{shortfall}g</span>
                        </div>
                      </div>
                      <div class="mt-2 pt-2 border-t border-orange-500/20">
                        <p class="text-xs text-orange-400">⚠️ Not enough material</p>
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Category 3: Any Spool & Printable -->
            {#if categorizedModules.anySpoolPrintable.length > 0}
              <div>
                <div class="flex items-center gap-2 mb-3">
                  <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <h3 class="text-sm font-medium text-blue-600 dark:text-blue-400">
                    Universal Modules ({categorizedModules.anySpoolPrintable.length})
                  </h3>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  {#each categorizedModules.anySpoolPrintable as module}
                    <button
                      type="button"
                      onclick={() => selectModule(module.id)}
                      class="text-left bg-zinc-50 dark:bg-[#111114] border-2 rounded-xl p-4 transition-all duration-200 hover:bg-zinc-100 dark:hover:bg-[#151518] cursor-pointer
                             {selectedModuleId === module.id ? 'border-blue-500 bg-zinc-100 dark:bg-zinc-800' : 'border-transparent'}"
                    >
                      <!-- Module card content -->
                      {#if module.image_path}
                        <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                          <img
                            src={module.image_path}
                            alt={module.name}
                            class="max-w-full max-h-full object-contain"
                          />
                        </div>
                      {:else}
                        <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                          <span class="text-3xl opacity-50">📦</span>
                        </div>
                      {/if}

                      <div class="flex items-start justify-between mb-1">
                        <h4 class="text-sm font-medium text-zinc-900 dark:text-zinc-50">{module.name}</h4>
                        {#if selectedModuleId === module.id}
                          <div class="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                            <svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        {/if}
                      </div>

                      <div class="space-y-0.5 text-xs">
                        <div class="flex justify-between items-center text-zinc-500">
                          <span>Preset:</span>
                          <span class="text-zinc-500">Any</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-zinc-500">Weight:</span>
                          <span class="text-zinc-900 dark:text-zinc-50 font-medium">{module.expected_weight}g</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-zinc-500">Time:</span>
                          <span class="text-zinc-500">{formatTime(module.expected_time)}</span>
                        </div>
                        {#if loadedSpool}
                          <div class="flex justify-between items-center pt-1 border-t border-zinc-200/60 dark:border-[#1a1a22]">
                            <span class="text-zinc-500">After print:</span>
                            <span class="text-green-600 dark:text-green-400">{loadedSpool.remaining_weight - module.expected_weight}g</span>
                          </div>
                        {/if}
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Category 4: Any Spool but Insufficient Material -->
            {#if categorizedModules.anySpoolInsufficientMaterial.length > 0}
              <div>
                <div class="flex items-center gap-2 mb-3">
                  <div class="w-2 h-2 bg-zinc-500 rounded-full"></div>
                  <h3 class="text-sm font-medium text-zinc-500">
                    Universal - Needs More Material ({categorizedModules.anySpoolInsufficientMaterial.length})
                  </h3>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  {#each categorizedModules.anySpoolInsufficientMaterial as module}
                    {@const shortfall = module.expected_weight - (loadedSpool?.remaining_weight || 0)}
                    <div class="text-left bg-zinc-50/50 dark:bg-[#0c0c0f] border border-zinc-200/40 dark:border-[#1a1a22]/60 rounded-xl p-4 opacity-40 cursor-not-allowed">
                      <!-- Module card content -->
                      {#if module.image_path}
                        <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100/50 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                          <img
                            src={module.image_path}
                            alt={module.name}
                            class="max-w-full max-h-full object-contain opacity-40"
                          />
                        </div>
                      {:else}
                        <div class="mb-3 rounded-xl overflow-hidden bg-zinc-100/50 dark:bg-[#0c0c0f] aspect-square flex items-center justify-center">
                          <span class="text-3xl opacity-20">📦</span>
                        </div>
                      {/if}

                      <h4 class="text-sm font-medium text-zinc-900 dark:text-zinc-50 mb-1">{module.name}</h4>
                      <div class="space-y-0.5 text-xs">
                        <div class="flex justify-between items-center">
                          <span class="text-zinc-500">Needs:</span>
                          <span class="text-zinc-900 dark:text-zinc-50">{module.expected_weight}g</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-zinc-500">Short by:</span>
                          <span class="text-zinc-500">{shortfall}g</span>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- No modules message -->
            {#if totalPrintable === 0 && categorizedModules.compatibleInsufficientMaterial.length === 0}
              <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-10 text-center border border-zinc-100 dark:border-[#1a1a22]">
                <p class="text-zinc-500 mb-4">No compatible modules found</p>
                <a
                  href="/settings"
                  class="inline-block bg-blue-50 dark:bg-blue-950 hover:bg-blue-50 dark:hover:bg-blue-950 text-blue-700 dark:text-blue-400 px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  Create Print Module
                </a>
              </div>
            {/if}

          </div>
        </div>
      </div>

      <!-- Sticky Footer -->
      <div class="sticky bottom-0 bg-white/80 dark:bg-[#0c0c0f]/80 backdrop-blur-xl border-t border-zinc-200/60 dark:border-[#1a1a22] p-6">
        <div class="flex gap-4">
          <button
            type="button"
            onclick={closeModuleSelector}
            class="flex-1 bg-transparent border border-zinc-200/80 dark:border-[#1a1a22] hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 px-4 py-3.5 rounded-xl transition-all duration-200"
          >
            Cancel
          </button>
          <div class="flex-1">
            {#if selectedModuleId}
              {@const allModules = [
                ...categorizedModules.compatiblePrintable,
                ...categorizedModules.compatibleInsufficientMaterial,
                ...categorizedModules.anySpoolPrintable
              ]}
              {@const selectedModule = allModules.find(m => m.id === selectedModuleId)}
              <button
                type="button"
                disabled={startingSerials.has(selectedPrinter?.printer_serial)}
                onclick={() => selectedModule && enqueueStart(selectedModule, selectedPrinter)}
                class="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium disabled:opacity-50"
              >
                {#if selectedModule && loadedSpool && selectedModule.expected_weight > loadedSpool.remaining_weight}
                  Start Print (Low Material)
                {:else if selectedModule?.file_stored_on_pi && selectedPrinter?.printer_ip}
                  Start Print (Pi)
                {:else}
                  Start Print Job
                {/if}
              </button>
            {:else}
              <button
                type="button"
                disabled
                class="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-3.5 rounded-xl font-medium opacity-30 cursor-not-allowed"
              >
                Start Print Job
              </button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Failure Reason Modal -->
{#if selectedPrinter && showFailureReasonModal}
  {@const activePrintJob = getActivePrintJob(selectedPrinter.id)}
  {@const loadedSpool = getLoadedSpool(selectedPrinter.loaded_spool_id)}

  <div
    class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6"
    onclick={closeFailureReasonModal}
    onkeydown={(e) => e.key === 'Escape' && closeFailureReasonModal()}
    role="button"
    tabindex="0"
    aria-label="Close failure reason selector"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal-panel bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/20"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div class="p-8">
        <!-- Header -->
        <div class="flex justify-between items-start mb-8">
          <div>
            <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">Print Failed</h2>
            <p class="text-sm text-zinc-400 dark:text-zinc-600 mt-1 tracking-wide">What went wrong?</p>
          </div>
          <button
            onclick={closeFailureReasonModal}
            class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
            aria-label="Close failure reason selector"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Material Usage Decision -->
        {#if loadedSpool && activePrintJob}
          <div class="mb-8 bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
            <p class="text-sm text-zinc-400 dark:text-zinc-600 mb-4">Did the print consume material before failing?</p>
            <div class="grid grid-cols-2 gap-4">
              <button
                type="button"
                onclick={() => selectedFailureReason = 'deduct'}
                class="text-left bg-zinc-100 dark:bg-[#0c0c0f] hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50 border-2 rounded-xl p-4 transition-all duration-200
                       {selectedFailureReason === 'deduct' ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/5' : 'border-transparent'}"
              >
                <div class="flex items-start justify-between mb-2">
                  <span class="text-zinc-900 dark:text-zinc-100 text-sm font-medium">Yes, Material Used</span>
                  {#if selectedFailureReason === 'deduct'}
                    <div class="w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  {/if}
                </div>
                <p class="text-xs text-zinc-400 dark:text-zinc-600 tabular-nums">
                  Deduct {activePrintJob.expected_weight}g from spool
                </p>
              </button>

              <button
                type="button"
                onclick={() => selectedFailureReason = 'keep'}
                class="text-left bg-zinc-100 dark:bg-[#0c0c0f] hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50 border-2 rounded-xl p-4 transition-all duration-200
                       {selectedFailureReason === 'keep' ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/5' : 'border-transparent'}"
              >
                <div class="flex items-start justify-between mb-2">
                  <span class="text-zinc-900 dark:text-zinc-100 text-sm font-medium">No, Keep Weight</span>
                  {#if selectedFailureReason === 'keep'}
                    <div class="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  {/if}
                </div>
                <p class="text-xs text-zinc-400 dark:text-zinc-600 tabular-nums">
                  Spool stays at {loadedSpool.remaining_weight}g
                </p>
              </button>
            </div>
          </div>
        {/if}

        <!-- Failure Reasons List -->
        <div class="mb-6">
          <p class="text-sm text-zinc-400 dark:text-zinc-600 mb-4">What caused the failure?</p>
          <div class="space-y-2">
            {#each failureReasons as reason}
              <button
                type="button"
                onclick={() => {
                  if (reason === 'Custom') {
                    showCustomInput = true;
                    customFailureReason = '';
                  } else {
                    showCustomInput = false;
                    customFailureReason = reason;
                  }
                }}
                class="w-full text-left bg-zinc-50 dark:bg-[#111114] hover:bg-zinc-100 dark:hover:bg-[#151518] border-2 rounded-xl p-4 transition-all duration-200
                       {(customFailureReason === reason && !showCustomInput) || (reason === 'Custom' && showCustomInput) ? 'border-red-500 bg-red-500/5 dark:bg-red-500/5' : 'border-transparent'}"
              >
                <div class="flex items-center justify-between">
                  <span class="text-zinc-900 dark:text-zinc-100 text-sm">{reason}</span>
                  {#if (customFailureReason === reason && !showCustomInput) || (reason === 'Custom' && showCustomInput)}
                    <div class="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Custom input -->
        {#if showCustomInput}
          <div class="mb-8 p-5 bg-zinc-50 dark:bg-[#111114] rounded-xl border border-zinc-100 dark:border-[#1a1a22]">
            <label for="customReason" class="block text-sm text-zinc-400 dark:text-zinc-600 mb-2">
              Enter custom failure reason:
            </label>
            <!-- svelte-ignore a11y_autofocus -->
            <input
              id="customReason"
              type="text"
              bind:value={customFailureReason}
              placeholder="e.g., User cancelled, Testing issue..."
              class="w-full bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl px-4 py-3 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-zinc-100/20 transition-shadow"
              autofocus
            />
          </div>
        {/if}

        <!-- Action Buttons -->
        <div class="flex gap-4">
          <button
            type="button"
            onclick={closeFailureReasonModal}
            class="flex-1 bg-transparent border border-zinc-200/80 dark:border-[#1a1a22] hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 px-4 py-3.5 rounded-xl transition-all duration-200"
          >
            Cancel
          </button>
          <form
            method="POST"
            action="?/completePrint"
            class="flex-1"
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === 'success') {
				// Trigger queue generation after print failure
				const response = await fetch(`/api/ai-recommendations?type=queue&printerId=${selectedPrinter.id}`);
				const queueResult = await response.json();
				if (queueResult && Array.isArray(queueResult)) {
				selectedPrinter.suggested_queue = queueResult;
				}
                  closeFailureReasonModal();
                  closePrinterModal();
                  window.location.reload();
                }
              };
            }}
          >
            {#if activePrintJob}
              <input type="hidden" name="jobId" value={activePrintJob.id} />
              <input type="hidden" name="success" value="false" />

              <!-- Determine actual weight based on user choice -->
              {#if selectedFailureReason === 'deduct'}
                <input type="hidden" name="actualWeight" value={activePrintJob.expected_weight} />
              {:else}
                <input type="hidden" name="actualWeight" value="0" />
              {/if}

              <!-- Build failure reason string -->
              <input type="hidden" name="failureReason" value={customFailureReason || 'Unknown failure'} />
            {/if}

            <button
              type="submit"
              disabled={!selectedFailureReason || !customFailureReason}
              class="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-3.5 rounded-xl transition-all duration-200 font-medium
                     disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Confirm Print Failed
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Status Indicator (Top-right corner) -->
<div class="fixed top-8 right-8 lg:top-10 lg:right-10 z-50 flex flex-col gap-1.5 items-end">
  <!-- File Handler row -->
  <div class="flex items-center gap-2.5 bg-zinc-50/80 dark:bg-[#0c0c0f]/80 backdrop-blur-xl border border-zinc-200/60 dark:border-[#1a1a22] rounded-xl px-4 py-2 shadow-sm">
    {#if fileHandlerState.checking}
      <div class="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></div>
      <span class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide">Checking...</span>
    {:else if fileHandlerState.connected}
      <div class="w-2 h-2 rounded-full bg-emerald-400 status-glow-green"></div>
      <span class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide">File Handler Online</span>
    {:else if fileHandlerState.token}
      <div class="w-2 h-2 rounded-full bg-amber-400"></div>
      <span class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide">File Handler Offline</span>
    {:else}
      <div class="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
      <span class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide">Not Configured</span>
    {/if}
  </div>

  <!-- Transport mode row (desktop only) -->
  {#if $isDesktop}
    {@const directCount = directConnected.size}
    {@const totalWithSerial = (data.printers as any[]).filter((p: any) => p.printer_serial).length}
    <div class="flex items-center gap-2.5 bg-zinc-50/80 dark:bg-[#0c0c0f]/80 backdrop-blur-xl border border-zinc-200/60 dark:border-[#1a1a22] rounded-xl px-4 py-2 shadow-sm">
      {#if directCount > 0}
        <div class="w-2 h-2 rounded-full bg-violet-400 status-glow-violet"></div>
        <span class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide">
          {directCount}/{totalWithSerial} Direct
        </span>
      {:else}
        <div class="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
        <span class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide">Pi Only</span>
      {/if}
    </div>
  {/if}
</div>

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

<!-- ── Auto Queue Countdown Toast ───────────────────────────────────────── -->
{#if autoQueueCountdown}
  <div class="fixed bottom-6 right-6 z-[60] bg-zinc-900 dark:bg-[#111] border border-zinc-700 dark:border-[#2a2a2a] rounded-2xl shadow-2xl p-5 flex items-center gap-5 max-w-sm w-full">
    <!-- Countdown ring -->
    <div class="relative w-12 h-12 shrink-0 flex items-center justify-center">
      <svg class="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="20" fill="none" stroke="#27272a" stroke-width="3" />
        <circle cx="24" cy="24" r="20" fill="none" stroke="#10b981" stroke-width="3"
          stroke-dasharray="{2 * Math.PI * 20}"
          stroke-dashoffset="{2 * Math.PI * 20 * (1 - autoQueueCountdown.seconds / 5)}"
          stroke-linecap="round"
          style="transition: stroke-dashoffset 0.9s linear"
        />
      </svg>
      <span class="absolute text-base font-semibold text-emerald-400 tabular-nums">{autoQueueCountdown.seconds}</span>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-xs text-zinc-400 uppercase tracking-widest mb-0.5">Auto Start</p>
      <p class="text-sm font-medium text-zinc-100 truncate">{autoQueueCountdown.moduleName}</p>
      <p class="text-xs text-zinc-500 mt-0.5">{autoQueueCountdown.printer.name}</p>
    </div>
    <button
      onclick={cancelAutoQueue}
      class="text-xs text-zinc-400 hover:text-zinc-100 transition-colors px-3 py-2 rounded-lg hover:bg-zinc-800 shrink-0"
    >
      Cancel
    </button>
  </div>
{/if}

<!-- ── Start Queue Toast (when > 1 printer queued) ───────────────────────── -->
{#if startQueueTotal > 1}
  <div class="fixed bottom-6 left-6 z-[60] bg-zinc-900 dark:bg-[#111] border border-zinc-700 dark:border-[#2a2a2a] rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-3 max-w-xs">
    <div class="w-2 h-2 bg-amber-400 rounded-full animate-pulse shrink-0"></div>
    <div>
      <p class="text-xs text-zinc-400 uppercase tracking-widest">Print Queue</p>
      <p class="text-sm font-medium text-zinc-100">Starting {startQueueTotal} printers sequentially</p>
      <p class="text-xs text-zinc-500 mt-0.5">Next starts when current reaches RUNNING</p>
    </div>
  </div>
{/if}

<style>
  @keyframes float-up {
    0%   { transform: translateY(0) translateX(0) rotate(0deg) scale(var(--scale)); opacity: 1; }
    20%  { opacity: 1; }
    100% { transform: translateY(-220px) translateX(var(--drift)) rotate(var(--rotate)) scale(calc(var(--scale) * 0.5)); opacity: 0; }
  }
  :global(.animate-float-up) {
    animation: float-up 1.6s cubic-bezier(0.15, 0.8, 0.3, 1) forwards;
  }
</style>
