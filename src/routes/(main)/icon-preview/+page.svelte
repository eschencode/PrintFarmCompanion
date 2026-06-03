<script lang="ts">
  // Temporary icon chooser. Pick a number from each row and tell Claude.
  // Each entry is the inner markup of a 24x24 stroke SVG.

  const spoolIcons: string[] = [
    // 1 — reel + hub + loose filament strand (current)
    `<circle cx="10.5" cy="11.5" r="7.75"/><circle cx="10.5" cy="11.5" r="2.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M16 17.1c1.4 1.2 2.9 1.7 4.4 1.4 1-.2 1.6-.9 1.6-1.8 0-.8-.6-1.4-1.4-1.4"/>`,
    // 2 — plain concentric reel
    `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>`,
    // 3 — reel with 4 spokes
    `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path stroke-linecap="round" d="M12 3.5v5.3M12 15.2v5.3M3.5 12h5.3M15.2 12h5.3"/>`,
    // 4 — side-view thread spool (flanges + wound thread)
    `<ellipse cx="12" cy="5" rx="7" ry="1.9"/><ellipse cx="12" cy="19" rx="7" ry="1.9"/><path d="M5 5v14M19 5v14"/><path stroke-linecap="round" d="M8.5 9.5h7M8.5 12h7M8.5 14.5h7"/>`,
    // 5 — 3/4 view filament roll (cylinder)
    `<path d="M5 7c0-1.7 3.13-3 7-3s7 1.3 7 3-3.13 3-7 3-7-1.3-7-3Z"/><path d="M5 7v10c0 1.7 3.13 3 7 3s7-1.3 7-3V7"/><path stroke-linecap="round" d="M9 7.4v9.4"/>`,
    // 6 — roll seen front, filament end hanging
    `<circle cx="12" cy="10" r="7"/><circle cx="12" cy="10" r="2.25"/><path stroke-linecap="round" d="M19 10v6.5"/>`,
    // 7 — wound-filament rings
    `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="1"/>`,
    // 8 — tilted spool face
    `<ellipse cx="12" cy="12" rx="6" ry="8.5" transform="rotate(-22 12 12)"/><ellipse cx="12" cy="12" rx="2" ry="3" transform="rotate(-22 12 12)"/>`,
    // 9 — reel + hub + top feed + side feed
    `<circle cx="11" cy="12" r="8"/><circle cx="11" cy="12" r="2.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M11 4v3.5M19 12h2.5"/>`,
    // 10 — spool with filament coming off and curling down
    `<circle cx="11" cy="10.5" r="7"/><circle cx="11" cy="10.5" r="2.4"/><path stroke-linecap="round" stroke-linejoin="round" d="M17.9 12.6c1.6.7 2.6 1.9 2.6 3.4 0 1.4-1 2.5-2.4 2.5"/>`,
  ];

  const orderIcons: string[] = [
    // 1 — shopping cart
    `<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"/>`,
    // 2 — clipboard with checks (order list)
    `<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"/>`,
    // 3 — archive box
    `<path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"/>`,
    // 4 — delivery truck
    `<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"/>`,
    // 5 — calendar (30 days)
    `<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>`,
    // 6 — trending-up (forecast)
    `<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941"/>`,
    // 7 — shopping bag
    `<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z"/>`,
    // 8 — list / queue
    `<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/>`,
    // 9 — plus circle (add to order)
    `<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>`,
    // 10 — restock arrows (refresh)
    `<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/>`,
  ];
</script>

<svelte:head><title>Icon picker</title></svelte:head>

<div class="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 p-8">
  <div class="max-w-3xl mx-auto space-y-10">
    <h1 class="text-2xl font-medium">Icon picker</h1>
    <p class="text-sm text-zinc-500">Tell Claude the number you want from each row.</p>

    <section>
      <h2 class="text-sm font-medium text-zinc-500 mb-4">Spool card icons</h2>
      <div class="grid grid-cols-5 gap-3">
        {#each spoolIcons as ic, i}
          <div class="bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl p-3 flex flex-col items-center justify-center aspect-square">
            <svg class="w-9 h-9 text-zinc-500 dark:text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">{@html ic}</svg>
            <span class="text-xs text-zinc-400 mt-2 tabular-nums">{i + 1}</span>
          </div>
        {/each}
      </div>
    </section>

    <section>
      <h2 class="text-sm font-medium text-zinc-500 mb-4">Order plan icons</h2>
      <div class="grid grid-cols-5 gap-3">
        {#each orderIcons as ic, i}
          <div class="bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl p-3 flex flex-col items-center justify-center aspect-square">
            <svg class="w-9 h-9 text-zinc-500 dark:text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">{@html ic}</svg>
            <span class="text-xs text-zinc-400 mt-2 tabular-nums">{i + 1}</span>
          </div>
        {/each}
      </div>
    </section>
  </div>
</div>
