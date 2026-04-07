<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { writable } from 'svelte/store';

  let { data } = $props();

  // Cast loose D1 data shapes to any[] so the markup can index/derive without ts gymnastics.
  let printers = $derived(data.printers as any[]);
  let spools = $derived(data.spools as any[]);
  let spoolPresets = $derived(data.spoolPresets as any[]);
  let printModules = $derived(data.printModules as any[]);
  let activePrintJobs = $derived(data.activePrintJobs as any[]);
  let printerFlags = $derived(data.printerFlags as Record<number, { needsNewSpool: boolean; printableCount: number; topSuggested: { module_id: number; module_name: string; weight: number } | null }>);

  // ── Live Pi state polling (mirrors src/routes/(main)/+page.svelte:55-165) ──
  type PiStatus = {
    gcode_state: string;
    progress: number;
    layer_num: number;
    total_layer_num: number;
    label: string;
    remaining_time?: number | null;
    nozzle_temp?: number | null;
    bed_temp?: number | null;
    chamber_temp?: number | null;
    subtask_name?: string | null;
    gcode_file?: string | null;
  };

  let piStatusBySerial = $state<Record<string, PiStatus>>({});
  let piPollingTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  const reloadTriggered = new Set<string>();

  // Tick store so countdowns re-render
  const nowStore = writable(Date.now());
  let now = $state(Date.now());
  let tickerInterval: ReturnType<typeof setInterval>;

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
        IDLE: 'Idle',
        PREPARE: 'Preparing',
        RUNNING: `Printing ${d.status.progress}%`,
        PAUSE: 'Paused',
        FINISH: 'Done',
        FAILED: 'Failed',
      };
      const prevState = piStatusBySerial[serial]?.gcode_state;
      const newState = d.status.gcode_state;
      piStatusBySerial = {
        ...piStatusBySerial,
        [serial]: {
          gcode_state: newState,
          progress: d.status.progress,
          layer_num: d.status.layer_num ?? 0,
          total_layer_num: d.status.total_layer_num ?? 0,
          label: stateLabels[newState] ?? newState,
          remaining_time: d.status.remaining_time,
          nozzle_temp: d.status.nozzle_temp,
          bed_temp: d.status.bed_temp,
          chamber_temp: d.status.chamber_temp,
          subtask_name: d.status.subtask_name ?? null,
          gcode_file: d.status.gcode_file ?? null,
        },
      };

      // Refresh server data once when a tracked print transitions to a terminal state,
      // so the new active job (or its absence) becomes available to the UI.
      const wasTrackedPrinting = activePrintJobs.some((j: any) => {
        const p = printers.find((pr: any) => pr.id === j.printer_id);
        return p?.printer_serial === serial;
      });
      const isTerminal = newState === 'FINISH' || newState === 'FAILED';
      const prevWasTerminal = prevState === 'FINISH' || prevState === 'FAILED';
      const justFinished = isTerminal && prevState !== undefined && !prevWasTerminal;
      if (wasTrackedPrinting && justFinished && !reloadTriggered.has(serial)) {
        reloadTriggered.add(serial);
        await invalidateAll();
      }
    } catch {
      // network error — retry on next poll
    }
  }

  function startPiPolling(serial: string) {
    if (piPollingTimers[serial]) return;
    fetchPiStatus(serial);
    function scheduleNext() {
      piPollingTimers[serial] = setTimeout(async () => {
        await fetchPiStatus(serial);
        scheduleNext();
      }, 10_000);
    }
    scheduleNext();
  }

  onMount(() => {
    tickerInterval = setInterval(() => {
      now = Date.now();
      nowStore.set(now);
    }, 5000);
    for (const printer of printers) {
      if (printer.printer_serial) startPiPolling(printer.printer_serial);
    }
  });

  onDestroy(() => {
    if (tickerInterval) clearInterval(tickerInterval);
    for (const t of Object.values(piPollingTimers)) clearTimeout(t);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function formatRemainingMinutes(mins: number | null | undefined): string {
    if (mins == null || mins <= 0) return '';
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${mins}m`;
  }

  function formatSeconds(s: number | null | undefined): string {
    if (!s || s <= 0) return '0m';
    const total = Math.round(s);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  // ── Card state derivation ─────────────────────────────────────────────────
  type CardState = 'idle' | 'printing' | 'done' | 'failed' | 'review-failed';

  function deriveCardState(printer: any, piLive: PiStatus | undefined, dbIsPrinting: boolean, reviewFailed: boolean): CardState {
    if (reviewFailed) return 'review-failed';
    if (piLive) {
      if (piLive.gcode_state === 'FINISH') return 'done';
      if (piLive.gcode_state === 'FAILED') return 'failed';
      if (['RUNNING', 'PREPARE', 'PAUSE'].includes(piLive.gcode_state)) return 'printing';
      if (piLive.gcode_state === 'IDLE') return 'idle';
    }
    if (dbIsPrinting) return 'printing';
    return 'idle';
  }

  function statusLabel(state: CardState, piLive: PiStatus | undefined): string {
    if (state === 'idle') return 'Idle';
    if (state === 'printing') return piLive?.label ?? 'Printing';
    if (state === 'done') return 'Finished';
    if (state === 'failed') return 'Failed';
    if (state === 'review-failed') return 'Pick reason';
    return state;
  }

  // ── Sheet (bottom-up modal) state ─────────────────────────────────────────
  type SheetKind = 'startPrint' | 'loadSpool';
  let activeSheet = $state<{ kind: SheetKind; printerId: number } | null>(null);

  function openSheet(kind: SheetKind, printerId: number) {
    activeSheet = { kind, printerId };
  }
  function closeSheet() {
    activeSheet = null;
  }

  // ── Failure reason state ──────────────────────────────────────────────────
  let reviewFailedJobIds = $state<Set<number>>(new Set());

  function markFailedReview(jobId: number) {
    reviewFailedJobIds = new Set([...reviewFailedJobIds, jobId]);
  }

  // ── Print start (Pi-bridged primary, form fallback) ───────────────────────
  let startingPrinterIds = $state<Set<number>>(new Set());

  async function startPrint(printer: any, moduleId: number) {
    if (startingPrinterIds.has(printer.id)) return;
    startingPrinterIds = new Set([...startingPrinterIds, printer.id]);

    const hasPiBridge = printer.printer_serial && printer.printer_ip && printer.printer_access_code;
    try {
      if (hasPiBridge) {
        // Find module to check if it's stored on Pi
        const mod = printModules.find((m: any) => m.id === moduleId);
        if (mod && mod.file_stored_on_pi && mod.pi_file_path) {
          const res = await fetch('/api/pi/print', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ module_id: moduleId, printer_id: printer.id }),
          });
          const result = await res.json() as { success: boolean; error?: string };
          if (result.success) {
            // Force a quick poll so the card flips before the next 10s tick
            if (printer.printer_serial) await fetchPiStatus(printer.printer_serial);
            await invalidateAll();
            return;
          }
        }
      }
      // Fallback: server-side action that just creates a print_jobs row
      const fd = new FormData();
      fd.append('printerId', String(printer.id));
      fd.append('moduleId', String(moduleId));
      await fetch('?/startPrintFallback', { method: 'POST', body: fd });
      await invalidateAll();
    } catch (e) {
      console.error('Start print failed:', e);
    } finally {
      const next = new Set(startingPrinterIds);
      next.delete(printer.id);
      startingPrinterIds = next;
    }
  }

  // ── Failure reasons ───────────────────────────────────────────────────────
  const failureReasons = [
    'Spaghetti / Layer Adhesion',
    'Nozzle clogged',
    'Filament Runout',
    'Poor Quality',
    'Power Outage',
    'Poor First Layer',
    'Other',
  ];
</script>

<header class="page-header">
  <h1>Printers</h1>
</header>

<div class="cards">
  {#each printers as printer (printer.id)}
    {@const spool = printer.loaded_spool_id ? spools.find((s: any) => s.id === printer.loaded_spool_id) : null}
    {@const activeJob = activePrintJobs.find((j: any) => j.printer_id === printer.id)}
    {@const piLive = printer.printer_serial ? piStatusBySerial[printer.printer_serial] : undefined}
    {@const dbIsPrinting = printer.status === 'PRINTING' || printer.status === 'printing'}
    {@const reviewFailed = !!(activeJob && reviewFailedJobIds.has(activeJob.id))}
    {@const cardState = deriveCardState(printer, piLive, dbIsPrinting, reviewFailed)}
    {@const flags = printerFlags[printer.id]}
    {@const topSuggested = flags?.topSuggested}
    {@const isStarting = startingPrinterIds.has(printer.id)}

    <article class="card state-{cardState}">
      <header class="card-head">
        <h2>{printer.name}</h2>
        <span class="pill pill-{cardState}">{statusLabel(cardState, piLive)}</span>
      </header>

      {#if cardState === 'printing'}
        <!-- ── PRINTING ── -->
        {@const moduleName = piLive?.subtask_name ?? activeJob?.module_name ?? activeJob?.name ?? 'Print'}
        {@const remMin = piLive?.remaining_time}
        {@const expectedSec = activeJob?.expected_time || 0}
        {@const elapsedSec = activeJob ? Math.max(0, Math.round((now - activeJob.start_time) / 1000)) : 0}
        {@const fallbackRemainSec = Math.max(0, expectedSec - elapsedSec)}
        {@const progress = piLive?.progress ?? (expectedSec > 0 ? Math.min(100, Math.round((elapsedSec / expectedSec) * 100)) : 0)}

        <div class="module-name">{moduleName}</div>

        <div class="metric-row">
          <div class="metric">
            <div class="metric-label">Remaining</div>
            <div class="metric-value">
              {#if remMin != null && remMin > 0}
                {formatRemainingMinutes(remMin)}
              {:else if expectedSec > 0}
                {formatSeconds(fallbackRemainSec)}
              {:else}
                —
              {/if}
            </div>
          </div>
          <div class="metric">
            <div class="metric-label">Total</div>
            <div class="metric-value muted">
              {expectedSec > 0 ? formatSeconds(expectedSec) : (remMin != null ? formatRemainingMinutes(remMin) : '—')}
            </div>
          </div>
        </div>

        {#if piLive && piLive.total_layer_num > 0}
          <div class="metric-row">
            <div class="metric">
              <div class="metric-label">Layer</div>
              <div class="metric-value">{piLive.layer_num} <span class="muted">/ {piLive.total_layer_num}</span></div>
            </div>
            <div class="metric">
              <div class="metric-label">Progress</div>
              <div class="metric-value">{progress}%</div>
            </div>
          </div>
        {/if}

        <div class="progress-track">
          <div class="progress-fill" style="width: {progress}%"></div>
        </div>

        {#if spool}
          <div class="spool-foot">
            <span class="spool-dot" style="background: {spool.color || '#888'}"></span>
            <span class="spool-text">{spool.brand} {spool.material}{spool.color ? ' · ' + spool.color : ''}</span>
            <span class="spool-weight">{spool.remaining_weight}g</span>
          </div>
        {/if}
      {:else if cardState === 'done'}
        <!-- ── DONE — review ── -->
        {#if activeJob}
          {@const moduleName = activeJob.module_name ?? activeJob.name ?? 'Print'}
          <div class="module-name">{moduleName}</div>
          <div class="review-prompt">Was the print successful?</div>

          <div class="btn-row two">
            <form
              method="POST"
              action="?/completePrint"
              onsubmit={() => { setTimeout(() => invalidateAll(), 100); }}
            >
              <input type="hidden" name="jobId" value={activeJob.id} />
              <input type="hidden" name="success" value="true" />
              <input type="hidden" name="actualWeight" value={activeJob.expected_weight ?? 0} />
              <button type="submit" class="btn btn-success">Successful</button>
            </form>
            <button
              type="button"
              class="btn btn-danger-outline"
              onclick={() => markFailedReview(activeJob.id)}
            >Failed</button>
          </div>
        {/if}
      {:else if cardState === 'failed' || cardState === 'review-failed'}
        <!-- ── FAILED — pick reason ── -->
        {#if activeJob}
          <div class="review-prompt">Why did the print fail?</div>
          <div class="reason-stack">
            {#each failureReasons as reason}
              <form
                method="POST"
                action="?/completePrint"
                onsubmit={() => { setTimeout(() => invalidateAll(), 100); }}
              >
                <input type="hidden" name="jobId" value={activeJob.id} />
                <input type="hidden" name="success" value="false" />
                <input type="hidden" name="failureReason" value={reason} />
                <button type="submit" class="reason-btn">{reason}</button>
              </form>
            {/each}
          </div>
        {/if}
      {:else}
        <!-- ── IDLE ── -->
        {#if spool}
          {@const afterWeight = topSuggested ? Math.max(0, spool.remaining_weight - topSuggested.weight) : null}
          <div class="spool-block">
            <div class="spool-header">
              <span class="spool-dot" style="background: {spool.color || '#888'}"></span>
              <span class="spool-text">{spool.brand} {spool.material}{spool.color ? ' · ' + spool.color : ''}</span>
            </div>
            <div class="weight-row">
              <span class="weight-big">{spool.remaining_weight}<span class="weight-unit">g</span></span>
              {#if afterWeight != null}
                <span class="weight-after">→ {afterWeight}g after print</span>
              {/if}
            </div>
          </div>

          {#if topSuggested}
            <div class="suggested-line">
              <span class="suggested-label">Next</span>
              <span class="suggested-name">{topSuggested.module_name}</span>
              <span class="suggested-weight">{topSuggested.weight}g</span>
            </div>

            <button
              type="button"
              class="btn btn-primary"
              disabled={isStarting}
              onclick={() => startPrint(printer, topSuggested.module_id)}
            >
              {isStarting ? 'Starting…' : `Start ${topSuggested.module_name}`}
            </button>
            <div class="btn-row two">
              <button type="button" class="btn btn-secondary" onclick={() => openSheet('startPrint', printer.id)}>Other print</button>
              <button type="button" class="btn btn-secondary" onclick={() => openSheet('loadSpool', printer.id)}>Load spool</button>
            </div>
          {:else}
            <div class="muted-note">No printable suggestion fits this spool.</div>
            <div class="btn-row two">
              <button type="button" class="btn btn-secondary" onclick={() => openSheet('startPrint', printer.id)}>Pick print</button>
              <button type="button" class="btn btn-secondary" onclick={() => openSheet('loadSpool', printer.id)}>Load spool</button>
            </div>
          {/if}
        {:else}
          <div class="empty-spool">
            <div class="empty-spool-text">No spool loaded</div>
          </div>
          <button type="button" class="btn btn-primary" onclick={() => openSheet('loadSpool', printer.id)}>Load spool</button>
        {/if}
      {/if}
    </article>
  {/each}

  {#if printers.length === 0}
    <div class="empty-state">No printers configured.</div>
  {/if}
</div>

<!-- ── Bottom sheet ─────────────────────────────────────────────────────── -->
{#if activeSheet}
  {@const sheetPrinter = printers.find((p: any) => p.id === activeSheet!.printerId)}
  {@const sheetSpool = sheetPrinter?.loaded_spool_id ? spools.find((s: any) => s.id === sheetPrinter.loaded_spool_id) : null}
  <div class="sheet-backdrop" onclick={closeSheet} role="presentation"></div>
  <div class="sheet" role="dialog">
    <div class="sheet-handle"></div>
    <header class="sheet-head">
      <div>
        <div class="sheet-title">
          {activeSheet.kind === 'startPrint' ? 'Start a print' : 'Load spool'}
        </div>
        <div class="sheet-subtitle">{sheetPrinter?.name ?? ''}</div>
      </div>
      <button type="button" class="sheet-close" onclick={closeSheet} aria-label="Close">×</button>
    </header>

    <div class="sheet-body">
      {#if activeSheet.kind === 'startPrint'}
        {#if sheetSpool}
          {@const compatModules = printModules.filter((m: any) => {
            if (sheetPrinter.printer_model_id && m.printer_model_id && m.printer_model_id !== sheetPrinter.printer_model_id) return false;
            if (m.default_spool_preset_id) {
              const preset = spoolPresets.find((sp: any) => sp.id === m.default_spool_preset_id);
              if (preset && preset.material !== sheetSpool.material) return false;
            }
            return true;
          })}
          {#if compatModules.length === 0}
            <div class="sheet-empty">No compatible modules.</div>
          {:else}
            {#each compatModules as mod}
              {@const fits = (mod.expected_weight ?? 0) <= sheetSpool.remaining_weight}
              <div class="sheet-row">
                <div class="sheet-row-info">
                  <div class="sheet-row-name">{mod.name}</div>
                  <div class="sheet-row-meta">
                    {mod.expected_weight ?? 0}g
                    {#if mod.expected_time}· {formatSeconds(mod.expected_time)}{/if}
                    {#if !fits}<span class="warn"> · won't fit</span>{/if}
                  </div>
                </div>
                <button
                  type="button"
                  class="btn btn-primary sheet-action"
                  disabled={!fits}
                  onclick={() => { startPrint(sheetPrinter, mod.id); closeSheet(); }}
                >Start</button>
              </div>
            {/each}
          {/if}
        {:else}
          <div class="sheet-empty">Load a spool first.</div>
        {/if}
      {:else if activeSheet.kind === 'loadSpool'}
        {#if spoolPresets.length === 0}
          <div class="sheet-empty">No spool presets configured.</div>
        {:else}
          {#each spoolPresets as preset}
            <div class="sheet-row">
              <div class="sheet-row-info">
                <div class="sheet-row-name">
                  <span class="spool-dot" style="background: {preset.color || '#888'}"></span>
                  {preset.name}
                </div>
                <div class="sheet-row-meta">{preset.brand} · {preset.material}{preset.color ? ' · ' + preset.color : ''} · {preset.default_weight}g</div>
              </div>
              <form
                method="POST"
                action="?/loadSpool"
                onsubmit={() => { setTimeout(() => { invalidateAll(); closeSheet(); }, 100); }}
              >
                <input type="hidden" name="printerId" value={sheetPrinter.id} />
                <input type="hidden" name="presetId" value={preset.id} />
                <input type="hidden" name="brand" value={preset.brand} />
                <input type="hidden" name="material" value={preset.material} />
                <input type="hidden" name="color" value={preset.color || ''} />
                <input type="hidden" name="initialWeight" value={preset.default_weight} />
                <input type="hidden" name="remainingWeight" value={preset.default_weight} />
                <input type="hidden" name="cost" value={preset.cost || 0} />
                <button type="submit" class="btn btn-primary sheet-action">Load</button>
              </form>
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ── Tokens ─────────────────────────────────────────────────────────── */
  :root {
    --bg: #0a0a0a;
    --card: #161618;
    --card-border: rgba(255, 255, 255, 0.06);
    --text: #f5f5f7;
    --text-2: #a1a1a6;
    --text-3: #6e6e73;
    --accent: #4a9eff;
    --green: #30d158;
    --red: #ff453a;
    --yellow: #ffd60a;
  }

  /* ── Page header ────────────────────────────────────────────────────── */
  .page-header {
    margin: 4px 0 22px 0;
  }
  .page-header h1 {
    margin: 0;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.6px;
    color: var(--text);
  }

  /* ── Cards stack ───────────────────────────────────────────────────── */
  .cards {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .card {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 18px;
    padding: 20px;
    transition: background 0.2s ease;
  }
  .card.state-printing {
    background: #0f1c2e;
    border-color: rgba(74, 158, 255, 0.18);
  }
  .card.state-done {
    background: #0f2316;
    border-color: rgba(48, 209, 88, 0.22);
  }
  .card.state-failed,
  .card.state-review-failed {
    background: #2a0f10;
    border-color: rgba(255, 69, 58, 0.25);
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }
  .card-head h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.2px;
  }

  /* ── Status pill ───────────────────────────────────────────────────── */
  .pill {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    padding: 5px 11px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .pill-idle           { background: rgba(255,255,255,0.08); color: var(--text-2); }
  .pill-printing       { background: rgba(74,158,255,0.18); color: var(--accent); }
  .pill-done           { background: rgba(48,209,88,0.18);  color: var(--green); }
  .pill-failed,
  .pill-review-failed  { background: rgba(255,69,58,0.18);  color: var(--red); }

  /* ── Spool block (idle state) ──────────────────────────────────────── */
  .spool-block { margin-bottom: 16px; }
  .spool-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-2);
    margin-bottom: 4px;
  }
  .spool-dot {
    display: inline-block;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.15);
    flex-shrink: 0;
  }
  .spool-text { font-weight: 500; }
  .weight-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .weight-big {
    font-size: 32px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.8px;
    font-feature-settings: 'tnum';
  }
  .weight-unit { font-size: 18px; color: var(--text-3); margin-left: 2px; font-weight: 600; }
  .weight-after {
    font-size: 12px;
    color: var(--text-3);
    font-weight: 500;
  }

  .empty-spool {
    padding: 16px 0;
    margin-bottom: 14px;
  }
  .empty-spool-text {
    font-size: 15px;
    color: var(--text-3);
  }

  /* ── Suggested line ────────────────────────────────────────────────── */
  .suggested-line {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 0;
    margin: 8px 0 16px 0;
    border-top: 1px solid var(--card-border);
    border-bottom: 1px solid var(--card-border);
  }
  .suggested-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-3);
    font-weight: 600;
  }
  .suggested-name {
    flex: 1;
    font-size: 14px;
    color: var(--text);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .suggested-weight {
    font-size: 13px;
    color: var(--text-2);
    font-weight: 500;
    font-feature-settings: 'tnum';
  }

  .muted-note {
    font-size: 13px;
    color: var(--text-3);
    margin: 8px 0 14px 0;
  }

  /* ── Printing state ────────────────────────────────────────────────── */
  .module-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 14px;
    word-break: break-word;
  }
  .metric-row {
    display: flex;
    gap: 24px;
    margin-bottom: 14px;
  }
  .metric { flex: 1; }
  .metric-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-3);
    font-weight: 600;
    margin-bottom: 4px;
  }
  .metric-value {
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.4px;
    font-feature-settings: 'tnum';
  }
  .metric-value.muted { color: var(--text-3); font-weight: 600; }
  .muted { color: var(--text-3); font-weight: 500; }

  .progress-track {
    height: 4px;
    background: rgba(255,255,255,0.08);
    border-radius: 999px;
    overflow: hidden;
    margin: 6px 0 16px 0;
  }
  .progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
    transition: width 0.4s ease;
  }

  .spool-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 14px;
    border-top: 1px solid var(--card-border);
    font-size: 13px;
    color: var(--text-2);
  }
  .spool-foot .spool-text { flex: 1; }
  .spool-foot .spool-weight {
    font-weight: 600;
    color: var(--text);
    font-feature-settings: 'tnum';
  }

  /* ── Review prompt (done / failed) ─────────────────────────────────── */
  .review-prompt {
    font-size: 14px;
    color: var(--text-2);
    margin: 4px 0 14px 0;
    font-weight: 500;
  }

  /* ── Buttons ───────────────────────────────────────────────────────── */
  .btn {
    width: 100%;
    border: none;
    border-radius: 12px;
    padding: 16px 14px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s ease, transform 0.05s ease;
    text-align: center;
    letter-spacing: -0.1px;
  }
  .btn:active { transform: scale(0.98); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-primary {
    background: var(--accent);
    color: #fff;
  }
  .btn-secondary {
    background: rgba(255, 255, 255, 0.07);
    color: var(--text);
  }
  .btn-success {
    background: var(--green);
    color: #062a10;
  }
  .btn-danger-outline {
    background: transparent;
    color: var(--red);
    border: 1px solid rgba(255, 69, 58, 0.45);
  }

  .btn-row {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }
  .btn-row.two > * { flex: 1; min-width: 0; }
  .btn-row form { flex: 1; display: block; }

  /* ── Failure reason picker ─────────────────────────────────────────── */
  .reason-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .reason-stack form { display: block; }
  .reason-btn {
    width: 100%;
    background: rgba(255, 69, 58, 0.08);
    border: 1px solid rgba(255, 69, 58, 0.28);
    color: #ffb4ae;
    border-radius: 12px;
    padding: 14px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }
  .reason-btn:active { background: rgba(255, 69, 58, 0.18); }

  .empty-state {
    text-align: center;
    color: var(--text-3);
    padding: 60px 0;
    font-size: 15px;
  }

  /* ── Bottom sheet ──────────────────────────────────────────────────── */
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 200;
    -webkit-backdrop-filter: blur(4px);
    backdrop-filter: blur(4px);
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 201;
    background: #1c1c1e;
    border-radius: 20px 20px 0 0;
    padding: 8px 16px calc(env(safe-area-inset-bottom) + 24px) 16px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.25s ease-out;
    box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
  }
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
  .sheet-handle {
    width: 36px;
    height: 4px;
    background: rgba(255,255,255,0.2);
    border-radius: 999px;
    margin: 6px auto 14px auto;
  }
  .sheet-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 0 4px 18px 4px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 12px;
  }
  .sheet-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.4px;
  }
  .sheet-subtitle {
    font-size: 13px;
    color: var(--text-3);
    margin-top: 2px;
  }
  .sheet-close {
    background: rgba(255,255,255,0.08);
    border: none;
    color: var(--text-2);
    width: 32px;
    height: 32px;
    border-radius: 999px;
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .sheet-body {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    flex: 1;
  }
  .sheet-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 4px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .sheet-row:last-child { border-bottom: none; }
  .sheet-row-info {
    flex: 1;
    min-width: 0;
  }
  .sheet-row-name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 3px;
  }
  .sheet-row-meta {
    font-size: 12px;
    color: var(--text-3);
    font-weight: 500;
  }
  .sheet-row-meta .warn { color: var(--red); }
  .sheet-action {
    width: auto;
    padding: 12px 22px;
    font-size: 14px;
    flex-shrink: 0;
  }
  .sheet-empty {
    padding: 40px 0;
    text-align: center;
    color: var(--text-3);
    font-size: 14px;
  }
</style>
