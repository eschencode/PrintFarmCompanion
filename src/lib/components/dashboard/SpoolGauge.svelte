<script lang="ts">
  /**
   * Visual representation of how much filament is left on a spool.
   * Renders a fill bar tinted with the spool's real colour plus the remaining grams.
   * Orientation "horizontal" (modals) fills left→right; "vertical" (cards) fills bottom→up.
   */
  export let remaining: number;
  /** Full weight of the spool when added. Falls back to remaining if 0/unknown. */
  export let initial: number = 0;
  /** Hex colour of the filament; used to tint the fill. */
  export let color: string | null = null;
  export let size: 'sm' | 'lg' = 'sm';
  export let orientation: 'horizontal' | 'vertical' = 'horizontal';
  /** Optional projected weight after the current/next print — drawn as a marker. */
  export let projected: number | null = null;
  /** Show the gram label next to/under the bar. */
  export let showLabel: boolean = true;

  // Clamp the *fill* not the number — real-world tare/refills can exceed capacity.
  $: capacity = initial > 0 ? initial : Math.max(remaining, 1);
  $: pct = Math.max(0, Math.min(100, (remaining / capacity) * 100));
  $: projectedPct =
    projected != null ? Math.max(0, Math.min(100, (projected / capacity) * 100)) : null;

  // Low-filament warning is colour-agnostic so it reads on any tint.
  $: isLow = pct <= 12 || remaining <= 40;
  $: isCritical = pct <= 5 || remaining <= 15;

  $: fill = color && /^#?[0-9a-fA-F]{3,8}$/.test(color)
    ? (color.startsWith('#') ? color : `#${color}`)
    : '#9ca3af';

  $: labelClass = isCritical
    ? 'text-red-500 dark:text-red-400'
    : isLow
      ? 'text-amber-500 dark:text-amber-400'
      : 'text-zinc-600 dark:text-zinc-300';
</script>

{#if orientation === 'vertical'}
  <div class="flex flex-col items-center gap-1 h-full">
    <div
      class="relative flex-1 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800
             border border-zinc-300/40 dark:border-white/10
             {size === 'lg' ? 'w-2.5' : 'w-1.5'}"
    >
      <!-- Fill grows from the bottom -->
      <div
        class="absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-500 ease-out
               {isCritical ? 'animate-pulse' : ''}"
        style="height: {pct}%; background-color: {fill};
               box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);"
      ></div>

      <!-- Striped band = filament the running print is expected to consume -->
      {#if projectedPct != null && projectedPct < pct}
        <div
          class="gauge-stripe absolute inset-x-0 rounded-full"
          style="bottom: {projectedPct}%; height: {pct - projectedPct}%;"
          title="Print will use {Math.round(remaining - (projected ?? 0))}g → {projected}g left"
        ></div>
      {/if}
    </div>

    {#if showLabel}
      <span class="shrink-0 tabular-nums font-medium leading-none {labelClass}
                   {size === 'lg' ? 'text-xs' : 'text-[clamp(0.35rem,1.1vw,0.55rem)]'}">
        {Math.round(remaining)}
      </span>
    {/if}
  </div>
{:else}
  <div class="flex items-center gap-2 w-full {size === 'lg' ? 'gap-3' : ''}">
    <div
      class="relative flex-1 min-w-0 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800
             border border-zinc-300/40 dark:border-white/10
             {size === 'lg' ? 'h-2.5' : 'h-1.5'}"
    >
      <div
        class="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out
               {isCritical ? 'animate-pulse' : ''}"
        style="width: {pct}%; background-color: {fill};
               box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);"
      ></div>

      {#if projectedPct != null && projectedPct < pct}
        <div
          class="gauge-stripe absolute inset-y-0 rounded-full"
          style="left: {projectedPct}%; width: {pct - projectedPct}%;"
          title="Print will use {Math.round(remaining - (projected ?? 0))}g → {projected}g left"
        ></div>
      {/if}
    </div>

    {#if showLabel}
      <span
        class="shrink-0 tabular-nums font-medium {labelClass}
               {size === 'lg' ? 'text-sm' : 'text-[clamp(0.4rem,1.3vw,0.65rem)]'}"
      >
        {Math.round(remaining)}g
      </span>
    {/if}
  </div>
{/if}

<style>
  /* Static barber-pole hatch over the colour fill: semi-transparent so the
     spool's tint still reads through. Marks filament the running print will use. */
  .gauge-stripe {
    background-image: repeating-linear-gradient(
      45deg,
      rgba(0, 0, 0, 0.25) 0 3px,
      rgba(255, 255, 255, 0.3) 3px 6px
    );
  }
</style>
