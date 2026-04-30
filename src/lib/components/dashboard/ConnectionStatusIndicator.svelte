<script lang="ts">
  import type { Printer } from '$lib/types';

  /** Fixed top-right indicator showing file handler and direct-connection status. */
  export let fileHandlerState: { token: string; connected: boolean; checking: boolean };
  export let isDesktop: boolean;
  /** Set of printer serials currently connected via direct MQTT. */
  export let directConnected: Set<string>;
  /** All printers — used to compute how many have a serial configured. */
  export let printers: Printer[];
</script>

<!-- Status Indicator (Top-right corner) -->
<div class="fixed top-8 right-8 lg:top-10 lg:right-10 z-50 flex flex-col gap-1.5 items-end">
  <!-- File Handler row -->
  <div class="flex items-center gap-2.5 bg-zinc-50/80 dark:bg-[#0c0c0f]/80 backdrop-blur-xl border border-zinc-200/60 dark:border-[#1a1a22] rounded-xl px-4 py-2 shadow-sm">
    {#if fileHandlerState.checking}
      <div class="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></div>
      <span class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide">Checking...</span>
    {:else if fileHandlerState.connected}
      <div class="w-2 h-2 rounded-full bg-emerald-400 status-glow-green"></div>
      <span class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide">File Handler Online</span>
    {:else if fileHandlerState.token}
      <div class="w-2 h-2 rounded-full bg-amber-400"></div>
      <span class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide">File Handler Offline</span>
    {:else}
      <div class="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
      <span class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide">Not Configured</span>
    {/if}
  </div>

  <!-- Transport mode row (desktop only) -->
  {#if isDesktop}
    {@const directCount = directConnected.size}
    {@const totalWithSerial = printers.filter((p: any) => p.printer_serial).length}
    <div class="flex items-center gap-2.5 bg-zinc-50/80 dark:bg-[#0c0c0f]/80 backdrop-blur-xl border border-zinc-200/60 dark:border-[#1a1a22] rounded-xl px-4 py-2 shadow-sm">
      {#if directCount > 0}
        <div class="w-2 h-2 rounded-full bg-violet-400 status-glow-violet"></div>
        <span class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide">
          {directCount}/{totalWithSerial} Direct
        </span>
      {:else}
        <div class="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
        <span class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide">Pi Only</span>
      {/if}
    </div>
  {/if}
</div>
