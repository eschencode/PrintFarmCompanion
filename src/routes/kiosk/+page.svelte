<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;
  export let form: any;

  $: viewData = form || data;
</script>

<svelte:head>
  <title>Printer Kiosk</title>
</svelte:head>

<style>
  .wrap {
    max-width: 640px;
    margin: 0 auto;
    padding: 24px 20px 40px 20px;
  }

  /* --- Typography --- */
  .label {
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #999;
    margin: 0 0 4px 0;
    font-weight: bold;
  }

  h1 {
    font-size: 32px;
    margin: 0 0 28px 0;
    font-weight: bold;
    color: #111;
  }

  h2 {
    font-size: 14px;
    color: #666;
    margin: 0 0 20px 0;
    font-weight: normal;
  }

  /* --- Printer Card --- */
  .card {
    border: 1px solid #ddd;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
    background: #fff;
  }

  .card-header {
    display: -webkit-flex;
    display: flex;
    -webkit-align-items: flex-start;
    align-items: flex-start;
    margin-bottom: 16px;
  }

  .status-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    margin-right: 12px;
    margin-top: 4px;
    -webkit-flex-shrink: 0;
    flex-shrink: 0;
  }

  .status-dot.idle { background: #34a853; }
  .status-dot.printing { background: #4285f4; }
  .status-dot.other { background: #ea4335; }

  .card-title {
    font-size: 20px;
    font-weight: bold;
    color: #111;
    margin: 0 0 2px 0;
  }

  .card-status {
    font-size: 11px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    font-weight: bold;
  }

  .card-status.idle { color: #34a853; }
  .card-status.printing { color: #4285f4; }
  .card-status.other { color: #ea4335; }

  /* --- Spool Row --- */
  .spool-row {
    display: -webkit-flex;
    display: flex;
    -webkit-align-items: center;
    align-items: center;
    -webkit-justify-content: space-between;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: 14px;
    color: #555;
  }

  .spool-left {
    display: -webkit-flex;
    display: flex;
    -webkit-align-items: center;
    align-items: center;
  }

  .spool-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    margin-right: 10px;
    border: 1px solid #ccc;
    -webkit-flex-shrink: 0;
    flex-shrink: 0;
  }

  .spool-weight {
    font-size: 18px;
    font-weight: bold;
    color: #111;
  }

  .weight-bar {
    height: 4px;
    background: #e0e0e0;
    border-radius: 2px;
    margin-bottom: 16px;
    overflow: hidden;
  }

  .weight-bar-fill {
    height: 100%;
    border-radius: 2px;
  }

  .weight-bar-fill.ok { background: #34a853; }
  .weight-bar-fill.low { background: #ea4335; }

  /* --- Job Info --- */
  .job-row {
    font-size: 13px;
    color: #666;
    margin-bottom: 16px;
  }

  .job-row strong {
    color: #333;
  }

  /* --- No Spool --- */
  .no-spool {
    font-size: 13px;
    color: #ea4335;
    font-weight: bold;
    letter-spacing: 0.5px;
    margin-bottom: 16px;
  }

  /* --- Buttons --- */
  .btn-row {
    display: -webkit-flex;
    display: flex;
  }

  .btn-row form {
    -webkit-flex: 1;
    flex: 1;
    display: block;
  }

  .btn-row form + form {
    margin-left: 12px;
  }

  button {
    width: 100%;
    padding: 16px 12px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #f5f5f5;
    color: #333;
    font-size: 15px;
    font-weight: bold;
    cursor: pointer;
    text-align: center;
    -webkit-appearance: none;
    appearance: none;
    font-family: Arial, sans-serif;
  }

  button:active {
    background: #e0e0e0;
  }

  button.green {
    border-color: #34a853;
    color: #fff;
    background: #34a853;
  }

  button.green:active {
    background: #2d9249;
  }

  button.red {
    border-color: #ea4335;
    color: #fff;
    background: #ea4335;
  }

  button.red:active {
    background: #d33426;
  }

  button.primary {
    background: #111;
    color: #fff;
    border-color: #111;
  }

  button.primary:active {
    background: #333;
  }

  /* --- Back Button --- */
  .back-form {
    display: block;
    margin-bottom: 24px;
  }

  .back-btn {
    width: 100%;
    padding: 16px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #f5f5f5;
    color: #333;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    text-align: center;
    -webkit-appearance: none;
    appearance: none;
    font-family: Arial, sans-serif;
  }

  .back-btn:active {
    background: #e0e0e0;
  }

  /* --- Section --- */
  .section {
    font-size: 11px;
    letter-spacing: 2px;
    color: #999;
    text-transform: uppercase;
    margin: 28px 0 14px 0;
    font-weight: bold;
  }

  /* --- Module / Preset List --- */
  .list-item {
    border: 1px solid #ddd;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 10px;
    display: -webkit-flex;
    display: flex;
    -webkit-justify-content: space-between;
    justify-content: space-between;
    -webkit-align-items: center;
    align-items: center;
    background: #fff;
  }

  .list-item-info {
    -webkit-flex: 1;
    flex: 1;
    margin-right: 12px;
  }

  .list-item-name {
    font-weight: bold;
    font-size: 16px;
    color: #111;
    margin-bottom: 3px;
  }

  .list-item-detail {
    font-size: 12px;
    color: #888;
  }

  .list-item-warn {
    font-size: 12px;
    color: #ea4335;
    margin-top: 2px;
  }

  .list-item form {
    display: block;
  }

  .list-item button {
    width: auto;
    padding: 12px 24px;
    font-size: 14px;
  }

  /* --- Spool Detail (start print view) --- */
  .spool-detail {
    border: 1px solid #ddd;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 20px;
    background: #fff;
  }

  .spool-detail-label {
    font-size: 12px;
    color: #999;
    margin-bottom: 4px;
  }

  .spool-detail-text {
    font-size: 15px;
    color: #555;
    margin-bottom: 8px;
  }

  .spool-detail-weight {
    font-size: 24px;
    font-weight: bold;
    color: #111;
  }

  /* --- Job Info Card --- */
  .job-card {
    border: 1px solid #ddd;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 20px;
    background: #fff;
  }

  .job-card div {
    margin: 4px 0;
    font-size: 15px;
    color: #555;
  }

  .job-card strong {
    color: #111;
  }

  /* --- Currently Loaded --- */
  .current-spool {
    border: 1px solid #ddd;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 20px;
    background: #fff;
  }

  .current-spool div {
    margin: 3px 0;
    font-size: 14px;
    color: #555;
  }

  .current-spool strong {
    color: #111;
  }

  /* --- Select --- */
  select {
    width: 100%;
    padding: 14px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #fff;
    color: #333;
    font-size: 15px;
    margin-bottom: 10px;
    -webkit-appearance: none;
    appearance: none;
    font-family: Arial, sans-serif;
  }

  hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 24px 0;
  }

  .empty {
    color: #888;
    font-size: 14px;
    padding: 16px 0;
  }

  /* Full width button in complete view */
  .full-btn {
    display: block;
    width: 100%;
    padding: 18px;
    font-size: 16px;
  }

  .full-btn-form {
    display: block;
  }
</style>

<div class="wrap">
  {#if viewData.view === 'printers'}
    <!-- PRINTERS LIST -->
    <div class="label">Overview</div>
    <h1>All Printers</h1>

    {#each viewData.printers as printer}
      {@const spool = printer.loaded_spool_id ? viewData.spools.find(s => s.id === printer.loaded_spool_id) : null}
      {@const activeJob = viewData.activePrintJobs.find(j => j.printer_id === printer.id)}
      {@const isIdle = printer.status === 'IDLE' || printer.status === 'idle'}
      {@const isPrinting = printer.status === 'PRINTING' || printer.status === 'printing'}
      {@const statusClass = isIdle ? 'idle' : isPrinting ? 'printing' : 'other'}
      {@const pct = spool ? Math.round((spool.remaining_weight / spool.initial_weight) * 100) : 0}

      <div class="card">
        <div class="card-header">
          <div class="status-dot {statusClass}"></div>
          <div>
            <div class="card-title">{printer.name}</div>
            <div class="card-status {statusClass}">
              {isIdle ? 'Ready' : isPrinting ? 'Printing' : (printer.status || 'Unknown')}
            </div>
          </div>
        </div>

        {#if spool}
          <div class="spool-row">
            <div class="spool-left">
              <div class="spool-dot" style="background: {spool.color || '#888'};"></div>
              {spool.brand} {spool.material} &middot; {spool.color || ''}
            </div>
            <div class="spool-weight">{spool.remaining_weight} g</div>
          </div>
          <div class="weight-bar">
            <div class="weight-bar-fill {pct < 20 ? 'low' : 'ok'}" style="width: {pct}%;"></div>
          </div>

          {#if activeJob}
            <div class="job-row">
              Job: <strong>{activeJob.module_name || activeJob.name}</strong> &middot; {activeJob.expected_weight} g used &middot; after: <strong>{spool.remaining_weight - activeJob.expected_weight} g</strong>
            </div>
          {/if}
        {:else}
          <div class="no-spool">No spool loaded</div>
        {/if}

        <div class="btn-row">
          {#if isPrinting}
            <form method="POST" action="?/navigate">
              <input type="hidden" name="view" value="completePrint" />
              <input type="hidden" name="printerId" value={printer.id} />
              <button type="submit" class="green">Finish / Fail</button>
            </form>
          {:else}
            <form method="POST" action="?/navigate">
              <input type="hidden" name="view" value="loadSpool" />
              <input type="hidden" name="printerId" value={printer.id} />
              <button type="submit">Load Spool</button>
            </form>
            {#if spool && isIdle}
              <form method="POST" action="?/navigate">
                <input type="hidden" name="view" value="startPrint" />
                <input type="hidden" name="printerId" value={printer.id} />
                <button type="submit" class="green">Start Print</button>
              </form>
            {/if}
          {/if}
        </div>
      </div>
    {/each}

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
          <button type="submit" class="primary">Load</button>
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
      {@const pct = Math.round((viewData.selectedSpool.remaining_weight / viewData.selectedSpool.initial_weight) * 100)}
      <div class="spool-detail">
        <div class="spool-detail-label">Loaded Spool</div>
        <div class="spool-detail-text">{viewData.selectedSpool.material} {viewData.selectedSpool.color || ''} ({viewData.selectedSpool.brand})</div>
        <div class="spool-detail-weight">{viewData.selectedSpool.remaining_weight} g remaining</div>
        <div class="weight-bar" style="margin-top: 10px; margin-bottom: 0;">
          <div class="weight-bar-fill {pct < 20 ? 'low' : 'ok'}" style="width: {pct}%;"></div>
        </div>
      </div>

      {#if viewData.suggestedQueue.length > 0}
        <div class="section">Recommended</div>
        {#each viewData.suggestedQueue as mod}
          <div class="list-item">
            <div class="list-item-info">
              <div class="list-item-name">{mod.module_name || mod.name}</div>
              <div class="list-item-detail">{mod.weight_of_print || mod.expected_weight} g{mod.expected_time ? ' &middot; ' + mod.expected_time + ' min' : ''}</div>
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
            <div class="list-item-detail">{mod.expected_weight} g{mod.expected_time ? ' &middot; ' + mod.expected_time + ' min' : ''}</div>
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
        <button type="submit" class="primary" style="width: 100%;">Load Spool First</button>
      </form>
    {/if}

  {:else if viewData.view === 'completePrint' && viewData.selectedPrinter && viewData.activeJob}
    <!-- COMPLETE PRINT -->
    <form method="POST" action="?/navigate" class="back-form">
      <input type="hidden" name="view" value="printers" />
      <button type="submit" class="back-btn">Back to Overview</button>
    </form>

    <div class="label">{viewData.selectedPrinter.name}</div>
    <h1>Complete Print</h1>

    <div class="job-card">
      <div><strong>Module:</strong> {viewData.activeJob.module_name || viewData.activeJob.name}</div>
      <div><strong>Weight:</strong> {viewData.activeJob.expected_weight} g</div>
      {#if viewData.selectedSpool}
        <div><strong>Spool now:</strong> {viewData.selectedSpool.remaining_weight} g</div>
        <div><strong>After print:</strong> {viewData.selectedSpool.remaining_weight - viewData.activeJob.expected_weight} g</div>
      {/if}
    </div>

    <div class="section">Print Successful</div>
    <form method="POST" action="?/completePrint" class="full-btn-form">
      <input type="hidden" name="jobId" value={viewData.activeJob.id} />
      <input type="hidden" name="success" value="true" />
      <input type="hidden" name="actualWeight" value={viewData.activeJob.expected_weight} />
      <button type="submit" class="green full-btn">Print Finished</button>
    </form>

    <hr />

    <div class="section">Print Failed</div>
    <form method="POST" action="?/completePrint" class="full-btn-form">
      <input type="hidden" name="jobId" value={viewData.activeJob.id} />
      <input type="hidden" name="success" value="false" />
      <select name="failureReason" required>
        <option value="">Select failure reason...</option>
        <option value="Spaghetti / Layer Adhesion">Spaghetti / Layer Adhesion</option>
        <option value="Nozzle clogged">Nozzle clogged</option>
        <option value="Filament Runout">Filament Runout</option>
        <option value="Poor Quality">Poor Quality</option>
        <option value="Power Outage">Power Outage</option>
        <option value="Poor First Layer">Poor First Layer</option>
        <option value="Other">Other</option>
      </select>
      <button type="submit" class="red full-btn">Print Failed</button>
    </form>
  {/if}
</div>
