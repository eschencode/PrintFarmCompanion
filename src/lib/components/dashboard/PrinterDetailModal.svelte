<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { formatTime, formatRemainingTime, getElapsedTime, getRemainingTime, getProgress } from '$lib/utils/time';
  import { getLastPrintJob } from '$lib/utils/printerData';
  import type { DashboardPrinter, SpoolWithPreset, PrintModuleFull, PrintJobWithDetails, PiStatus } from '$lib/types';

  /**
   * Detail modal for a selected printer. Shows real-time print status when printing,
   * idle info and action buttons when idle, and repair controls when broken.
   */
  export let printer: DashboardPrinter;
  export let activePrintJob: PrintJobWithDetails | undefined;
  export let loadedSpool: SpoolWithPreset | null;
  /** Live Pi/MQTT status for this printer — drives real-time progress and temps. */
  export let piLive: PiStatus | undefined;
  export let controlLoading: string | null;
  /** Set of printer IDs currently being started — disables start buttons. */
  export let startingPrinterIds: Set<number>;
  export let now: number;
  export let printJobs: PrintJobWithDetails[];
  export let printModules: PrintModuleFull[];
  export let onClose: () => void;
  export let onLoadSpool: () => void;
  export let onStartPrint: () => void;
  export let onPrintFailed: () => void;
  export let onSendControl: (action: string, printerId: number) => Promise<void>;
  export let onToggleBroken: (printer: DashboardPrinter, broken: boolean) => void;
  export let onEnqueue: (module: PrintModuleFull, printer: DashboardPrinter) => void;
  /** enhance callback defined in parent — closes over selectedPrinter, data, and closePrinterModal. */
  export let completePrintSuccessEnhance: SubmitFunction;
</script>

<div
  class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6 border-0 cursor-default"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="button"
  tabindex="0"
  aria-label="Close modal (press Escape)"
>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-panel bg-white dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/20"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
  >
    <div class="p-8">
      <!-- Modal Header -->
      <div class="flex justify-between items-start mb-8">
        <div>
          <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">{printer.name}</h2>
          <p class="text-sm text-zinc-400 dark:text-zinc-600 mt-1 tracking-wide">{printer.preset?.brand ?? ''} {printer.preset?.model ?? ''}</p>
        </div>
        <button
          onclick={onClose}
          class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
          aria-label="Close modal"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Status Badge -->
      <div class="mb-8">
        {#if printer.status === 'printing'}
          <span class="inline-flex items-center gap-2.5 px-4 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-sm font-light tracking-wide">
            <div class="w-2 h-2 bg-blue-500 rounded-full status-glow-blue"></div>
            Printing
          </span>
        {:else if printer.status === 'idle'}
          <span class="inline-flex items-center gap-2.5 px-4 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full text-sm font-light tracking-wide">
            <div class="w-2 h-2 bg-emerald-500 rounded-full status-glow-green"></div>
            Idle
          </span>
        {:else if printer.status === 'inactive'}
          <span class="inline-flex items-center gap-2.5 px-4 py-1.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded-full text-sm font-light tracking-wide">
            <div class="w-2 h-2 bg-red-500 rounded-full status-glow-red animate-pulse"></div>
            Broken / Under Repair
          </span>
        {/if}
      </div>

      <!-- Conditional Content Based on Status -->
      {#if printer.status === 'printing' && activePrintJob}
        <!-- PRINTING STATUS MENU -->
        {@const displayProgress = piLive?.progress ?? ((activePrintJob.progress ?? 0) > 0 ? (activePrintJob.progress ?? 0) : getProgress(activePrintJob.start_time, activePrintJob.expected_time_minutes ?? 0, now))}
        <div class="space-y-5">
          <!-- Module Name -->
          <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
            <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1.5 tracking-wide uppercase">Print Module</p>
            <p class="text-xl text-zinc-900 dark:text-zinc-50 font-light tracking-tight">{activePrintJob.module_name}</p>
            {#if piLive}
              <p class="text-xs text-blue-500 mt-1">{piLive.label}</p>
            {/if}
          </div>

          <!-- Print Progress -->
          <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
            <div class="flex justify-between text-sm mb-3">
              <span class="text-zinc-400 dark:text-zinc-600 tracking-wide">Progress</span>
              <span class="text-zinc-900 dark:text-zinc-50 font-medium tabular-nums">{displayProgress}%</span>
            </div>
            <div class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                class="bg-blue-500 h-full rounded-full transition-all duration-500 progress-shimmer"
                style="width: {displayProgress}%"
              ></div>
            </div>
            <div class="flex justify-between text-xs text-zinc-400 dark:text-zinc-600 mt-3 tabular-nums">
              <span>{getElapsedTime(activePrintJob.start_time, now)} elapsed</span>
              {#if (piLive?.total_layer_num ?? 0) > 0}
                <span>Layer {piLive?.layer_num} / {piLive?.total_layer_num}</span>
              {:else}
                <span>{getRemainingTime(activePrintJob.start_time, activePrintJob.expected_time_minutes ?? 0, now)} remaining</span>
              {/if}
            </div>
          </div>

          <!-- Live Temps + Remaining Time (from Pi) -->
          {#if piLive && (piLive.remaining_time != null || piLive.nozzle_temp != null)}
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-4 border border-zinc-100 dark:border-[#1a1a22]">
              <div class="flex flex-wrap gap-5">
                {#if piLive.remaining_time != null && piLive.remaining_time > 0}
                  <div>
                    <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase">Remaining</p>
                    <p class="text-base text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{formatRemainingTime(piLive.remaining_time)}</p>
                  </div>
                {/if}
                {#if piLive.nozzle_temp != null}
                  <div>
                    <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase">Nozzle</p>
                    <p class="text-base text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{Math.round(piLive.nozzle_temp)}°C</p>
                  </div>
                {/if}
                {#if piLive.bed_temp != null}
                  <div>
                    <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase">Bed</p>
                    <p class="text-base text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{Math.round(piLive.bed_temp)}°C</p>
                  </div>
                {/if}
                {#if piLive.chamber_temp != null}
                  <div>
                    <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase">Chamber</p>
                    <p class="text-base text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{Math.round(piLive.chamber_temp)}°C</p>
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Time Info -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-4 border border-zinc-100 dark:border-[#1a1a22]">
              <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1.5 tracking-wide uppercase">Total Time</p>
              <p class="text-lg text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{formatTime(activePrintJob.expected_time_minutes ?? 0)}</p>
            </div>
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-4 border border-zinc-100 dark:border-[#1a1a22]">
              <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1.5 tracking-wide uppercase">Remaining</p>
              <p class="text-lg text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{getRemainingTime(activePrintJob.start_time, activePrintJob.expected_time_minutes ?? 0, now)}</p>
            </div>
          </div>

          <!-- Spool Weight Info -->
          {#if loadedSpool}
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
              <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-4 tracking-wide uppercase">Spool Weight</p>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1">Before Print</p>
                  <p class="text-xl text-zinc-900 dark:text-zinc-50 font-light tabular-nums">{loadedSpool.remaining_weight}g</p>
                </div>
                <div>
                  <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-1">Expected After</p>
                  <p class="text-xl text-blue-500 dark:text-blue-400 font-light tabular-nums">{Math.max(0, loadedSpool.remaining_weight - (activePrintJob.module_weight ?? 0)).toFixed(1)}g</p>
                </div>
              </div>
              <div class="mt-4 pt-4 border-t border-zinc-200/60 dark:border-[#1a1a22]">
                <div class="flex justify-between text-xs">
                  <span class="text-zinc-400 dark:text-zinc-600">Material Usage</span>
                  <span class="text-amber-500 font-medium tabular-nums">{activePrintJob.module_weight ?? 0}g</span>
                </div>
              </div>
            </div>
          {:else}
            <div class="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
              <p class="text-sm text-red-500 dark:text-red-400 font-light">No spool loaded</p>
            </div>
          {/if}

          <!-- Pi Controls (Cancel / Pause / Resume) — only if printer has Pi credentials -->
          {#if printer?.printer_ip && printer?.printer_serial && printer?.printer_access_code}
            <div class="grid grid-cols-2 gap-3 pt-1">
              <button
                disabled={!!controlLoading}
                onclick={async () => { await onSendControl('cancel', printer.id); }}
                class="bg-red-500/8 hover:bg-red-500/15 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl transition-all duration-200 font-medium border border-red-500/10 hover:border-red-500/20 text-sm disabled:opacity-50"
              >
                {controlLoading === 'cancel' ? 'Cancelling…' : 'Cancel Print'}
              </button>
              {#if piLive?.gcode_state === 'PAUSE'}
                <button
                  disabled={!!controlLoading}
                  onclick={async () => { await onSendControl('resume', printer.id); }}
                  class="bg-blue-500/8 hover:bg-blue-500/15 text-blue-600 dark:text-blue-400 px-4 py-3 rounded-xl transition-all duration-200 font-medium border border-blue-500/10 hover:border-blue-500/20 text-sm disabled:opacity-50"
                >
                  {controlLoading === 'resume' ? 'Resuming…' : 'Resume'}
                </button>
              {:else}
                <button
                  disabled={!!controlLoading}
                  onclick={async () => { await onSendControl('pause', printer.id); }}
                  class="bg-amber-500/8 hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 px-4 py-3 rounded-xl transition-all duration-200 font-medium border border-amber-500/10 hover:border-amber-500/20 text-sm disabled:opacity-50"
                >
                  {controlLoading === 'pause' ? 'Pausing…' : 'Pause'}
                </button>
              {/if}
            </div>
          {/if}

          <!-- Manual Override Buttons -->
          <div class="grid grid-cols-2 gap-4 pt-3">
            <button
              onclick={onPrintFailed}
              class="w-full bg-red-500/8 hover:bg-red-500/15 text-red-600 dark:text-red-400 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium border border-red-500/10 hover:border-red-500/20"
            >
              Print Failed
            </button>

            <form
              method="POST"
              action="?/completePrint"
              use:enhance={completePrintSuccessEnhance}
            >
              <input type="hidden" name="jobId" value={activePrintJob.id} />
              <input type="hidden" name="success" value="true" />
              <input type="hidden" name="actualWeight" value={activePrintJob.module_weight ?? 0} />

              <button
                type="submit"
                class="w-full bg-emerald-500/8 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium border border-emerald-500/10 hover:border-emerald-500/20"
              >
                Print Successful
              </button>
            </form>
          </div>
        </div>

      {:else if printer.status === 'idle'}
        <!-- IDLE STATUS MENU -->
        {@const lastPrintJob = getLastPrintJob(printer.id, printJobs)}
        <div class="space-y-5">

          <!-- Loaded Spool Info -->
          {#if loadedSpool}
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
              <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-4 tracking-wide uppercase">Loaded Spool</p>
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-sm text-zinc-400 dark:text-zinc-600">Name</span>
                  <span class="text-base text-zinc-900 dark:text-zinc-100 font-medium">
                    {loadedSpool.preset?.brand ?? ''} {loadedSpool.preset?.material ?? ''}
                  </span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-zinc-400 dark:text-zinc-600">Color</span>
                  <span class="text-base text-zinc-900 dark:text-zinc-100">{loadedSpool.preset?.color || 'N/A'}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-zinc-400 dark:text-zinc-600">Remaining Weight</span>
                  <span class="text-lg text-emerald-500 dark:text-emerald-400 font-medium tabular-nums">{loadedSpool.remaining_weight}g</span>
                </div>
              </div>
            </div>
          {:else}
            <div class="bg-amber-500/5 border border-amber-500/10 rounded-xl p-5">
              <p class="text-sm text-amber-600 dark:text-amber-400 font-light">No spool loaded</p>
              <p class="text-xs text-zinc-400 dark:text-zinc-600 mt-1">Load a spool to start printing</p>
            </div>
          {/if}

          <!-- Last Print Info -->
          {#if lastPrintJob}
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
              <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-3 tracking-wide uppercase">Last Printed Module</p>
              <div class="flex justify-between items-center">
                <span class="text-base text-zinc-900 dark:text-zinc-100 font-medium">{lastPrintJob.module_name || 'Unknown'}</span>
                {#if lastPrintJob.status == 'successful'}
                  <span class="inline-flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400 text-xs font-medium">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                    Success
                  </span>
                {:else}
                  <span class="inline-flex items-center gap-1.5 text-red-500 dark:text-red-400 text-xs font-medium">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    Failed
                  </span>
                {/if}
              </div>
              {#if lastPrintJob.status !== 'successful' && lastPrintJob.failure_reason}
                <p class="text-xs text-red-500/70 dark:text-red-400/60 mt-3 pt-3 border-t border-zinc-200/60 dark:border-[#1a1a22]">
                  {lastPrintJob.failure_reason}
                </p>
              {/if}
            </div>
          {:else}
            <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]">
              <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-3 tracking-wide uppercase">Last Printed Module</p>
              <p class="text-sm text-zinc-400 dark:text-zinc-600">No previous prints</p>
            </div>
          {/if}

          <!-- Next Suggested Print -->
          {#if printer?.suggested_queue}
  {@const nextPrint = printer.suggested_queue.find((item: any) => item.status !== 'DONE')}
  {#if nextPrint}
    {@const matchingModule = printModules.find((m: any) => m.id === nextPrint.module_id)}
    <button
      type="button"
      disabled={startingPrinterIds.has(Number(printer.id))}
      onclick={() => matchingModule && onEnqueue(matchingModule, printer)}
      class="w-full text-left bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-5 mt-4 hover:bg-emerald-500/10 hover:border-emerald-500/25 transition-all duration-200 disabled:opacity-50"
    >
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
          </div>
          <div>
            <div class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase">Next Suggested Print</div>
            <div class="text-base text-zinc-900 dark:text-zinc-100 font-medium">{nextPrint.module_name}</div>
            <div class="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 tabular-nums">
              {nextPrint.weight_of_print}g · {nextPrint.priority}
            </div>
          </div>
        </div>
      </button>
  {/if}
{/if}
          <!-- Action Buttons -->
          <div class="grid grid-cols-2 gap-4 pt-4">
            <button
              onclick={onLoadSpool}
              class="bg-blue-500/8 hover:bg-blue-500/15 text-blue-600 dark:text-blue-400 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium border border-blue-500/10 hover:border-blue-500/20"
            >
              Load Spool
            </button>
            <button
              onclick={onStartPrint}
              class="bg-emerald-500/8 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium border border-emerald-500/10 hover:border-emerald-500/20"
            >
              Start Print
            </button>
          </div>
          <button
            disabled={controlLoading === 'marking-broken'}
            onclick={() => onToggleBroken(printer, true)}
            class="w-full bg-red-500/5 hover:bg-red-500/10 text-red-500/70 dark:text-red-400/60 hover:text-red-600 dark:hover:text-red-400 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm border border-red-500/8 hover:border-red-500/15 disabled:opacity-50"
          >
            {controlLoading === 'marking-broken' ? 'Marking as broken…' : 'Mark as Broken'}
          </button>
        </div>

      {:else if printer.status === 'inactive'}
        <!-- BROKEN STATUS MENU -->
        <div class="space-y-5">
          <div class="bg-red-500/5 border border-red-500/15 rounded-xl p-5">
            <p class="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Printer is under repair</p>
            <p class="text-xs text-zinc-400 dark:text-zinc-600">Downtime is being tracked from when this printer was marked broken. Mark as repaired to stop the downtime clock.</p>
          </div>
          <button
            disabled={controlLoading === 'marking-repaired'}
            onclick={() => onToggleBroken(printer, false)}
            class="w-full bg-emerald-500/8 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium border border-emerald-500/10 hover:border-emerald-500/20 disabled:opacity-50"
          >
            {controlLoading === 'marking-repaired' ? 'Marking as repaired…' : 'Mark as Repaired'}
          </button>
        </div>

      {:else}
        <!-- Fallback for other statuses -->
        <div class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22] text-center">
          <p class="text-zinc-400 dark:text-zinc-600">Status: {printer.status}</p>
        </div>
      {/if}
    </div>
  </div>
</div>
