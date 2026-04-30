<script lang="ts">
  import { shine } from '$lib/actions/shine';
  import { getPrinterImage } from '$lib/utils/printerImage';
  import { getActivePrintJob, getLoadedSpool } from '$lib/utils/printerData';
  import { getProgress } from '$lib/utils/time';
  import type { Printer, Spool, PrintModule, PrintJobExtended, PiStatus } from '$lib/types';

  /** The printer to display. Must be defined — caller guards against undefined. */
  export let printer: Printer;
  /** Live Pi/MQTT status for this printer, if available. */
  export let piLive: PiStatus | undefined;
  export let liveIsStarting: boolean;
  export let activePrintJobs: PrintJobExtended[];
  export let spools: Spool[];
  export let printModules: PrintModule[];
  /** Full start queue — used to compute this printer's queue position. */
  export let startQueue: any[]; // complex queue entry shape not yet in types.ts
  export let startQueueTotal: number;
  export let now: number;
  export let onSelect: () => void;

  $: liveIsPrinting = !!piLive && ['RUNNING', 'PREPARE', 'PAUSE'].includes(piLive.gcode_state);
</script>

<!-- Active Printer Card -->
<button
  use:shine
  onclick={onSelect}
  class="group relative bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
         rounded-xl p-3 card-lift card-shine
         flex flex-col items-center justify-center overflow-hidden min-h-0"
>
  <!-- Status Indicator — larger, with glow -->
  <div class="absolute top-3 right-3">
    {#if liveIsStarting}
      <div class="w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse"></div>
    {:else if liveIsPrinting || printer.status === 'printing'}
      {@const activePrintForDot = getActivePrintJob(Number(printer.id), activePrintJobs)}
      {@const progressForDot = activePrintForDot ? getProgress(Number(activePrintForDot.start_time), Number(activePrintForDot.expected_time), now) : 0}
      {#if progressForDot >= 100}
        <div class="w-2.5 h-2.5 bg-violet-500 rounded-full status-glow-violet"></div>
      {:else}
        {@const spoolForDot = printer.loaded_spool_id ? getLoadedSpool(printer.loaded_spool_id, spools) : null}
        {@const weightAfterPrint = spoolForDot ? (spoolForDot as any).remaining_weight - (activePrintForDot?.expected_weight || 0) : 0}
        {@const compatModules = printModules.filter((m: any) => {
          if (m.printer_model_id && printer.printer_model_id && m.printer_model_id !== printer.printer_model_id) return false;
          const hasPreset = m.default_spool_preset_id !== null;
          const presetOk = spoolForDot && (spoolForDot as any).preset_id === m.default_spool_preset_id;
          return !hasPreset || presetOk;
        })}
        {@const minWeight = compatModules.length > 0
          ? Math.min(...compatModules.map((m: any) => m.expected_weight))
          : Infinity}
        {@const printsPossible = minWeight > 0 && minWeight !== Infinity
          ? Math.floor(weightAfterPrint / minWeight)
          : 0}
        {#if !spoolForDot || printsPossible <= 0}
          <div class="w-2.5 h-2.5 bg-red-500 rounded-full status-glow-red"></div>
        {:else if printsPossible === 1}
          <div class="w-2.5 h-2.5 bg-yellow-500 rounded-full status-glow-yellow"></div>
        {:else}
          <div class="w-2.5 h-2.5 bg-green-500 rounded-full status-glow-green"></div>
        {/if}
      {/if}
    {:else if printer.status === 'IDLE'}
      {@const loadedSpoolForDot = printer.loaded_spool_id ? getLoadedSpool(printer.loaded_spool_id, spools) : null}
      {@const remainingWeight = loadedSpoolForDot ? (loadedSpoolForDot as any).remaining_weight : 0}
      {@const compatibleModules = printModules.filter((m: any) => {
        if (m.printer_model_id && printer.printer_model_id && m.printer_model_id !== printer.printer_model_id) return false;
        const moduleHasPresetPreference = m.default_spool_preset_id !== null;
        const presetMatches = loadedSpoolForDot && (loadedSpoolForDot as any).preset_id === m.default_spool_preset_id;
        return !moduleHasPresetPreference || presetMatches;
      })}
      {@const minModuleWeight = compatibleModules.length > 0
        ? Math.min(...compatibleModules.map((m: any) => m.expected_weight))
        : Infinity}
      {@const maxPrintsPossible = minModuleWeight > 0 && minModuleWeight !== Infinity
        ? Math.floor(remainingWeight / minModuleWeight)
        : 0}
      {#if !loadedSpoolForDot}
        <div class="w-2.5 h-2.5 bg-red-500 rounded-full status-glow-red"></div>
      {:else if maxPrintsPossible === 0}
        <div class="w-2.5 h-2.5 bg-red-500 rounded-full status-glow-red"></div>
      {:else if maxPrintsPossible === 1}
        <div class="w-2.5 h-2.5 bg-yellow-500 rounded-full status-glow-yellow"></div>
      {:else}
        <div class="w-2.5 h-2.5 bg-green-500 rounded-full status-glow-green"></div>
      {/if}
    {:else if printer.status === 'BROKEN'}
      <div class="w-2.5 h-2.5 bg-red-500 rounded-full status-glow-red animate-pulse"></div>
    {:else}
      <div class="w-2.5 h-2.5 bg-zinc-400 dark:bg-zinc-600 rounded-full"></div>
    {/if}
  </div>

  <!-- Printer Image -->
  <div class="flex-1 flex items-center justify-center min-h-0 w-full group-hover:scale-[1.03] transition-transform duration-500 ease-out">
    <img
      src={getPrinterImage(printer.model)}
      alt="Printer"
      class="max-h-full max-w-full object-contain opacity-80 group-hover:opacity-100 transition-opacity duration-500"
    />
  </div>

  <!-- Printer Name & Status -->
  <div class="w-full text-center border-t border-zinc-200/60 dark:border-[#1a1a22] pt-2 mt-2 min-h-0 flex-shrink-0">
    <h3 class="text-[clamp(0.55rem,2vw,0.875rem)] font-medium text-zinc-900 dark:text-zinc-100 truncate px-1 tracking-tight">{printer.name}</h3>
    <p class="text-[clamp(0.4rem,1.5vw,0.7rem)] font-light tracking-wide uppercase mt-0.5">
      {#if liveIsStarting}
        {@const qPos = startQueue.findIndex((e: any) => e.printer.printer_serial === printer.printer_serial)}
        <span class="text-amber-500 dark:text-amber-400">
          {qPos === 0 ? 'Starting…' : `Queue ${qPos + 1}/${startQueueTotal}`}
        </span>
      {:else if liveIsPrinting || printer.status === 'printing'}
        <span class="text-blue-500 dark:text-blue-400">Printing</span>
      {:else if printer.status === 'IDLE'}
        <span class="text-emerald-500 dark:text-emerald-400">Idle</span>
      {:else if printer.status === 'BROKEN'}
        <span class="text-red-500 dark:text-red-400">Broken</span>
      {:else}
        <span class="text-zinc-400 dark:text-zinc-500">{printer.status}</span>
      {/if}
    </p>

    <!-- Progress Bar for Active Prints -->
    {#if liveIsStarting}
      {@const qPos = startQueue.findIndex((e: any) => e.printer.printer_serial === printer.printer_serial)}
      <div class="mt-2 px-1">
        <div class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1 overflow-hidden">
          <div class="bg-amber-400 h-full rounded-full progress-shimmer w-full opacity-70"></div>
        </div>
        <p class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-zinc-400 dark:text-zinc-500 mt-1">
          {qPos === 0 ? 'Sending to printer…' : 'In queue…'}
        </p>
      </div>
    {:else if liveIsPrinting || printer.status === 'printing'}
      {@const activePrint = getActivePrintJob(Number(printer.id), activePrintJobs)}
      {#if activePrint}
        {@const progress = piLive ? piLive.progress : getProgress(Number(activePrint.start_time), Number(activePrint.expected_time), now)}
        <div class="mt-2 px-1">
          <div class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1 overflow-hidden">
            <div
              class="{progress >= 100 ? 'bg-violet-500' : 'bg-blue-500'} h-full rounded-full transition-all duration-500 progress-shimmer"
              style="width: {Math.min(progress, 100)}%"
            ></div>
          </div>
          <p class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-zinc-400 dark:text-zinc-500 mt-1 tabular-nums">
            {#if piLive}{piLive.label}{:else}{progress}%{/if}
          </p>
        </div>
      {:else if piLive}
        <!-- External / un-reconciled print: show whatever Pi gives us -->
        <div class="mt-2 px-1">
          {#if piLive.subtask_name}
            <p class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-zinc-500 dark:text-zinc-400 truncate mb-1">{piLive.subtask_name}</p>
          {/if}
          <div class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1 overflow-hidden">
            <div class="bg-blue-500 h-full rounded-full transition-all duration-500 progress-shimmer" style="width: {Math.min(piLive.progress, 100)}%"></div>
          </div>
          <p class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-zinc-400 dark:text-zinc-500 mt-1 tabular-nums">{piLive.label}</p>
        </div>
      {/if}
    {/if}
  </div>
</button>
