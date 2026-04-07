<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;
  export let form: any;

  $: viewData = form || data;

  // expected_time is stored in SECONDS (Bambu's `prediction` field).
  function formatSeconds(s: number | null | undefined): string {
    if (!s || s <= 0) return '0m';
    const total = Math.round(s);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
</script>

<svelte:head>
  <title>Printer Kiosk</title>
  {#if viewData.view === 'printers' && !viewData.failedJobId}
    <meta http-equiv="refresh" content="30" />
  {/if}
</svelte:head>

<style>
  /* ── Page wrap ───────────────────────────────────────────────── */
  .wrap {
    max-width: 980px;
    margin: 0 auto;
    padding: 14px 14px 32px 14px;
  }

  .wrap.narrow {
    max-width: 640px;
    padding: 24px 20px 40px 20px;
  }

  /* ── 2-up grid (Safari 9 — flexbox, no `gap`) ────────────────── */
  .grid {
    display: -webkit-flex;
    display: flex;
    -webkit-flex-wrap: wrap;
    flex-wrap: wrap;
    margin: 0 -8px;
  }
  .cell {
    width: 50%;
    -webkit-box-sizing: border-box;
    box-sizing: border-box;
    padding: 0 8px 16px 8px;
  }
  @media (orientation: portrait), (max-width: 720px) {
    .cell { width: 100%; }
  }

  /* ── Printer card ────────────────────────────────────────────── */
  .card {
    border-radius: 14px;
    padding: 22px 22px 18px 22px;
    background: #ffffff;
    color: #111;
    border: 1px solid rgba(0,0,0,0.08);
  }

  .card.state-printing {
    background: #cfe6ff;
    border-color: rgba(0,0,0,0.10);
  }
  .card.state-done {
    background: #c5e7c4;
    border-color: rgba(0,0,0,0.10);
  }
  .card.state-failed {
    background: #f6c1bb;
    border-color: rgba(0,0,0,0.12);
  }

  /* ── Header ──────────────────────────────────────────────────── */
  .card-header {
    display: -webkit-flex;
    display: flex;
    -webkit-align-items: center;
    align-items: center;
    margin-bottom: 14px;
  }

  .status-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    margin-right: 12px;
    -webkit-flex-shrink: 0;
    flex-shrink: 0;
  }
  .status-dot.idle      { background: #34a853; }
  .status-dot.printing  { background: #1a73e8; }
  .status-dot.done      { background: #1e7a1e; }
  .status-dot.failed    { background: #c62828; }
  .status-dot.other     { background: #6b7280; }

  .card-title {
    font-size: 22px;
    font-weight: bold;
    color: #111;
    -webkit-flex: 1;
    flex: 1;
  }

  .card-status {
    font-size: 12px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    font-weight: bold;
    color: #555;
  }

  /* ── Info rows ───────────────────────────────────────────────── */
  .info-row {
    display: -webkit-flex;
    display: flex;
    -webkit-align-items: center;
    align-items: center;
    -webkit-justify-content: space-between;
    justify-content: space-between;
    margin-bottom: 10px;
    font-size: 15px;
    color: #222;
  }

  .info-left {
    display: -webkit-flex;
    display: flex;
    -webkit-align-items: center;
    align-items: center;
    min-width: 0;
    -webkit-flex: 1;
    flex: 1;
  }

  .spool-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    margin-right: 10px;
    border: 1px solid rgba(0,0,0,0.2);
    -webkit-flex-shrink: 0;
    flex-shrink: 0;
  }

  .info-value {
    font-size: 18px;
    font-weight: bold;
    color: #111;
    -webkit-flex-shrink: 0;
    flex-shrink: 0;
  }

  .info-value .after {
    font-size: 14px;
    font-weight: normal;
    color: #555;
    margin-left: 4px;
  }

  .info-label {
    font-size: 11px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #666;
    font-weight: bold;
    margin-right: 8px;
  }

  .module-row {
    margin-bottom: 10px;
    font-size: 17px;
    color: #111;
    font-weight: bold;
    line-height: 1.25;
  }

  .module-row .module-prefix {
    display: block;
    font-size: 11px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #666;
    font-weight: bold;
    margin-bottom: 2px;
  }

  .no-spool {
    font-size: 14px;
    font-weight: bold;
    color: #c62828;
    margin: 6px 0 14px 0;
    letter-spacing: 0.5px;
  }

  /* ── Buttons ─────────────────────────────────────────────────── */
  button {
    width: 100%;
    padding: 18px 14px;
    border: 1px solid #111;
    border-radius: 10px;
    background: #111;
    color: #fff;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    text-align: center;
    -webkit-appearance: none;
    appearance: none;
    font-family: Arial, sans-serif;
    -webkit-box-sizing: border-box;
    box-sizing: border-box;
  }
  button:active { background: #333; }

  button.secondary {
    background: #ffffff;
    color: #111;
    border-color: #111;
  }
  button.secondary:active { background: #e6e6e6; }

  button.green {
    background: #2e7d32;
    color: #fff;
    border-color: #2e7d32;
  }
  button.green:active { background: #225722; }

  button.red {
    background: #c62828;
    color: #fff;
    border-color: #c62828;
  }
  button.red:active { background: #8e1a1a; }

  .btn-row {
    display: -webkit-flex;
    display: flex;
    margin-top: 16px;
  }
  .btn-row form {
    -webkit-flex: 1;
    flex: 1;
    display: block;
  }
  .btn-row form + form {
    margin-left: 10px;
  }

  .btn-stack {
    margin-top: 14px;
  }
  .btn-stack form {
    display: block;
    margin-bottom: 10px;
  }
  .btn-stack form:last-child {
    margin-bottom: 0;
  }

  /* ── Failed-state reason picker (red card) ───────────────────── */
  .reason-prompt {
    font-size: 16px;
    font-weight: bold;
    color: #5a1414;
    margin: 10px 0 12px 0;
  }

  .reason-btn {
    width: 100%;
    padding: 16px 14px;
    border: 1px solid #5a1414;
    border-radius: 10px;
    background: #ffffff;
    color: #5a1414;
    font-size: 15px;
    font-weight: bold;
    cursor: pointer;
    text-align: center;
    -webkit-appearance: none;
    appearance: none;
    font-family: Arial, sans-serif;
    -webkit-box-sizing: border-box;
    box-sizing: border-box;
  }
  .reason-btn:active { background: #f0d8d4; }

  /* ── Sub-views (loadSpool / startPrint pickers) ──────────────── */
  .label {
    font-size: 12px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #888;
    margin: 0 0 6px 0;
    font-weight: bold;
  }

  h1 {
    font-size: 30px;
    margin: 0 0 24px 0;
    font-weight: bold;
    color: #f2f2f2;
  }

  .back-form {
    display: block;
    margin-bottom: 22px;
  }

  .back-btn {
    width: 100%;
    padding: 22px 16px;
    border: 1px solid #333;
    border-radius: 10px;
    background: #1c1c1e;
    color: #f2f2f2;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    text-align: center;
    -webkit-appearance: none;
    appearance: none;
    font-family: Arial, sans-serif;
  }
  .back-btn:active { background: #2a2a2c; }

  .section {
    font-size: 13px;
    letter-spacing: 2px;
    color: #888;
    text-transform: uppercase;
    margin: 28px 0 12px 0;
    font-weight: bold;
  }

  .list-item {
    border: 1px solid #2a2a2c;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 10px;
    display: -webkit-flex;
    display: flex;
    -webkit-justify-content: space-between;
    justify-content: space-between;
    -webkit-align-items: center;
    align-items: center;
    background: #1c1c1e;
  }

  .list-item-info {
    -webkit-flex: 1;
    flex: 1;
    margin-right: 12px;
    min-width: 0;
  }

  .list-item-name {
    font-weight: bold;
    font-size: 17px;
    color: #f2f2f2;
    margin-bottom: 3px;
  }

  .list-item-detail {
    font-size: 13px;
    color: #aaa;
  }

  .list-item-warn {
    font-size: 12px;
    color: #ff8a80;
    margin-top: 3px;
  }

  .list-item form { display: block; }

  .list-item button {
    width: auto;
    padding: 16px 24px;
    font-size: 15px;
  }

  .current-spool {
    border: 1px solid #2a2a2c;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 18px;
    background: #1c1c1e;
  }
  .current-spool div {
    margin: 3px 0;
    font-size: 14px;
    color: #ccc;
  }
  .current-spool strong {
    color: #f2f2f2;
  }

  .empty {
    color: #888;
    font-size: 14px;
    padding: 16px 0;
  }

  .spool-detail {
    border: 1px solid #2a2a2c;
    border-radius: 10px;
    padding: 18px;
    margin-bottom: 22px;
    background: #1c1c1e;
  }

  .spool-detail-label {
    font-size: 12px;
    color: #888;
    margin-bottom: 4px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    font-weight: bold;
  }

  .spool-detail-text {
    font-size: 15px;
    color: #ccc;
    margin-bottom: 8px;
  }

  .spool-detail-weight {
    font-size: 24px;
    font-weight: bold;
    color: #f2f2f2;
  }
</style>

<div class="wrap" class:narrow={viewData.view !== 'printers'}>
  {#if viewData.view === 'printers'}
    <!-- PRINTERS LIST -->
    <div class="grid">
    {#each viewData.printers as printer}
      {@const spool = printer.loaded_spool_id ? viewData.spools.find(s => s.id === printer.loaded_spool_id) : null}
      {@const activeJob = viewData.activePrintJobs.find(j => j.printer_id === printer.id)}
      {@const isPrinting = printer.status === 'PRINTING' || printer.status === 'printing'}
      {@const flags = viewData.printerFlags[printer.id]}
      {@const printDone = !!(flags && flags.printDone)}
      {@const topSuggested = flags && flags.topSuggested}
      {@const isFailedState = !!(viewData.failedJobId && activeJob && activeJob.id === viewData.failedJobId)}
      {@const cardState = isFailedState ? 'failed' : (isPrinting && printDone ? 'done' : (isPrinting ? 'printing' : 'idle'))}
      {@const statusDotClass = cardState === 'failed' ? 'failed' : cardState === 'done' ? 'done' : cardState === 'printing' ? 'printing' : 'idle'}
      {@const statusText = cardState === 'failed' ? 'Failed — pick reason' : cardState === 'done' ? 'Print finished?' : cardState === 'printing' ? 'Printing' : 'Idle'}

      <div class="cell">
      <div class="card state-{cardState}">
        <div class="card-header">
          <div class="status-dot {statusDotClass}"></div>
          <div class="card-title">{printer.name}</div>
          <div class="card-status">{statusText}</div>
        </div>

        {#if spool}
          {@const afterWeight = isPrinting && activeJob ? Math.max(0, spool.remaining_weight - (activeJob.expected_weight || 0)) : (topSuggested ? Math.max(0, spool.remaining_weight - topSuggested.weight) : null)}
          <div class="info-row">
            <div class="info-left">
              <div class="spool-dot" style="background: {spool.color || '#888'};"></div>
              <span>{spool.brand} {spool.material}{spool.color ? ' · ' + spool.color : ''}</span>
            </div>
            <div class="info-value">
              {spool.remaining_weight}g{#if afterWeight !== null}<span class="after">({afterWeight}g)</span>{/if}
            </div>
          </div>
        {:else}
          <div class="no-spool">No spool loaded</div>
        {/if}

        {#if isPrinting && activeJob}
          <div class="module-row">
            <span class="module-prefix">Printing</span>
            {activeJob.module_name || activeJob.name}
          </div>

          {@const expectedSec = activeJob.expected_time || 0}
          {@const elapsedSec = Math.max(0, Math.round((viewData.serverTime - activeJob.start_time) / 1000))}
          {@const remainSec = Math.max(0, expectedSec - elapsedSec)}
          {#if expectedSec > 0}
            <div class="info-row">
              <div class="info-left"><span class="info-label">Time</span></div>
              <div class="info-value">{formatSeconds(remainSec)} <span class="after">/ {formatSeconds(expectedSec)}</span></div>
            </div>
          {/if}
        {:else if topSuggested}
          <div class="module-row">
            <span class="module-prefix">Next</span>
            {topSuggested.module_name}
          </div>
        {/if}

        {#if isFailedState && activeJob}
          <div class="reason-prompt">Why did the print fail?</div>
          <div class="btn-stack">
            {#each ['Spaghetti / Layer Adhesion', 'Nozzle clogged', 'Filament Runout', 'Poor Quality', 'Power Outage', 'Poor First Layer', 'Other'] as reason}
              <form method="POST" action="?/completePrint">
                <input type="hidden" name="jobId" value={activeJob.id} />
                <input type="hidden" name="success" value="false" />
                <input type="hidden" name="failureReason" value={reason} />
                <button type="submit" class="reason-btn">{reason}</button>
              </form>
            {/each}
          </div>
        {:else if isPrinting && printDone && activeJob}
          <div class="btn-row">
            <form method="POST" action="?/completePrint">
              <input type="hidden" name="jobId" value={activeJob.id} />
              <input type="hidden" name="success" value="true" />
              <input type="hidden" name="actualWeight" value={activeJob.expected_weight} />
              <button type="submit" class="green">Successful</button>
            </form>
            <form method="POST" action="?/markFailed">
              <input type="hidden" name="jobId" value={activeJob.id} />
              <button type="submit" class="red">Failed</button>
            </form>
          </div>
        {:else if !isPrinting}
          {#if !spool}
            <div class="btn-row">
              <form method="POST" action="?/navigate">
                <input type="hidden" name="view" value="loadSpool" />
                <input type="hidden" name="printerId" value={printer.id} />
                <button type="submit">Load Spool</button>
              </form>
            </div>
          {:else if topSuggested}
            <div class="btn-row">
              <form method="POST" action="?/startPrint">
                <input type="hidden" name="printerId" value={printer.id} />
                <input type="hidden" name="moduleId" value={topSuggested.module_id} />
                <button type="submit" class="green">Start Suggested</button>
              </form>
              <form method="POST" action="?/navigate">
                <input type="hidden" name="view" value="loadSpool" />
                <input type="hidden" name="printerId" value={printer.id} />
                <button type="submit" class="secondary">Load Spool</button>
              </form>
            </div>
          {:else}
            <div class="btn-row">
              <form method="POST" action="?/navigate">
                <input type="hidden" name="view" value="startPrint" />
                <input type="hidden" name="printerId" value={printer.id} />
                <button type="submit">Start Print</button>
              </form>
              <form method="POST" action="?/navigate">
                <input type="hidden" name="view" value="loadSpool" />
                <input type="hidden" name="printerId" value={printer.id} />
                <button type="submit" class="secondary">Load Spool</button>
              </form>
            </div>
          {/if}
        {/if}
      </div>
      </div>
    {/each}
    </div>

  {:else if viewData.view === 'loadSpool' && viewData.selectedPrinter}
    <!-- LOAD SPOOL -->
    <form method="POST" action="?/navigate" class="back-form">
      <input type="hidden" name="view" value="printers" />
      <button type="submit" class="back-btn">Back to Overview</button>
    </form>

    <div class="label">{viewData.selectedPrinter.name}</div>
    <h1>Load Spool</h1>

    {#if viewData.selectedSpool}
      <div class="current-spool">
        <div><strong>Currently loaded:</strong></div>
        <div>{viewData.selectedSpool.material} {viewData.selectedSpool.color || ''} ({viewData.selectedSpool.brand}) &mdash; {viewData.selectedSpool.remaining_weight} g</div>
      </div>
    {/if}

    <div class="section">Available Spools</div>
    {#each viewData.spoolPresets as preset}
      <div class="list-item">
        <div class="list-item-info">
          <div class="list-item-name">{preset.name}</div>
          <div class="list-item-detail">{preset.brand} &middot; {preset.material} {preset.color || ''} &middot; {preset.default_weight} g</div>
        </div>
        <form method="POST" action="?/loadSpool">
          <input type="hidden" name="printerId" value={viewData.selectedPrinter.id} />
          <input type="hidden" name="presetId" value={preset.id} />
          <input type="hidden" name="brand" value={preset.brand} />
          <input type="hidden" name="material" value={preset.material} />
          <input type="hidden" name="color" value={preset.color || ''} />
          <input type="hidden" name="initialWeight" value={preset.default_weight} />
          <input type="hidden" name="remainingWeight" value={preset.default_weight} />
          <input type="hidden" name="cost" value={preset.cost || 0} />
          <button type="submit">Load</button>
        </form>
      </div>
    {/each}

    {#if viewData.spoolPresets.length === 0}
      <div class="empty">No spool presets configured</div>
    {/if}

  {:else if viewData.view === 'startPrint' && viewData.selectedPrinter}
    <!-- START PRINT -->
    <form method="POST" action="?/navigate" class="back-form">
      <input type="hidden" name="view" value="printers" />
      <button type="submit" class="back-btn">Back to Overview</button>
    </form>

    <div class="label">{viewData.selectedPrinter.name}</div>
    <h1>Start Print</h1>

    {#if viewData.selectedSpool}
      <div class="spool-detail">
        <div class="spool-detail-label">Loaded Spool</div>
        <div class="spool-detail-text">{viewData.selectedSpool.material} {viewData.selectedSpool.color || ''} ({viewData.selectedSpool.brand})</div>
        <div class="spool-detail-weight">{viewData.selectedSpool.remaining_weight} g remaining</div>
      </div>

      {#if viewData.suggestedQueue.length > 0}
        <div class="section">Recommended</div>
        {#each viewData.suggestedQueue as mod}
          <div class="list-item">
            <div class="list-item-info">
              <div class="list-item-name">{mod.module_name || mod.name}</div>
              <div class="list-item-detail">{mod.weight_of_print || mod.expected_weight} g{mod.expected_time ? ' · ' + formatSeconds(mod.expected_time) : ''}</div>
              {#if (mod.weight_of_print || mod.expected_weight) > viewData.selectedSpool.remaining_weight}
                <div class="list-item-warn">Not enough filament ({viewData.selectedSpool.remaining_weight} g left)</div>
              {/if}
            </div>
            {#if (mod.weight_of_print || mod.expected_weight) <= viewData.selectedSpool.remaining_weight}
              <form method="POST" action="?/startPrint">
                <input type="hidden" name="printerId" value={viewData.selectedPrinter.id} />
                <input type="hidden" name="moduleId" value={mod.module_id || mod.id} />
                <button type="submit" class="green">Start</button>
              </form>
            {/if}
          </div>
        {/each}
      {/if}

      <div class="section">All Modules</div>
      {#each viewData.printModules as mod}
        <div class="list-item">
          <div class="list-item-info">
            <div class="list-item-name">{mod.name}</div>
            <div class="list-item-detail">{mod.expected_weight} g{mod.expected_time ? ' · ' + formatSeconds(mod.expected_time) : ''}</div>
            {#if mod.expected_weight > viewData.selectedSpool.remaining_weight}
              <div class="list-item-warn">Not enough filament ({viewData.selectedSpool.remaining_weight} g left)</div>
            {/if}
          </div>
          {#if mod.expected_weight <= viewData.selectedSpool.remaining_weight}
            <form method="POST" action="?/startPrint">
              <input type="hidden" name="printerId" value={viewData.selectedPrinter.id} />
              <input type="hidden" name="moduleId" value={mod.id} />
              <button type="submit" class="green">Start</button>
            </form>
          {/if}
        </div>
      {/each}

      {#if viewData.printModules.length === 0}
        <div class="empty">No compatible modules available</div>
      {/if}
    {:else}
      <div class="empty">No spool loaded.</div>
      <form method="POST" action="?/navigate" class="back-form">
        <input type="hidden" name="view" value="loadSpool" />
        <input type="hidden" name="printerId" value={viewData.selectedPrinter.id} />
        <button type="submit" style="width: 100%;">Load Spool First</button>
      </form>
    {/if}

  {/if}
</div>
