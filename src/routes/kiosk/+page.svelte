<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  // After a form action, SvelteKit returns the action data in `form`
  // We use it to override the initial load data for view switching
  export let form: any;

  $: viewData = form || data;
</script>

<svelte:head>
  <title>Printer Kiosk</title>
</svelte:head>

<style>
  .wrap {
    max-width: 600px;
    margin: 0 auto;
    padding: 16px;
  }

  h1 {
    font-size: 28px;
    margin: 0 0 24px 0;
    font-weight: normal;
  }

  h2 {
    font-size: 14px;
    color: #888;
    margin: 0 0 16px 0;
    font-weight: normal;
  }

  .back-btn {
    color: #fff;
    background: #333;
    border: 1px solid #555;
    font-size: 16px;
    margin-bottom: 20px;
    display: block;
    width: 100%;
    cursor: pointer;
    padding: 14px 16px;
    font-family: Arial, sans-serif;
    font-weight: bold;
    text-align: left;
    -webkit-appearance: none;
    appearance: none;
  }

  .back-btn:active {
    background: #444;
  }

  .printer {
    padding: 12px;
    margin-bottom: 16px;
    border: 1px solid #333;
  }

  .name {
    font-weight: bold;
    font-size: 18px;
    margin-bottom: 8px;
  }

  .status {
    font-size: 12px;
    margin-bottom: 8px;
    font-weight: bold;
  }

  .status.idle {
    color: #6c6;
  }

  .status.printing {
    color: #fb3;
  }

  .status.other {
    color: #c66;
  }

  .detail {
    font-size: 13px;
    color: #888;
    margin: 4px 0;
  }

  .spool-info {
    margin: 8px 0;
    font-size: 13px;
  }

  .spool-info div {
    margin: 4px 0;
    font-size: 14px;
  }

  .actions {
    margin-top: 12px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  button {
    padding: 12px 16px;
    border: none;
    border-radius: 0;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    display: inline-block;
    -webkit-appearance: none;
    appearance: none;
    font-family: Arial, sans-serif;
  }

  button.orange {
    background: #0c0700;
    color: #fff;
  }

  button.blue {
    background: #3aca2c;
    color: #fff;
  }

  button.green {
    background: rgb(53, 192, 38);
    color: #111;
  }

  button.red {
    background: #8a2a2a;
    color: #fff;
  }

  .no-spool {
    color: #f44;
  }

  .section {
    font-size: 12px;
    color: #888;
    text-transform: uppercase;
    margin: 24px 0 12px 0;
    font-weight: bold;
  }

  .preset {
    padding: 12px;
    margin-bottom: 10px;
    border: 1px solid #333;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .preset-info {
    flex: 1;
  }

  .preset-name {
    font-weight: bold;
    font-size: 15px;
    margin-bottom: 4px;
  }

  .preset-detail {
    font-size: 12px;
    color: #888;
  }

  .module {
    padding: 12px;
    margin-bottom: 10px;
    border: 1px solid #333;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .module-info {
    flex: 1;
  }

  .module-name {
    font-weight: bold;
    font-size: 15px;
    margin-bottom: 4px;
  }

  .module-detail {
    font-size: 12px;
    color: #888;
  }

  .module-warn {
    font-size: 12px;
    color: #f44;
  }

  .job-info {
    padding: 12px;
    margin-bottom: 20px;
    border: 1px solid #333;
  }

  .job-info div {
    margin: 4px 0;
    font-size: 14px;
  }

  .current {
    padding: 12px;
    margin-bottom: 20px;
    border: 1px solid #333;
  }

  .current div {
    margin: 4px 0;
    font-size: 14px;
  }

  .weight {
    font-size: 18px;
    font-weight: bold;
    margin-top: 8px;
  }

  select {
    width: 100%;
    padding: 10px;
    border: 1px solid #444;
    border-radius: 0;
    background: #222;
    color: #eee;
    font-size: 14px;
    margin-bottom: 8px;
    -webkit-appearance: none;
    appearance: none;
  }

  hr {
    border: none;
    border-top: 1px solid #333;
    margin: 16px 0;
  }

  .empty {
    color: #888;
    font-size: 13px;
    padding: 12px 0;
  }

  form {
    display: contents;
  }
</style>

<div class="wrap">
  {#if viewData.view === 'printers'}
    <!-- PRINTERS LIST -->
    <h1>Printer Kiosk</h1>

    {#each viewData.printers as printer}
      {@const spool = printer.loaded_spool_id ? viewData.spools.find(s => s.id === printer.loaded_spool_id) : null}
      {@const activeJob = viewData.activePrintJobs.find(j => j.printer_id === printer.id)}

      <div class="printer">
        <div class="name">{printer.name}</div>
        <div class="status {printer.status === 'IDLE' ? 'idle' : printer.status === 'printing' || printer.status === 'PRINTING' ? 'printing' : 'other'}">
          {printer.status || 'UNKNOWN'}
        </div>

        {#if spool}
          <div class="spool-info">
            {spool.brand} &middot; {spool.material} {spool.color || ''} &middot; <strong>{spool.remaining_weight}g</strong>
          </div>

          {#if activeJob}
            <div class="detail">Printing: {activeJob.module_name || activeJob.name} &middot; {activeJob.expected_weight}g</div>
            <div class="detail">After print: {spool.remaining_weight - activeJob.expected_weight}g</div>
          {/if}
        {:else}
          <div class="detail no-spool">No spool loaded</div>
        {/if}

        <div class="actions">
          {#if printer.status === 'PRINTING' || printer.status === 'printing'}
            <form method="POST" action="?/navigate">
              <input type="hidden" name="view" value="completePrint" />
              <input type="hidden" name="printerId" value={printer.id} />
              <button type="submit" class="green">Finish / Fail</button>
            </form>
          {:else}
            <form method="POST" action="?/navigate">
              <input type="hidden" name="view" value="loadSpool" />
              <input type="hidden" name="printerId" value={printer.id} />
              <button type="submit" class="orange">Load Spool</button>
            </form>
            {#if spool && (printer.status === 'IDLE' || printer.status === 'idle')}
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
    <form method="POST" action="?/navigate">
      <input type="hidden" name="view" value="printers" />
      <button type="submit" class="back-btn">&larr; Back</button>
    </form>
    <h1>{viewData.selectedPrinter.name}</h1>
    <h2>Load Spool</h2>

    {#if viewData.selectedSpool}
      <div class="current">
        <div><strong>Currently loaded:</strong></div>
        <div>{viewData.selectedSpool.material} {viewData.selectedSpool.color || ''} ({viewData.selectedSpool.brand}) &mdash; {viewData.selectedSpool.remaining_weight}g</div>
      </div>
    {/if}

    <div class="section">Available spools</div>
    {#each viewData.spoolPresets as preset}
      <div class="preset">
        <div class="preset-info">
          <div class="preset-name">{preset.name}</div>
          <div class="preset-detail">{preset.brand} &middot; {preset.material} {preset.color || ''} &middot; {preset.default_weight}g</div>
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
          <button type="submit" class="blue">Load</button>
        </form>
      </div>
    {/each}

    {#if viewData.spoolPresets.length === 0}
      <div class="empty">No spool presets configured</div>
    {/if}

  {:else if viewData.view === 'startPrint' && viewData.selectedPrinter}
    <!-- START PRINT -->
    <form method="POST" action="?/navigate">
      <input type="hidden" name="view" value="printers" />
      <button type="submit" class="back-btn">&larr; Back</button>
    </form>
    <h1>{viewData.selectedPrinter.name}</h1>
    <h2>Start Print</h2>

    {#if viewData.selectedSpool}
      <div class="spool-info">
        <div><strong>Loaded spool:</strong></div>
        <div>{viewData.selectedSpool.material} {viewData.selectedSpool.color || ''} ({viewData.selectedSpool.brand})</div>
        <div class="weight">{viewData.selectedSpool.remaining_weight}g remaining</div>
      </div>

      {#if viewData.suggestedQueue.length > 0}
        <div class="section">Recommended</div>
        {#each viewData.suggestedQueue as mod}
          <div class="module">
            <div class="module-info">
              <div class="module-name">{mod.module_name || mod.name}</div>
              <div class="module-detail">{mod.weight_of_print || mod.expected_weight}g{mod.expected_time ? ' &middot; ' + mod.expected_time + 'min' : ''}</div>
              {#if (mod.weight_of_print || mod.expected_weight) > viewData.selectedSpool.remaining_weight}
                <div class="module-warn">Not enough filament ({viewData.selectedSpool.remaining_weight}g left)</div>
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

      <div class="section">Available modules</div>
      {#each viewData.printModules as mod}
        <div class="module">
          <div class="module-info">
            <div class="module-name">{mod.name}</div>
            <div class="module-detail">{mod.expected_weight}g{mod.expected_time ? ' &middot; ' + mod.expected_time + 'min' : ''}</div>
            {#if mod.expected_weight > viewData.selectedSpool.remaining_weight}
              <div class="module-warn">Not enough filament ({viewData.selectedSpool.remaining_weight}g left)</div>
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
        <div class="empty">No compatible print modules available</div>
      {/if}
    {:else}
      <div class="empty">No spool loaded.</div>
      <form method="POST" action="?/navigate">
        <input type="hidden" name="view" value="loadSpool" />
        <input type="hidden" name="printerId" value={viewData.selectedPrinter.id} />
        <button type="submit" class="back-btn">Load one first.</button>
      </form>
    {/if}

  {:else if viewData.view === 'completePrint' && viewData.selectedPrinter && viewData.activeJob}
    <!-- COMPLETE PRINT -->
    <form method="POST" action="?/navigate">
      <input type="hidden" name="view" value="printers" />
      <button type="submit" class="back-btn">&larr; Back</button>
    </form>
    <h1>{viewData.selectedPrinter.name}</h1>
    <h2>Complete Print</h2>

    <div class="job-info">
      <div><strong>Module:</strong> {viewData.activeJob.module_name || viewData.activeJob.name}</div>
      <div><strong>Weight:</strong> {viewData.activeJob.expected_weight}g</div>
      {#if viewData.selectedSpool}
        <div><strong>Spool now:</strong> {viewData.selectedSpool.remaining_weight}g</div>
        <div><strong>After print:</strong> {viewData.selectedSpool.remaining_weight - viewData.activeJob.expected_weight}g</div>
      {/if}
    </div>

    <div class="section">Print Successful</div>
    <form method="POST" action="?/completePrint">
      <input type="hidden" name="jobId" value={viewData.activeJob.id} />
      <input type="hidden" name="success" value="true" />
      <input type="hidden" name="actualWeight" value={viewData.activeJob.expected_weight} />
      <button type="submit" class="green" style="display: block; width: 100%; padding: 12px;">Print Finished</button>
    </form>

    <hr />

    <div class="section">Print Failed</div>
    <form method="POST" action="?/completePrint">
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
      <button type="submit" class="red" style="display: block; width: 100%; padding: 12px;">Print Failed</button>
    </form>
  {/if}
</div>
