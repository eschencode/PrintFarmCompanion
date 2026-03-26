<script lang="ts">
  import type { PageData } from './$types';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  
  export let data: PageData;
  
  let suggestedQueue: any[] = [];
  let loading = true;

  onMount(async () => {
    console.log('onMount triggered');
    console.log('page params:', $page.params);
    
    const printerId = $page.params.printerId;
    console.log('printerId:', printerId);
    
    if (!printerId) {
      console.log('No printerId, returning');
      loading = false;
      return;
    }

    try {
      const url = `/api/ai-recommendations?type=queue&printerId=${printerId}`;
      console.log('Fetching from URL:', url);
      
      const response = await fetch(url);
      console.log('Response status:', response.status);
      
      const result = await response.json();
      console.log('Result from API:', result);
      
      if (result && Array.isArray(result)) {
        suggestedQueue = result;
        console.log('suggestedQueue set to:', suggestedQueue);
      } else {
        console.log('Result is not an array');
      }
    } catch (err) {
      console.error('Failed to fetch suggested queue:', err);
    } finally {
      loading = false;
      console.log('loading set to false');
    }
  });
</script>


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
  .spool-info {
    padding: 12px;
    margin-bottom: 20px;
    border: 1px solid #333;
  }
  .spool-info div {
    margin: 4px 0;
    font-size: 14px;
  }
  .weight {
    font-size: 18px;
    font-weight: bold;
    margin-top: 8px;
  }
  .section {
    font-size: 12px;
    color: #888;
    text-transform: uppercase;
    margin: 24px 0 12px 0;
    font-weight: bold;
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
  button:hover {
    background: #2a7a2a;
  }
  .empty {
    color: #888;
    font-size: 13px;
    padding: 12px 0;
  }
  a {
    color: #4af;
  }
  .loading {
    color: #888;
    font-size: 13px;
    padding: 12px 0;
  }
</style>

<div class="wrap">
  <a class="back" href="/kiosk">← Back</a>
  <h1>{data.printer?.name || 'Printer'}</h1>
  <h2>Start Print</h2>

  {#if data.spool}
    <div class="spool-info">
      <div><strong>Loaded spool:</strong></div>
      <div>{data.spool.material} {data.spool.color || ''} ({data.spool.brand})</div>
      <div class="weight">{data.spool.remaining_weight}g remaining</div>
    </div>

    {#if suggestedQueue.length > 0}
      <div class="section">Recommended</div>
      {#each suggestedQueue as mod}
        <div class="module">
          <div class="module-info">
            <div class="module-name">{mod.module_name || mod.name}</div>
            <div class="module-detail">{mod.weight_of_print || mod.expected_weight}g{mod.expected_time ? ' · ' + mod.expected_time + 'min' : ''}</div>
            {#if (mod.weight_of_print || mod.expected_weight) > data.spool.remaining_weight}
              <div class="module-warn">Not enough filament ({data.spool.remaining_weight}g left)</div>
            {/if}
          </div>
          {#if (mod.weight_of_print || mod.expected_weight) <= data.spool.remaining_weight}
            <form method="POST">
              <input type="hidden" name="moduleId" value={mod.module_id || mod.id} />
              <button type="submit">Start</button>
            </form>
          {/if}
        </div>
      {/each}
    {/if}

    <div class="section">Available modules</div>
    {#each data.printModules as mod}
      <div class="module">
        <div class="module-info">
          <div class="module-name">{mod.name}</div>
          <div class="module-detail">{mod.expected_weight}g{mod.expected_time ? ' · ' + mod.expected_time + 'min' : ''}</div>
          {#if mod.expected_weight > data.spool.remaining_weight}
            <div class="module-warn">Not enough filament ({data.spool.remaining_weight}g left)</div>
          {/if}
        </div>
        {#if mod.expected_weight <= data.spool.remaining_weight}
          <form method="POST">
            <input type="hidden" name="moduleId" value={mod.id} />
            <button type="submit">Start</button>
          </form>
        {/if}
      </div>
    {/each}

    {#if data.printModules.length === 0}
      <div class="empty">No compatible print modules available for this printer and spool</div>
    {/if}
  {:else}
    <div class="empty">No spool loaded. <a href="/kiosk/{data.printer?.id}/load-spool">Load one first.</a></div>
  {/if}
</div>