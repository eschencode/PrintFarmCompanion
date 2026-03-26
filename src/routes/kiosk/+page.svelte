<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  
  export let data: PageData;

  onMount(() => {
    // Prevent sleep on iPad
    if (document.hidden !== undefined) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          // Wake up the screen
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          ctx?.fillRect(0, 0, 1, 1);
        }
      });
    }

    // Disable auto-sleep
    const noSleep = new (window as any).NoSleep();
    noSleep.enable();
  });
</script>

<svelte:head>
  <title>Printer Kiosk</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Printer Kiosk" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/nosleep/0.12.0/NoSleep.min.js"></script>
</svelte:head>

<style>
  :global(html), :global(body) {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
  }

  body {
    background: #111;
    color: #eee;
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 16px;
    height: 100vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
  }
  
  .wrap {
    max-width: 600px;
    margin: 0 auto;
  }
  
  h1 {
    font-size: 28px;
    margin: 0 0 24px 0;
    font-weight: normal;
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
  
  .actions {
    margin-top: 12px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  
  a {
    padding: 12px 16px;
    border: none;
    border-radius: 0;
    text-decoration: none;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    display: inline-block;
    -webkit-user-select: none;
    user-select: none;
    -webkit-appearance: none;
    appearance: none;
  }
  
  a.blue {
    background: #3aca2c;
    color: #fff;
  }
  
  a.blue:active {
    background: #1a4a7a;
  }
  
  a.orange {
    background: #0c0700;
    color: #fff;
  }
  
  a.orange:active {
    background: #6a4a0a;
  }
  
  a.green {
    background: rgb(53, 192, 38);
    color: #111;
  }
  
  a.green:active {
    background: #2a7a2a;
  }
  
  .no-spool {
    color: #f44;
  }
</style>

<div class="wrap">
  <h1>Printer Kiosk</h1>

  {#each data.printers as printer}
    {@const spool = printer.loaded_spool_id ? data.spools.find((s) => s.id === printer.loaded_spool_id) : null}
    {@const activeJob = data.activePrintJobs.find((j) => j.printer_id === printer.id)}
    
    <div class="printer">
      <div class="name">{printer.name}</div>
      <div class="status {printer.status === 'IDLE' ? 'idle' : printer.status === 'PRINTING' ? 'printing' : 'other'}">
        {printer.status || 'UNKNOWN'}
      </div>

      {#if spool}
        <div class="spool-info">
          {spool.brand} · {spool.material} {spool.color || ''} · <strong>{spool.remaining_weight}g</strong>
        </div>

        {#if activeJob}
          <div class="detail">Printing: {activeJob.module_name || activeJob.name} · {activeJob.planned_weight}g</div>
          <div class="detail">After print: {spool.remaining_weight - activeJob.planned_weight}g</div>
        {/if}
      {:else}
        <div class="detail no-spool">No spool loaded</div>
      {/if}

      <div class="actions">
        {#if printer.status === 'PRINTING' || printer.status === 'printing'}
          <a class="green" href="/kiosk/{printer.id}/complete-print">Finish / Fail</a>
        {:else}
          <a class="orange" href="/kiosk/{printer.id}/load-spool">Load Spool</a>
          {#if spool && printer.status === 'IDLE'}
            <a class="green" href="/kiosk/{printer.id}/start-print">Start Print</a>
          {/if}
        {/if}
      </div>
    </div>
  {/each}
</div>