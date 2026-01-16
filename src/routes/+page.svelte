<script lang="ts">
  import type { PageData } from './$types';
  
  // Data comes automatically from +page.server.ts
  export let data: PageData;
</script>

<h1>Print Farm Companion 1.0</h1>

<h2>Printers ({data.printers.length})</h2>

{#if data.printers.length === 0}
  <p>No printers found.</p>
{:else}
  <ul>
    {#each data.printers as printer}
      <li>
        <strong>{printer.name}</strong> - {printer.model}
        <span class="status">{printer.status}</span>
      </li>
    {/each}
  </ul>
{/if}

<h2>Spools</h2>

<form method="POST" action="?/addBlueSpool">
  <button type="submit">Add Blue Spool</button>
</form>

{#if data.spools.length === 0}
  <p>No spools found.</p>
{:else}
  <ul>
    {#each data.spools as spools}
      <li>
        <strong>{spools.id}</strong> - {spools.remaining_weight}
      </li>
    {/each}
  </ul>
{/if}

<style>
  ul {
    list-style: none;
    padding: 0;
  }
  
  li {
    padding: 1rem;
    margin: 0.5rem 0;
    background: #f5f5f5;
    border-radius: 4px;
  }
  
  .status {
    padding: 0.25rem 0.5rem;
    background: #4caf50;
    color: white;
    border-radius: 3px;
    font-size: 0.85rem;
  }
</style>