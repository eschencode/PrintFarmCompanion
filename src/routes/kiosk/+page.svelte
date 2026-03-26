<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;

  // Helper: find spool for a printer
  function getSpoolForPrinter(printerId: number, spoolId: number | null) {
    if (!spoolId) return null;
    return data.spools.find((s) => s.id === spoolId) || null;
  }

  // Helper: find active job for a printer
  function getActiveJob(printerId: number) {
    return data.activePrintJobs.find((j) => j.printer_id === printerId) || null;
  }

  // Helper: get modules compatible with a printer
  function getModulesForPrinter(printer: any) {
    return data.printModules.filter((m) => {
      // Filter by printer model if module has a model requirement
      if (m.printer_model_id && printer.printer_model_id) {
        return m.printer_model_id === printer.printer_model_id;
      }
      // If module has no model requirement, show it for all printers
      return !m.printer_model_id;
    });
  }

  // Helper: format time elapsed
  function formatElapsed(startTime: number): string {
    const elapsed = Date.now() - startTime;
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    return minutes + 'm';
  }

  // Predefined failure reasons
  const failureReasons = [
    'Spaghetti / Layer Adhesion',
    'Filament Runout',
    'Poor Quality',
    'Power Outage',
    'Poor First Layer',
    'Other'
  ];
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>3D Tracker - Kiosk</title>
</svelte:head>

{@html `<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, Helvetica, Arial, sans-serif;
    background: #111;
    color: #eee;
    padding: 12px;
  }
  h1 {
    font-size: 20px;
    text-align: center;
    margin-bottom: 16px;
    color: #aaa;
  }
  .printers {
    max-width: 900px;
    margin: 0 auto;
  }
  .card {
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }
  .card-header {
    display: -webkit-box;
    display: -webkit-flex;
    display: flex;
    -webkit-justify-content: space-between;
    justify-content: space-between;
    -webkit-align-items: center;
    align-items: center;
    margin-bottom: 12px;
  }
  .printer-name {
    font-size: 18px;
    font-weight: bold;
  }
  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: bold;
    text-transform: uppercase;
  }
  .badge-idle { background: #2a4a2a; color: #6c6; }
  .badge-printing { background: #4a3a1a; color: #fb3; }
  .badge-waiting { background: #3a2a2a; color: #c66; }
  .info-row {
    display: -webkit-box;
    display: -webkit-flex;
    display: flex;
    -webkit-justify-content: space-between;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid #222;
    font-size: 14px;
  }
  .info-label { color: #888; }
  .info-value { font-weight: bold; }
  .weight-highlight {
    font-size: 22px;
    color: #4af;
    font-weight: bold;
  }
  .weight-after {
    font-size: 16px;
    color: #f94;
  }
  .section-title {
    font-size: 13px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 12px;
    margin-bottom: 8px;
  }
  .btn {
    display: inline-block;
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 15px;
    font-weight: bold;
    cursor: pointer;
    width: 100%;
    margin-top: 6px;
    text-align: center;
  }
  .btn-success { background: #2a7a2a; color: #fff; }
  .btn-danger { background: #8a2a2a; color: #fff; }
  .btn-primary { background: #2a5a8a; color: #fff; }
  .btn:active { opacity: 0.7; }
  select, input[type="number"], input[type="text"] {
    width: 100%;
    padding: 10px;
    border: 1px solid #444;
    border-radius: 6px;
    background: #222;
    color: #eee;
    font-size: 15px;
    margin-bottom: 8px;
    -webkit-appearance: none;
  }
  .no-spool {
    color: #c66;
    font-style: italic;
    padding: 8px 0;
  }
  .job-info {
    background: #1f2a1f;
    border: 1px solid #2a4a2a;
    border-radius: 6px;
    padding: 12px;
    margin-top: 8px;
  }
  .actions {
    margin-top: 12px;
  }
  .complete-form {
    margin-top: 8px;
  }
  .low-weight { color: #f55; }
</style>`}

<h1>3D Tracker Kiosk</h1>

<div class="printers">
  {#each data.printers as printer}
    {@const spool = getSpoolForPrinter(printer.id, printer.loaded_spool_id)}
    {@const activeJob = getActiveJob(printer.id)}
    {@const modules = getModulesForPrinter(printer)}

    <div class="card">
      <div class="card-header">
        <span class="printer-name">{printer.name}</span>
        <span class="badge"
          class:badge-idle={printer.status === 'IDLE'}
          class:badge-printing={printer.status === 'PRINTING'}
          class:badge-waiting={printer.status === 'WAITING'}
        >
          {printer.status}
        </span>
      </div>

      <!-- Spool Info -->
      {#if spool}
        <div class="info-row">
          <span class="info-label">Spool</span>
          <span class="info-value">{spool.material} {spool.color || ''} ({spool.brand})</span>
        </div>
        <div class="info-row">
          <span class="info-label">Spool Weight</span>
          <span class="weight-highlight">{spool.remaining_weight}g</span>
        </div>
        {#if spool.remaining_weight < 50}
          <div class="info-row">
            <span class="low-weight">Low filament!</span>
          </div>
        {/if}
      {:else}
        <p class="no-spool">No spool loaded</p>
      {/if}

      <!-- Active Print Job -->
      {#if activeJob && printer.status === 'PRINTING'}
        <div class="job-info">
          <div class="section-title">Currently Printing</div>
          <div class="info-row">
            <span class="info-label">Module</span>
            <span class="info-value">{activeJob.module_name || activeJob.name}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Elapsed</span>
            <span class="info-value">{formatElapsed(activeJob.start_time)}</span>
          </div>
          {#if activeJob.expected_time}
            <div class="info-row">
              <span class="info-label">Expected Time</span>
              <span class="info-value">{Math.floor(activeJob.expected_time / 60)}h {activeJob.expected_time % 60}m</span>
            </div>
          {/if}
          <div class="info-row">
            <span class="info-label">Print Weight</span>
            <span class="info-value">{activeJob.planned_weight}g</span>
          </div>
          {#if spool}
            <div class="info-row">
              <span class="info-label">Spool After Print</span>
              <span class="weight-after">{spool.remaining_weight - activeJob.planned_weight}g</span>
            </div>
          {/if}

          <!-- Complete Print -->
          <div class="actions">
            <div class="section-title">Complete Print</div>
            <form method="POST" action="?/completePrint" class="complete-form">
              <input type="hidden" name="jobId" value={activeJob.id} />
              <input type="hidden" name="success" value="true" />
              <input type="hidden" name="actualWeight" value={activeJob.planned_weight} />
              <button type="submit" class="btn btn-success">Print Finished</button>
            </form>

            <form method="POST" action="?/completePrint" class="complete-form">
              <input type="hidden" name="jobId" value={activeJob.id} />
              <input type="hidden" name="success" value="false" />
              <label class="section-title" for="weight-{activeJob.id}">Actual Weight Used (g)</label>
              <input type="number" id="weight-{activeJob.id}" name="actualWeight" value="0" min="0" />
              <label class="section-title" for="reason-{activeJob.id}">Failure Reason</label>
              <select id="reason-{activeJob.id}" name="failureReason">
                {#each failureReasons as reason}
                  <option value={reason}>{reason}</option>
                {/each}
              </select>
              <button type="submit" class="btn btn-danger">Print Failed</button>
            </form>
          </div>
        </div>

      <!-- Start New Print (only when IDLE with spool) -->
      {:else if spool && (printer.status === 'IDLE' || printer.status === 'WAITING')}
        <div class="actions">
          <div class="section-title">Start New Print</div>
          <form method="POST" action="?/startPrint">
            <input type="hidden" name="printerId" value={printer.id} />
            <select name="moduleId" required>
              <option value="">Select module...</option>
              {#each modules as mod}
                <option value={mod.id} disabled={mod.expected_weight > spool.remaining_weight}>
                  {mod.name} ({mod.expected_weight}g)
                  {#if mod.expected_weight > spool.remaining_weight} - NOT ENOUGH{/if}
                </option>
              {/each}
            </select>
            <button type="submit" class="btn btn-primary">Start Print</button>
          </form>
        </div>
      {/if}
    </div>
  {/each}

  {#if data.printers.length === 0}
    <div class="card">
      <p style="text-align:center; color:#666;">No printers found</p>
    </div>
  {/if}
</div>
