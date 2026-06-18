<script lang="ts">
  import type { PageData } from './$types';
  import type { InventoryPriority } from '$lib/types';
  import BackToDashboard from '$lib/components/BackToDashboard.svelte';

  let { data }: { data: PageData } = $props();

  const PRIORITY_COLORS: Record<InventoryPriority, string> = {
    CRITICAL: 'text-red-500 dark:text-red-400 bg-red-500/10 border-red-500/20',
    HIGH:     'text-amber-500 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    MEDIUM:   'text-yellow-500 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    LOW:      'text-blue-500 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
    VERY_LOW: 'text-zinc-500 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/20'
  };

  const CONFIDENCE_COLORS = {
    high:   'text-emerald-500 dark:text-emerald-400',
    medium: 'text-amber-500 dark:text-amber-400',
    low:    'text-zinc-500 dark:text-zinc-400'
  };

  // Solid bar fill per bucket, used to colour the risk bars by their resolved tier.
  const RISK_FILL: Record<InventoryPriority, string> = {
    CRITICAL: 'bg-red-500/80',
    HIGH:     'bg-amber-500/80',
    MEDIUM:   'bg-yellow-500/80',
    LOW:      'bg-blue-500/70',
    VERY_LOW: 'bg-zinc-400/60 dark:bg-zinc-600/60'
  };

  function fmtPct(v: number): string {
    return `${(v * 100).toFixed(1)}%`;
  }

  function fmtDays(d: number): string {
    return d >= 999 ? '∞' : `${d.toFixed(1)}d`;
  }

  function bucketReason(item: { in_stock: number; min_threshold: number; stockout_risk: number; priority: InventoryPriority; confidence: 'high' | 'medium' | 'low' }): string {
    if (item.in_stock <= item.min_threshold) {
      return `stock ${item.in_stock} ≤ min_threshold ${item.min_threshold} → CRITICAL (floor)`;
    }
    const t = data.config.thresholds;
    let rawTier: InventoryPriority;
    if (item.stockout_risk >= t.CRITICAL) rawTier = 'CRITICAL';
    else if (item.stockout_risk >= t.HIGH) rawTier = 'HIGH';
    else if (item.stockout_risk >= t.MEDIUM) rawTier = 'MEDIUM';
    else if (item.stockout_risk >= t.LOW) rawTier = 'LOW';
    else rawTier = 'VERY_LOW';
    const base = `risk ${fmtPct(item.stockout_risk)} → ${rawTier}`;
    return rawTier !== item.priority ? `${base}, capped to ${item.priority} (${item.confidence} confidence)` : base;
  }

  function onPrinterChange(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    const params = new URLSearchParams(window.location.search);
    if (id) params.set('printerId', id); else params.delete('printerId');
    window.location.search = params.toString();
  }

  const t = $derived(data.config.thresholds);

  // Risk is non-linear: the actionable band sits below 30%, so a raw 0-100% bar
  // crushes every marker into the left edge. Map each bucket to an equal 20%
  // segment so LOW/MEDIUM/HIGH/CRITICAL ticks are evenly spaced and readable.
  function riskToX(risk: number): number {
    const stops = [0, t.LOW, t.MEDIUM, t.HIGH, t.CRITICAL, 1];
    for (let i = 0; i < 5; i++) {
      if (risk < stops[i + 1] || i === 4) {
        const span = stops[i + 1] - stops[i] || 1;
        const frac = Math.max(0, Math.min(1, (risk - stops[i]) / span));
        return (i + frac) * 20;
      }
    }
    return 100;
  }

  const scaleMarkers = $derived([
    { label: 'LOW',      pct: 20, value: t.LOW },
    { label: 'MEDIUM',   pct: 40, value: t.MEDIUM },
    { label: 'HIGH',     pct: 60, value: t.HIGH },
    { label: 'CRITICAL', pct: 80, value: t.CRITICAL }
  ]);

  // Queue spool utilization.
  const queueUsed = $derived(data.queue.reduce((s, q) => s + q.weight_of_print, 0));
  const spoolRemaining = $derived(data.loadedSpool ? Math.round(data.loadedSpool.remaining_weight) : 0);
  const utilizationPct = $derived(spoolRemaining > 0 ? Math.min(100, (queueUsed / spoolRemaining) * 100) : 0);
</script>

<div class="min-h-screen bg-white dark:bg-[#0c0c0f] text-zinc-900 dark:text-zinc-100">
  <div class="max-w-6xl mx-auto px-6 py-10 space-y-10">

    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-medium tracking-tight">Recommendation debug</h1>
        <p class="text-sm text-zinc-500 dark:text-zinc-500 mt-1">
          Inputs, computation, and bucketing for the AI recommendation pipeline.
        </p>
      </div>
      <BackToDashboard />
    </header>

    {#if data.error}
      <div class="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500">
        {data.error}
      </div>
    {/if}

    <!-- Printer selector -->
    <section class="flex items-center gap-3">
      <label for="printerId" class="text-sm text-zinc-500">Printer</label>
      <select
        id="printerId"
        class="bg-zinc-50 dark:bg-[#111114] border border-zinc-200 dark:border-[#1a1a22] rounded-lg px-3 py-2 text-sm"
        value={data.selectedPrinterId ?? ''}
        onchange={onPrinterChange}
      >
        <option value="">— none —</option>
        {#each data.printers as p}
          <option value={p.id}>{p.name} {p.preset?.model ? `(${p.preset.model})` : ''}</option>
        {/each}
      </select>
      {#if data.loadedSpool}
        <span class="text-sm text-zinc-500">
          loaded: {data.loadedSpool.preset?.brand ?? ''} {data.loadedSpool.preset?.material ?? ''}
          {data.loadedSpool.preset?.color ?? ''} · {Math.round(data.loadedSpool.remaining_weight)}g remaining
        </span>
      {/if}
    </section>

    <!-- Forecast config -->
    <section class="rounded-xl border border-zinc-200/60 dark:border-[#1a1a22] bg-zinc-50 dark:bg-[#111114] p-5">
      <h2 class="text-base font-medium mb-3">Forecast configuration</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div class="text-xs text-zinc-500 uppercase tracking-wide">Lookback</div>
          <div class="font-medium tabular-nums">{data.config.lookbackDays} days</div>
        </div>
        <div>
          <div class="text-xs text-zinc-500 uppercase tracking-wide">Horizon</div>
          <div class="font-medium tabular-nums">{data.config.horizonDays} days</div>
        </div>
        <div>
          <div class="text-xs text-zinc-500 uppercase tracking-wide">Bootstrap trials</div>
          <div class="font-medium tabular-nums">{data.config.trials}</div>
        </div>
        <div>
          <div class="text-xs text-zinc-500 uppercase tracking-wide">SKUs</div>
          <div class="font-medium tabular-nums">{data.inventory.length}</div>
        </div>
      </div>

      <!-- Threshold bracket bar (equal-width buckets, non-linear risk axis) -->
      <div class="mt-5">
        <div class="text-xs text-zinc-500 uppercase tracking-wide mb-2">Risk → priority brackets</div>
        <div class="relative h-8 rounded-md overflow-hidden flex">
          <div class="bg-zinc-400/60 dark:bg-zinc-600/60" style="width:20%" title="VERY_LOW"></div>
          <div class="bg-blue-500/60" style="width:20%" title="LOW"></div>
          <div class="bg-yellow-500/70" style="width:20%" title="MEDIUM"></div>
          <div class="bg-amber-500/70" style="width:20%" title="HIGH"></div>
          <div class="bg-red-500/70" style="width:20%" title="CRITICAL"></div>
          {#each scaleMarkers as m}
            <div class="absolute top-0 bottom-0 border-l border-white/70 dark:border-black/70" style="left: {m.pct}%">
              <div class="absolute -top-5 -translate-x-1/2 text-[10px] text-zinc-500 whitespace-nowrap">{m.label}</div>
              <div class="absolute -bottom-5 -translate-x-1/2 text-[10px] text-zinc-500 tabular-nums">{fmtPct(m.value)}</div>
            </div>
          {/each}
        </div>
        <div class="mt-8 text-xs text-zinc-500">
          stock ≤ min_threshold always overrides → CRITICAL. Low-confidence forecasts are capped at MEDIUM.
        </div>
      </div>
    </section>

    <!-- Spool suggestions for selected printer -->
    {#if data.selectedPrinterId && data.spoolSuggestions.length > 0}
      <section>
        <h2 class="text-base font-medium mb-3">Spool suggestions (in load order)</h2>
        <div class="space-y-2">
          {#each data.spoolSuggestions as s, i}
            <div class="flex items-start gap-3 p-3 rounded-lg border border-zinc-200/60 dark:border-[#1a1a22] bg-zinc-50 dark:bg-[#111114]">
              <div class="text-zinc-400 dark:text-zinc-600 tabular-nums w-6 text-right">{i + 1}.</div>
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium">{s.object_name}</span>
                  <span class="text-xs px-2 py-0.5 rounded border {PRIORITY_COLORS[s.priority]}">{s.priority}</span>
                </div>
                <div class="text-xs text-zinc-500 mt-0.5">{s.reason}</div>
                {#if s.also_relieves && s.also_relieves.length > 0}
                  <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span class="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wide">also relieves</span>
                    {#each s.also_relieves as r}
                      <span class="text-[10px] px-1.5 py-0.5 rounded border {PRIORITY_COLORS[r.priority]}">{r.object_name}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Print queue for selected printer -->
    {#if data.selectedPrinterId}
      <section>
        <h2 class="text-base font-medium mb-3">Suggested print queue</h2>
        {#if data.queue.length === 0}
          <p class="text-sm text-zinc-500">
            {data.loadedSpool ? 'No printable modules fit the loaded spool.' : 'No spool loaded — load a spool to see queue suggestions.'}
          </p>
        {:else}
          <!-- Spool fill: how the queued prints consume the loaded spool -->
          <div class="mb-3">
            <div class="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
              <span>Spool utilization</span>
              <span class="tabular-nums">{queueUsed}g / {spoolRemaining}g · {utilizationPct.toFixed(0)}%</span>
            </div>
            <div class="flex h-3 rounded-md overflow-hidden bg-zinc-200 dark:bg-zinc-800">
              {#each data.queue as q}
                <div
                  class="{RISK_FILL[q.priority]} border-r border-white/40 dark:border-black/40"
                  style="width: {spoolRemaining > 0 ? (q.weight_of_print / spoolRemaining) * 100 : 0}%"
                  title="{q.module_name} — {q.weight_of_print}g ({q.priority})"
                ></div>
              {/each}
            </div>
          </div>

          <div class="rounded-xl border border-zinc-200/60 dark:border-[#1a1a22] overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-zinc-50 dark:bg-[#111114] text-xs text-zinc-500 uppercase tracking-wide">
                <tr>
                  <th class="text-left px-4 py-2">#</th>
                  <th class="text-left px-4 py-2">Module</th>
                  <th class="text-left px-4 py-2">Inventory</th>
                  <th class="text-left px-4 py-2">Priority</th>
                  <th class="text-right px-4 py-2">Weight</th>
                  <th class="text-right px-4 py-2">Spool after</th>
                </tr>
              </thead>
              <tbody>
                {#each data.queue as q, i}
                  <tr class="border-t border-zinc-200/60 dark:border-[#1a1a22]">
                    <td class="px-4 py-2 tabular-nums text-zinc-500">{i + 1}</td>
                    <td class="px-4 py-2">{q.module_name}</td>
                    <td class="px-4 py-2 text-zinc-500">{q.object_name}</td>
                    <td class="px-4 py-2">
                      <span class="text-xs px-2 py-0.5 rounded border {PRIORITY_COLORS[q.priority]}">{q.priority}</span>
                    </td>
                    <td class="px-4 py-2 text-right tabular-nums">{q.weight_of_print}g</td>
                    <td class="px-4 py-2 text-right tabular-nums text-zinc-500">{Math.round(q.spool_weight_after_print)}g</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {/if}

    <!-- Inventory table with risk bars -->
    <section>
      <h2 class="text-base font-medium mb-3">Inventory — bucketing inputs and outputs</h2>
      <p class="text-xs text-zinc-500 mb-3">
        Sorted by stockout risk descending. Adjusted stock includes queued + printing jobs.
      </p>

      <div class="rounded-xl border border-zinc-200/60 dark:border-[#1a1a22] overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-zinc-50 dark:bg-[#111114] text-xs text-zinc-500 uppercase tracking-wide">
            <tr>
              <th class="text-left px-4 py-2">Item</th>
              <th class="text-right px-4 py-2">Stock</th>
              <th class="text-right px-4 py-2">Min</th>
              <th class="text-right px-4 py-2">Daily velocity</th>
              <th class="text-right px-4 py-2">Days left</th>
              <th class="text-right px-4 py-2">{data.config.horizonDays}d demand (p50·p90)</th>
              <th class="text-right px-4 py-2">Days w/ sales</th>
              <th class="text-left px-4 py-2">Confidence</th>
              <th class="text-left px-4 py-2 w-1/4">Stockout risk ({data.config.horizonDays}d)</th>
              <th class="text-left px-4 py-2">Bucket</th>
            </tr>
          </thead>
          <tbody>
            {#each data.inventory as inv}
              {@const item = (() => {
                // Recover priority for this slug from data.prioritized
                const tiers = data.prioritized;
                for (const p of ['CRITICAL','HIGH','MEDIUM','LOW','VERY_LOW'] as InventoryPriority[]) {
                  const m = tiers[p].find(x => x.id === inv.id);
                  if (m) return m;
                }
                return null;
              })()}
              <tr class="border-t border-zinc-200/60 dark:border-[#1a1a22] {inv.confidence === 'low' ? 'opacity-55' : ''}">
                <td class="px-4 py-2">
                  <div class="font-medium">{inv.name}</div>
                  <div class="text-xs text-zinc-500">#{inv.id}</div>
                </td>
                <td class="px-4 py-2 text-right tabular-nums {inv.in_stock <= inv.min_threshold ? 'text-red-500 dark:text-red-400' : ''}">
                  {inv.in_stock}
                </td>
                <td class="px-4 py-2 text-right tabular-nums text-zinc-500">{inv.min_threshold}</td>
                <td class="px-4 py-2 text-right tabular-nums">{inv.daily_velocity.toFixed(2)}</td>
                <td class="px-4 py-2 text-right tabular-nums {inv.days_until_stockout < data.config.horizonDays ? 'text-red-500 dark:text-red-400' : 'text-zinc-500'}">{fmtDays(inv.days_until_stockout)}</td>
                <td class="px-4 py-2 text-right tabular-nums text-zinc-500">
                  {inv.demand_p50} · <span class={inv.demand_p90 > inv.in_stock ? 'text-amber-500 dark:text-amber-400' : ''}>{inv.demand_p90}</span>
                </td>
                <td class="px-4 py-2 text-right tabular-nums text-zinc-500">{inv.days_with_sales} / {data.config.lookbackDays}</td>
                <td class="px-4 py-2 text-xs {CONFIDENCE_COLORS[inv.confidence]}">{inv.confidence}</td>
                <td class="px-4 py-2">
                  <div class="flex items-center gap-2">
                    <div class="relative flex-1 h-2 rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <div class="absolute inset-y-0 left-0 {item ? RISK_FILL[item.priority] : 'bg-red-500/70'}" style="width: {riskToX(inv.stockout_risk)}%"></div>
                      {#each scaleMarkers as m}
                        <div class="absolute top-0 bottom-0 w-px bg-white/70 dark:bg-black/70" style="left: {m.pct}%"></div>
                      {/each}
                    </div>
                    <span class="text-xs tabular-nums text-zinc-500 w-12 text-right">{fmtPct(inv.stockout_risk)}</span>
                  </div>
                </td>
                <td class="px-4 py-2">
                  {#if item}
                    <span class="text-xs px-2 py-0.5 rounded border {PRIORITY_COLORS[item.priority]}">{item.priority}</span>
                    <div class="text-[10px] text-zinc-500 mt-1">{bucketReason(item)}</div>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

  </div>
</div>
