<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;
</script>

<svelte:head>
  <title>Load Spool</title>
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
  .current {
    padding: 12px;
    margin-bottom: 20px;
    border: 1px solid #333;
  }
  .current div {
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
  button {
    padding: 8px 20px;
    border: none;
    border-radius: 0;
    font-size: 13px;
    font-weight: bold;
    cursor: pointer;
    background: rgb(53, 192, 38);
    white-space: nowrap;
    margin-left: 12px;
  }
  button:active {
    background: #2a7a2a;
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
  <h2>Load Spool</h2>

  {#if data.spool}
    <div class="current">
      <div><strong>Currently loaded:</strong></div>
      <div>{data.spool.material} {data.spool.color || ''} ({data.spool.brand}) — {data.spool.remaining_weight}g</div>
    </div>
  {/if}

  <div class="section">Available spools</div>
  {#each data.spoolPresets as preset}
    <div class="preset">
      <div class="preset-info">
        <div class="preset-name">{preset.name}</div>
        <div class="preset-detail">{preset.brand} · {preset.material} {preset.color || ''} · {preset.default_weight}g</div>
      </div>
      <form method="POST">
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

  {#if data.spoolPresets.length === 0}
    <div class="empty">No spool presets configured</div>
  {/if}
</div>