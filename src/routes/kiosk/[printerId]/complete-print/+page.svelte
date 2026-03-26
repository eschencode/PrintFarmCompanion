<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;
</script>

<svelte:head>
  <title>Complete Print</title>
</svelte:head>

<style>
  body {
    background: #111;
    color: #eee;
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 16px;
  }
  .wrap {
    max-width: 600px;
    margin: 0 auto;
  }
  a.back {
    color: #4af;
    text-decoration: none;
    font-size: 14px;
    margin-bottom: 16px;
    display: block;
  }
  h1 {
    font-size: 28px;
    margin: 0 0 4px 0;
    font-weight: normal;
  }
  h2 {
    font-size: 14px;
    color: #888;
    margin: 0 0 16px 0;
    font-weight: normal;
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
  .section {
    font-size: 12px;
    color: #888;
    text-transform: uppercase;
    margin: 24px 0 12px 0;
    font-weight: bold;
  }
  button {
    display: block;
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 0;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    margin-top: 8px;
  }
  button.green {
    background: rgb(53, 192, 38);
    color: #111;
  }
  button.green:active {
    background: #2a7a2a;
  }
  button.red {
    background: #8a2a2a;
    color: #fff;
  }
  button.red:active {
    background: #6a1a1a;
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
</style>

<div class="wrap">
  <a class="back" href="/kiosk">← Back</a>
  <h1>{data.printer?.name || 'Printer'}</h1>
  <h2>Complete Print</h2>

  {#if data.activeJob}
    <div class="job-info">
      <div><strong>Module:</strong> {data.activeJob.module_name || data.activeJob.name}</div>
      <div><strong>Weight:</strong> {data.activeJob.planned_weight}g</div>
      {#if data.spool}
        <div><strong>Spool now:</strong> {data.spool.remaining_weight}g</div>
        <div><strong>After print:</strong> {data.spool.remaining_weight - data.activeJob.planned_weight}g</div>
      {/if}
    </div>

    <div class="section">Print Successful</div>
    <form method="POST">
      <input type="hidden" name="jobId" value={data.activeJob.id} />
      <input type="hidden" name="success" value="true" />
      <input type="hidden" name="actualWeight" value={data.activeJob.planned_weight} />
      <button type="submit" class="green">Print Finished</button>
    </form>

    <hr />

    <div class="section">Print Failed</div>
    <form method="POST">
      <input type="hidden" name="jobId" value={data.activeJob.id} />
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
      <button type="submit" class="red">Print Failed</button>
    </form>
  {:else}
    <div class="empty">No active print job for this printer.</div>
  {/if}
</div>