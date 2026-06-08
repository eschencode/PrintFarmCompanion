<script lang="ts">
    import { shine } from "$lib/actions/shine";
    import { getPrinterImage } from "$lib/utils/printerImage";
    import { getProgress } from "$lib/utils/time";
    import { getActivePrintJob } from "$lib/utils/printerData";
    import { resolveSpoolColor } from "$lib/utils/spoolColor";
    import {
        printingEffect,
        stateColors,
        hexToRgb,
    } from "$lib/stores/dashboardPrefs";
    import SpoolGauge from "$lib/components/dashboard/SpoolGauge.svelte";
    import type {
        DashboardPrinter,
        PrintModuleFull,
        PrintJobFull,
        PiStatus,
    } from "$lib/types";

    /** The printer to display. Must be defined — caller guards against undefined. */
    export let printer: DashboardPrinter;
    /** Live Pi/MQTT status for this printer, if available. */
    export let piLive: PiStatus | undefined;
    export let liveIsStarting: boolean;
    export let activePrintJobs: PrintJobFull[];
    export let printModules: PrintModuleFull[];
    /** Full start queue — used to compute this printer's queue position. */
    export let startQueue: any[]; // complex queue entry shape not yet in types.ts
    export let now: number;
    export let onSelect: () => void;

    $: liveIsPrinting =
        !!piLive &&
        ["RUNNING", "PREPARE", "PAUSE"].includes(piLive.gcode_state);

    // Single source of truth for the card's visual status — drives the dot and tint.
    $: cardStatus = liveIsStarting
        ? "starting"
        : liveIsPrinting || printer.status === "printing"
          ? "printing"
          : printer.status; // 'finished' | 'idle' | 'inactive'

    // Per-status colour config (customisable in settings). Drives the tint/effect.
    $: stateCfg = ($stateColors as Record<string, { color: string; enabled: boolean }>)[cardStatus];
    $: tintEnabled = !!stateCfg?.enabled;
    $: tintRgb = stateCfg ? hexToRgb(stateCfg.color) : "113, 113, 122";
    $: ringShadow = `inset 0 0 0 1.5px rgba(${tintRgb}, 0.4)`;

    // Live print progress (0–100) — drives the "progress" printing effect.
    $: printProgress =
        cardStatus !== "printing"
            ? 0
            : piLive
              ? Math.min(100, piLive.progress)
              : (() => {
                    const job = getActivePrintJob(
                        Number(printer.id),
                        activePrintJobs,
                    );
                    return job
                        ? Math.min(
                              100,
                              getProgress(
                                  Number(job.start_time),
                                  Number((job as any).expected_time_minutes),
                                  now,
                              ),
                          )
                        : 0;
                })();

    // How many of the cheapest compatible modules this spool can still print.
    // Drives the gram-label colour: red = none left, amber = exactly one.
    function printsForSpool(spool: {
        preset_id: number | null;
        remaining_weight: number;
    }): number {
        const compat = printModules.filter((m) => {
            if (m.printer_preset_id !== printer.printer_preset_id) return false;
            const slot0 = m.filament_slots?.find((s) => s.slot_index === 0);
            if (!slot0) return true; // no filament requirement — any spool works
            return spool.preset_id === slot0.spool_preset_id;
        });
        if (compat.length === 0) return 0;
        const minW = Math.min(...compat.map((m) => m.weight));
        return minW > 0 ? Math.floor(spool.remaining_weight / minW) : 0;
    }
    function gramClass(spool: {
        preset_id: number | null;
        remaining_weight: number;
    }): string {
        const n = printsForSpool(spool);
        return n <= 0
            ? "text-red-500 dark:text-red-400"
            : n === 1
              ? "text-amber-500 dark:text-amber-400"
              : "text-zinc-500 dark:text-zinc-300";
    }
</script>

<!-- Active Printer Card -->
<button
    use:shine
    onclick={onSelect}
    class="group relative bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22]
         rounded-xl p-3 card-lift card-shine
         flex flex-col items-center justify-center overflow-hidden min-h-0"
>
    <!-- Status background (colours customisable in dashboard settings). Printing
         uses the chosen animated effect; other statuses get a flat tint + ring.
         All effects sit behind the printer image (this layer is below z-[1]). -->
    {#if cardStatus === "printing" && tintEnabled}
        {#if $printingEffect === "aurora"}
            <div
                class="absolute inset-0 rounded-xl pointer-events-none printing-aurora"
                style="--c-rgb: {tintRgb}; box-shadow: {ringShadow};"
            ></div>
        {:else if $printingEffect === "breathing"}
            <div
                class="absolute inset-0 rounded-xl pointer-events-none printing-breathe"
                style="--c-rgb: {tintRgb}; box-shadow: {ringShadow};"
            ></div>
        {:else if $printingEffect === "scan"}
            <div
                class="absolute inset-0 rounded-xl pointer-events-none overflow-hidden"
                style="--c-rgb: {tintRgb}; background-color: rgba({tintRgb}, 0.05); box-shadow: {ringShadow};"
            >
                <div class="printing-scan"></div>
            </div>
        {:else if $printingEffect === "progress"}
            <div
                class="absolute inset-0 rounded-xl pointer-events-none overflow-hidden"
                style="box-shadow: {ringShadow};"
            >
                <div
                    class="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
                    style="width: {printProgress}%; background-color: rgba({tintRgb}, 0.15);"
                ></div>
            </div>
        {:else}
            <!-- solid -->
            <div
                class="absolute inset-0 rounded-xl pointer-events-none"
                style="background-color: rgba({tintRgb}, 0.10); box-shadow: {ringShadow};"
            ></div>
        {/if}
    {:else if cardStatus !== "printing" && tintEnabled}
        <div
            class="absolute inset-0 rounded-xl pointer-events-none"
            style="background-color: rgba({tintRgb}, 0.10); box-shadow: {ringShadow};"
        ></div>
    {/if}

    <!-- Printer Image with vertical spool gauges on the left -->
    <div class="relative z-[1] flex-1 flex items-stretch justify-center min-h-0 w-full gap-2">
        {#if printer.loaded_spools && printer.loaded_spools.length > 0}
            {@const slots = [...printer.loaded_spools].sort((a, b) => a.slot_index - b.slot_index)}
            <div class="flex items-stretch gap-2 py-2 shrink-0">
                {#each slots as slot (slot.slot_index)}
                    {#if slot.spool}
                        <div
                            class="flex flex-col items-center h-full gap-1"
                            title="Slot {slot.slot_index + 1}: {slot.spool.preset?.brand ?? ''} {slot.spool.preset?.material ?? ''} {slot.spool.preset?.color ?? ''} — {slot.spool.remaining_weight}g"
                        >
                            <SpoolGauge
                                remaining={slot.spool.remaining_weight}
                                initial={slot.spool.initial_weight}
                                color={resolveSpoolColor(slot.spool.preset)}
                                orientation="vertical"
                                size="lg"
                                showLabel={false}
                            />
                            <span
                                class="shrink-0 leading-none font-medium tabular-nums text-[clamp(0.4rem,1.2vw,0.6rem)] {gramClass(slot.spool)}"
                            >
                                {slot.spool.remaining_weight}
                            </span>
                        </div>
                    {:else}
                        <div
                            class="w-2.5 my-2 self-stretch rounded-full border border-dashed border-zinc-300 dark:border-zinc-700"
                            title="Slot {slot.slot_index + 1}: empty"
                        ></div>
                    {/if}
                {/each}
            </div>
        {/if}

        <div
            class="flex-1 flex items-center justify-center min-h-0 group-hover:scale-[1.03] transition-transform duration-500 ease-out"
        >
            <img
                src={getPrinterImage(printer.preset?.model)}
                alt="Printer"
                class="max-h-full max-w-full object-contain opacity-80 group-hover:opacity-100 transition-opacity duration-500"
            />
        </div>
    </div>

    <!-- Printer Name & Status -->
    <div
        class="relative z-[1] w-full text-center border-t border-zinc-200/60 dark:border-[#1a1a22] pt-2 mt-2 min-h-0 flex-shrink-0"
    >
        <h3
            class="text-[clamp(0.55rem,2vw,0.875rem)] font-medium text-zinc-900 dark:text-zinc-100 truncate px-1 tracking-tight"
        >
            {printer.name}
        </h3>

        <!-- Reserved progress area — fixed min-height keeps the name at a
             consistent height across idle / printing / finished cards. -->
        <div class="mt-2 min-h-[26px]">
        {#if liveIsStarting}
            {@const qPos = startQueue.findIndex(
                (e: any) => Number(e.printer.id) === Number(printer.id),
            )}
            <div class="px-1">
                <div
                    class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1 overflow-hidden"
                >
                    <div
                        class="bg-amber-400 h-full rounded-full progress-shimmer w-full opacity-70"
                    ></div>
                </div>
                <p
                    class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-zinc-400 dark:text-zinc-500 mt-1"
                >
                    {qPos === 0 ? "Sending to printer…" : "In queue…"}
                </p>
            </div>
        {:else if printer.status === "finished"}
            <div class="px-1">
                <div
                    class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1 overflow-hidden"
                >
                    <div
                        class="bg-violet-500 h-full rounded-full w-full progress-shimmer"
                    ></div>
                </div>
                <p
                    class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-violet-500/80 dark:text-violet-400/80 mt-1 tabular-nums"
                >
                    100%
                </p>
            </div>
        {:else if liveIsPrinting || printer.status === "printing"}
            {@const activePrint = getActivePrintJob(
                Number(printer.id),
                activePrintJobs,
            )}
            {#if activePrint}
                {@const progress = piLive
                    ? piLive.progress
                    : getProgress(
                          Number(activePrint.start_time),
                          Number((activePrint as any).expected_time_minutes),
                          now,
                      )}
                <div class="px-1">
                    <div
                        class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1 overflow-hidden"
                    >
                        <div
                            class="{progress >= 100
                                ? 'bg-violet-500'
                                : 'bg-blue-500'} h-full rounded-full transition-all duration-500 progress-shimmer"
                            style="width: {Math.min(progress, 100)}%"
                        ></div>
                    </div>
                    <p
                        class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-zinc-400 dark:text-zinc-500 mt-1 tabular-nums"
                    >
                        {#if piLive}{piLive.label}{:else}{progress}%{/if}
                    </p>
                </div>
            {:else if piLive}
                <!-- External / un-reconciled print: show whatever Pi gives us -->
                <div class="px-1">
                    {#if piLive.subtask_name}
                        <p
                            class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-zinc-500 dark:text-zinc-400 truncate mb-1"
                        >
                            {piLive.subtask_name}
                        </p>
                    {/if}
                    <div
                        class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1 overflow-hidden"
                    >
                        <div
                            class="bg-blue-500 h-full rounded-full transition-all duration-500 progress-shimmer"
                            style="width: {Math.min(piLive.progress, 100)}%"
                        ></div>
                    </div>
                    <p
                        class="text-[clamp(0.35rem,1.2vw,0.6rem)] text-zinc-400 dark:text-zinc-500 mt-1 tabular-nums"
                    >
                        {piLive.label}
                    </p>
                </div>
            {/if}
        {/if}
        </div>
    </div>
</button>
