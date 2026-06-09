<script lang="ts">
    import { enhance } from "$app/forms";
    import type { SubmitFunction } from "@sveltejs/kit";
    import {
        formatTime,
        formatRemainingTime,
        getElapsedTime,
        getRemainingTime,
        getProgress,
    } from "$lib/utils/time";
    import { getLastPrintJob } from "$lib/utils/printerData";
    import { resolveSpoolColor } from "$lib/utils/spoolColor";
    import SpoolGauge from "$lib/components/dashboard/SpoolGauge.svelte";
    import type {
        DashboardPrinter,
        PrintModuleFull,
        PrintJobWithDetails,
        PiStatus,
    } from "$lib/types";

    /**
     * Detail modal for a selected printer. Shows real-time print status when printing,
     * idle info and action buttons when idle, and repair controls when broken.
     */
    export let printer: DashboardPrinter;
    export let activePrintJob: PrintJobWithDetails | undefined;
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
    export let onSendControl: (
        action: string,
        printerId: number,
    ) => Promise<void>;
    export let onToggleBroken: (
        printer: DashboardPrinter,
        broken: boolean,
    ) => void;
    export let onEnqueue: (
        module: PrintModuleFull,
        printer: DashboardPrinter,
    ) => void;
    /** enhance callback defined in parent — closes over selectedPrinter, data, and closePrinterModal. */
    export let completePrintSuccessEnhance: SubmitFunction;
    /** enhance callback for manual spool weight deduction — refreshes data on success. */
    export let adjustWeightEnhance: SubmitFunction;

    // All loaded slots that actually hold a spool, ordered by slot index.
    $: loadedSlots = (printer.loaded_spools ?? [])
        .filter((s) => s.spool)
        .sort((a, b) => a.slot_index - b.slot_index);

    // Manual deduction targets one spool at a time, via a single slider. Default to
    // the first loaded slot; keep the selection valid as loaded spools change.
    let selectedSpoolId: number | null = null;
    $: if (
        loadedSlots.length > 0 &&
        !loadedSlots.some((s) => s.spool!.id === selectedSpoolId)
    ) {
        selectedSpoolId = loadedSlots[0].spool!.id;
    }
    $: selectedSlot =
        loadedSlots.find((s) => s.spool!.id === selectedSpoolId) ?? null;
    $: selectedSpool = selectedSlot?.spool ?? null;

    // Slider amount. Reset when the selected spool or its weight changes (e.g. after
    // switching spools, or a successful deduction refreshes the data).
    let deductGrams = 0;
    let lastSpoolKey = "";
    $: {
        const key = `${selectedSpool?.id ?? ""}:${selectedSpool?.remaining_weight ?? ""}`;
        if (key !== lastSpoolKey) {
            lastSpoolKey = key;
            deductGrams = 0;
        }
    }

    // Expected grams used on a given slot for the active job's module. Distributes
    // the module's total weight across slots by each slot's planned weight; falls
    // back to putting the whole amount on slot 0 when no per-slot weights exist.
    function slotUsage(slotIndex: number): number {
        const total = activePrintJob?.module_weight ?? 0;
        const mod = printModules.find(
            (m) => m.id === activePrintJob?.module_id,
        );
        const slots = mod?.filament_slots ?? [];
        const planned = slots.reduce((sum, s) => sum + (s.weight ?? 0), 0);
        if (planned > 0) {
            const w =
                slots.find((s) => s.slot_index === slotIndex)?.weight ?? 0;
            return Math.round((w / planned) * total);
        }
        return slotIndex === 0 ? total : 0;
    }

    // A print is "done" (awaiting confirmation) when the server has flipped it to
    // `finished`, OR it's still tracked as printing but live status already reports
    // FINISH (webhook lag — the screen the user sees the moment the print ends). In
    // both cases we show the confirmation layout, not the live printing chrome.
    $: liveDone = piLive?.gcode_state === "FINISH";
    $: isDone =
        printer.status === "finished" ||
        (printer.status === "printing" && liveDone);
</script>

<div
    class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6 border-0 cursor-default"
    onclick={onClose}
    onkeydown={(e) => e.key === "Escape" && onClose()}
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
                    <h2
                        class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight"
                    >
                        {printer.name}
                    </h2>
                    <p
                        class="text-sm text-zinc-400 dark:text-zinc-600 mt-1 tracking-wide"
                    >
                        {printer.preset?.brand ?? ""}
                        {printer.preset?.model ?? ""}
                    </p>
                </div>
                <button
                    onclick={onClose}
                    class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                    aria-label="Close modal"
                >
                    <svg
                        class="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>

            <!-- Status Badge -->
            <div class="mb-8">
                {#if isDone}
                    <span
                        class="inline-flex items-center gap-2.5 px-4 py-1.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-full text-sm font-light tracking-wide"
                    >
                        <div
                            class="w-2 h-2 bg-violet-500 rounded-full status-glow-violet animate-pulse"
                        ></div>
                        Finished — confirm result
                    </span>
                {:else if printer.status === "printing"}
                    <span
                        class="inline-flex items-center gap-2.5 px-4 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-sm font-light tracking-wide"
                    >
                        <div
                            class="w-2 h-2 bg-blue-500 rounded-full status-glow-blue"
                        ></div>
                        Printing
                    </span>
                {:else if printer.status === "idle"}
                    <span
                        class="inline-flex items-center gap-2.5 px-4 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full text-sm font-light tracking-wide"
                    >
                        <div
                            class="w-2 h-2 bg-emerald-500 rounded-full status-glow-green"
                        ></div>
                        Idle
                    </span>
                {:else if printer.status === "inactive"}
                    <span
                        class="inline-flex items-center gap-2.5 px-4 py-1.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded-full text-sm font-light tracking-wide"
                    >
                        <div
                            class="w-2 h-2 bg-red-500 rounded-full status-glow-red animate-pulse"
                        ></div>
                        Broken / Under Repair
                    </span>
                {/if}
            </div>

            <!-- Conditional Content Based on Status -->
            {#if (printer.status === "printing" || printer.status === "finished") && activePrintJob}
                <!-- PRINTING / AWAITING-CONFIRMATION STATUS MENU -->
                {@const displayProgress = isDone
                    ? 100
                    : (piLive?.progress ??
                      ((activePrintJob.progress ?? 0) > 0
                          ? (activePrintJob.progress ?? 0)
                          : getProgress(
                                activePrintJob.start_time ?? 0,
                                activePrintJob.expected_time_minutes ?? 0,
                                now,
                            )))}
                <div class="space-y-5">
                    <!-- Printer-reported hint (only when the printer flagged something) -->
                    {#if isDone && activePrintJob.failure_reason}
                        <div
                            class="bg-amber-500/8 border border-amber-500/15 rounded-xl px-4 py-3"
                        >
                            <p
                                class="text-xs text-amber-600 dark:text-amber-400"
                            >
                                Printer hint: {activePrintJob.failure_reason}
                            </p>
                        </div>
                    {/if}
                    <!-- Module Name -->
                    <div
                        class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]"
                    >
                        <p
                            class="text-xs text-zinc-400 dark:text-zinc-600 mb-1.5 tracking-wide uppercase"
                        >
                            Print Module
                        </p>
                        <p
                            class="text-xl text-zinc-900 dark:text-zinc-50 font-light tracking-tight"
                        >
                            {activePrintJob.module_name}
                        </p>
                        {#if piLive && !isDone}
                            <p class="text-xs text-blue-500 mt-1">
                                {piLive.label}
                            </p>
                        {/if}
                    </div>

                    {#if !isDone}
                        <!-- Print Progress -->
                        <div
                            class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]"
                        >
                            <div class="flex justify-between text-sm mb-3">
                                <span
                                    class="text-zinc-400 dark:text-zinc-600 tracking-wide"
                                    >Progress</span
                                >
                                <span
                                    class="text-zinc-900 dark:text-zinc-50 font-medium tabular-nums"
                                    >{displayProgress}%</span
                                >
                            </div>
                            <div
                                class="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden"
                            >
                                <div
                                    class="bg-blue-500 h-full rounded-full transition-all duration-500 progress-shimmer"
                                    style="width: {displayProgress}%"
                                ></div>
                            </div>
                            <div
                                class="flex justify-between text-xs text-zinc-400 dark:text-zinc-600 mt-3 tabular-nums"
                            >
                                <span
                                    >{getElapsedTime(
                                        activePrintJob.start_time ?? 0,
                                        now,
                                    )} elapsed</span
                                >
                                {#if (piLive?.total_layer_num ?? 0) > 0}
                                    <span
                                        >Layer {piLive?.layer_num} / {piLive?.total_layer_num}</span
                                    >
                                {:else}
                                    <span
                                        >{getRemainingTime(
                                            activePrintJob.start_time ?? 0,
                                            activePrintJob.expected_time_minutes ??
                                                0,
                                            now,
                                        )} remaining</span
                                    >
                                {/if}
                            </div>
                        </div>

                        <!-- Live Temps + Remaining Time (from Pi) -->
                        {#if piLive && (piLive.remaining_time != null || piLive.nozzle_temp != null)}
                            <div
                                class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-4 border border-zinc-100 dark:border-[#1a1a22]"
                            >
                                <div class="flex flex-wrap gap-5">
                                    {#if piLive.remaining_time != null && piLive.remaining_time > 0}
                                        <div>
                                            <p
                                                class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase"
                                            >
                                                Remaining
                                            </p>
                                            <p
                                                class="text-base text-zinc-900 dark:text-zinc-50 font-light tabular-nums"
                                            >
                                                {formatRemainingTime(
                                                    piLive.remaining_time,
                                                )}
                                            </p>
                                        </div>
                                    {/if}
                                    {#if piLive.nozzle_temp != null}
                                        <div>
                                            <p
                                                class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase"
                                            >
                                                Nozzle
                                            </p>
                                            <p
                                                class="text-base text-zinc-900 dark:text-zinc-50 font-light tabular-nums"
                                            >
                                                {Math.round(
                                                    piLive.nozzle_temp,
                                                )}°C
                                            </p>
                                        </div>
                                    {/if}
                                    {#if piLive.bed_temp != null}
                                        <div>
                                            <p
                                                class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase"
                                            >
                                                Bed
                                            </p>
                                            <p
                                                class="text-base text-zinc-900 dark:text-zinc-50 font-light tabular-nums"
                                            >
                                                {Math.round(piLive.bed_temp)}°C
                                            </p>
                                        </div>
                                    {/if}
                                    {#if piLive.chamber_temp != null}
                                        <div>
                                            <p
                                                class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase"
                                            >
                                                Chamber
                                            </p>
                                            <p
                                                class="text-base text-zinc-900 dark:text-zinc-50 font-light tabular-nums"
                                            >
                                                {Math.round(
                                                    piLive.chamber_temp,
                                                )}°C
                                            </p>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/if}

                        <!-- Time Info -->
                        <div class="grid grid-cols-2 gap-4">
                            <div
                                class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-4 border border-zinc-100 dark:border-[#1a1a22]"
                            >
                                <p
                                    class="text-xs text-zinc-400 dark:text-zinc-600 mb-1.5 tracking-wide uppercase"
                                >
                                    Total Time
                                </p>
                                <p
                                    class="text-lg text-zinc-900 dark:text-zinc-50 font-light tabular-nums"
                                >
                                    {formatTime(
                                        activePrintJob.expected_time_minutes ??
                                            0,
                                    )}
                                </p>
                            </div>
                            <div
                                class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-4 border border-zinc-100 dark:border-[#1a1a22]"
                            >
                                <p
                                    class="text-xs text-zinc-400 dark:text-zinc-600 mb-1.5 tracking-wide uppercase"
                                >
                                    Remaining
                                </p>
                                <p
                                    class="text-lg text-zinc-900 dark:text-zinc-50 font-light tabular-nums"
                                >
                                    {getRemainingTime(
                                        activePrintJob.start_time ?? 0,
                                        activePrintJob.expected_time_minutes ??
                                            0,
                                        now,
                                    )}
                                </p>
                            </div>
                        </div>
                    {:else}
                        <!-- Completed summary — planned vs. actual print time -->
                        <div
                            class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]"
                        >
                            <div class="flex items-center justify-between">
                                <div>
                                    <p
                                        class="text-xs text-zinc-400 dark:text-zinc-600 mb-1.5 tracking-wide uppercase"
                                    >
                                        Print Time
                                    </p>
                                    <p
                                        class="text-lg text-zinc-900 dark:text-zinc-50 font-light tabular-nums"
                                    >
                                        {formatTime(
                                            activePrintJob.expected_time_minutes ??
                                                0,
                                        )}
                                    </p>
                                </div>
                                <div class="text-right">
                                    <p
                                        class="text-xs text-zinc-400 dark:text-zinc-600 mb-1.5 tracking-wide uppercase"
                                    >
                                        time since start
                                    </p>
                                    <p
                                        class="text-lg text-zinc-900 dark:text-zinc-50 font-light tabular-nums"
                                    >
                                        {getElapsedTime(
                                            activePrintJob.start_time ?? 0,
                                            now,
                                        )}
                                    </p>
                                </div>
                            </div>
                        </div>
                    {/if}

                    <!-- Spool Weight Info (per loaded slot) -->
                    {#if loadedSlots.length > 0}
                        {#each loadedSlots as slot (slot.slot_index)}
                            {@const sp = slot.spool!}
                            {@const usage = slotUsage(slot.slot_index)}
                            {@const after = Math.max(
                                0,
                                sp.remaining_weight - usage,
                            )}
                            {@const capacity =
                                sp.initial_weight > 0
                                    ? sp.initial_weight
                                    : sp.remaining_weight}
                            {@const remainingPct =
                                capacity > 0
                                    ? Math.min(
                                          100,
                                          (sp.remaining_weight / capacity) *
                                              100,
                                      )
                                    : 0}
                            {@const staysShare =
                                sp.remaining_weight > 0
                                    ? Math.max(
                                          0,
                                          Math.min(
                                              100,
                                              (after / sp.remaining_weight) *
                                                  100,
                                          ),
                                      )
                                    : 0}
                            <div
                                class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]"
                            >
                                <div
                                    class="flex items-center justify-between mb-3"
                                >
                                    <p
                                        class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide uppercase"
                                    >
                                        Spool Weight · Slot {slot.slot_index +
                                            1}
                                    </p>
                                    <span
                                        class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
                                    >
                                        <span
                                            class="w-2.5 h-2.5 rounded-full border border-zinc-300/50 dark:border-white/15"
                                            style="background-color: {resolveSpoolColor(
                                                sp.preset,
                                            )}"
                                        ></span>
                                        {sp.preset?.brand ?? ""}
                                        {sp.preset?.material ?? ""}
                                    </span>
                                </div>

                                <!-- Usage bar: solid spool colour = filament that stays, striped spool colour = what this print consumes, track = empty spool -->
                                <div
                                    class="relative w-full h-3 rounded-full bg-zinc-200/80 dark:bg-zinc-800 border border-zinc-300/40 dark:border-white/10 overflow-hidden"
                                >
                                    <div
                                        class="absolute inset-y-0 left-0 flex overflow-hidden rounded-full"
                                        style="width: {remainingPct}%"
                                    >
                                        <div
                                            class="h-full"
                                            style="width: {staysShare}%; background-color: {resolveSpoolColor(
                                                sp.preset,
                                            )}"
                                        ></div>
                                        <div
                                            class="h-full flex-1 usage-stripe"
                                            style="--spool-color: {resolveSpoolColor(
                                                sp.preset,
                                            )}"
                                        ></div>
                                    </div>
                                </div>

                                <div class="grid grid-cols-3 gap-4 mt-4">
                                    <div>
                                        <p
                                            class="text-xs text-zinc-400 dark:text-zinc-600 mb-1"
                                        >
                                            Before
                                        </p>
                                        <p
                                            class="text-lg text-zinc-900 dark:text-zinc-50 font-light tabular-nums"
                                        >
                                            {sp.remaining_weight}g
                                        </p>
                                    </div>
                                    <div>
                                        <p
                                            class="text-xs text-zinc-400 dark:text-zinc-600 mb-1"
                                        >
                                            Usage
                                        </p>
                                        <p
                                            class="text-lg text-amber-500 font-light tabular-nums"
                                        >
                                            −{usage}g
                                        </p>
                                    </div>
                                    <div>
                                        <p
                                            class="text-xs text-zinc-400 dark:text-zinc-600 mb-1"
                                        >
                                            After
                                        </p>
                                        <p
                                            class="text-lg text-blue-500 dark:text-blue-400 font-light tabular-nums"
                                        >
                                            {after.toFixed(0)}g
                                        </p>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {:else}
                        <div
                            class="bg-red-500/5 border border-red-500/10 rounded-xl p-4"
                        >
                            <p
                                class="text-sm text-red-500 dark:text-red-400 font-light"
                            >
                                No spool loaded
                            </p>
                        </div>
                    {/if}

                    <!-- Pi Controls (Cancel / Pause / Resume) — only while actually printing -->
                    {#if !isDone && printer?.printer_ip && printer?.printer_serial && printer?.printer_access_code}
                        <div class="grid grid-cols-2 gap-3 pt-1">
                            <button
                                disabled={!!controlLoading}
                                onclick={async () => {
                                    await onSendControl("cancel", printer.id);
                                }}
                                class="bg-red-500/8 hover:bg-red-500/15 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl transition-all duration-200 font-medium border border-red-500/10 hover:border-red-500/20 text-sm disabled:opacity-50"
                            >
                                {controlLoading === "cancel"
                                    ? "Cancelling…"
                                    : "Cancel Print"}
                            </button>
                            {#if piLive?.gcode_state === "PAUSE"}
                                <button
                                    disabled={!!controlLoading}
                                    onclick={async () => {
                                        await onSendControl(
                                            "resume",
                                            printer.id,
                                        );
                                    }}
                                    class="bg-blue-500/8 hover:bg-blue-500/15 text-blue-600 dark:text-blue-400 px-4 py-3 rounded-xl transition-all duration-200 font-medium border border-blue-500/10 hover:border-blue-500/20 text-sm disabled:opacity-50"
                                >
                                    {controlLoading === "resume"
                                        ? "Resuming…"
                                        : "Resume"}
                                </button>
                            {:else}
                                <button
                                    disabled={!!controlLoading}
                                    onclick={async () => {
                                        await onSendControl(
                                            "pause",
                                            printer.id,
                                        );
                                    }}
                                    class="bg-amber-500/8 hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 px-4 py-3 rounded-xl transition-all duration-200 font-medium border border-amber-500/10 hover:border-amber-500/20 text-sm disabled:opacity-50"
                                >
                                    {controlLoading === "pause"
                                        ? "Pausing…"
                                        : "Pause"}
                                </button>
                            {/if}
                        </div>
                    {/if}

                    <!-- Result decision — a manual override while printing; the primary action once done -->
                    {#if isDone}
                        <p
                            class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide uppercase pt-1"
                        >
                            How did it turn out?
                        </p>
                    {/if}
                    <div
                        class="grid grid-cols-2 gap-4 {isDone
                            ? 'pt-1'
                            : 'pt-3'}"
                    >
                        <button
                            onclick={onPrintFailed}
                            class="w-full {isDone
                                ? 'bg-red-500/12 hover:bg-red-500/20 py-4'
                                : 'bg-red-500/8 hover:bg-red-500/15 py-3.5'} text-red-600 dark:text-red-400 px-4 rounded-xl transition-all duration-200 font-medium border border-red-500/10 hover:border-red-500/20"
                        >
                            Print Failed
                        </button>

                        <form
                            method="POST"
                            action="?/completePrint"
                            use:enhance={completePrintSuccessEnhance}
                        >
                            <input
                                type="hidden"
                                name="jobId"
                                value={activePrintJob.id}
                            />
                            <input type="hidden" name="success" value="true" />
                            <input
                                type="hidden"
                                name="actualWeight"
                                value={activePrintJob.module_weight ?? 0}
                            />

                            <button
                                type="submit"
                                class="w-full {isDone
                                    ? 'bg-emerald-500/12 hover:bg-emerald-500/20 py-4'
                                    : 'bg-emerald-500/8 hover:bg-emerald-500/15 py-3.5'} text-emerald-600 dark:text-emerald-400 px-4 rounded-xl transition-all duration-200 font-medium border border-emerald-500/10 hover:border-emerald-500/20"
                            >
                                Print Successful
                            </button>
                        </form>
                    </div>
                </div>
            {:else if printer.status === "idle"}
                <!-- IDLE STATUS MENU -->
                {@const lastPrintJob = getLastPrintJob(printer.id, printJobs)}
                <div class="space-y-5">
                    <!-- Loaded Spools (per slot) + single manual deduction control -->
                    {#if loadedSlots.length > 0}
                        {@const multi = loadedSlots.length > 1}
                        <div
                            class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]"
                        >
                            <!-- Spool rows. With >1 spool each row is the deduction target selector. -->
                            <div class="space-y-2">
                                {#each loadedSlots as slot (slot.slot_index)}
                                    {@const sp = slot.spool!}
                                    {@const capacity =
                                        sp.initial_weight > 0
                                            ? sp.initial_weight
                                            : sp.remaining_weight}
                                    {@const pct =
                                        capacity > 0
                                            ? Math.round(
                                                  (sp.remaining_weight /
                                                      capacity) *
                                                      100,
                                              )
                                            : 0}
                                    <button
                                        type="button"
                                        disabled={!multi}
                                        onclick={() =>
                                            (selectedSpoolId = sp.id)}
                                        aria-pressed={selectedSpoolId === sp.id}
                                        class="w-full text-left rounded-lg transition-all {multi
                                            ? `p-3 border cursor-pointer ${selectedSpoolId === sp.id ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-transparent hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'}`
                                            : 'cursor-default'}"
                                    >
                                        <div
                                            class="flex items-center justify-between gap-3 mb-2"
                                        >
                                            <span
                                                class="flex items-center gap-2 min-w-0"
                                            >
                                                <span
                                                    class="w-2.5 h-2.5 rounded-full border border-zinc-300/50 dark:border-white/15 shrink-0"
                                                    style="background-color: {resolveSpoolColor(
                                                        sp.preset,
                                                    )}"
                                                ></span>
                                                <span
                                                    class="text-sm font-medium text-zinc-900 dark:text-zinc-100 shrink-0"
                                                    >Slot {slot.slot_index +
                                                        1}</span
                                                >
                                                <span
                                                    class="text-xs text-zinc-400 dark:text-zinc-500 truncate"
                                                    >{sp.preset?.brand ?? ""}
                                                    {sp.preset?.material ??
                                                        ""}</span
                                                >
                                            </span>
                                            <span
                                                class="flex items-baseline gap-1.5 shrink-0 tabular-nums"
                                            >
                                                <span
                                                    class="text-base font-light text-zinc-900 dark:text-zinc-50"
                                                    >{sp.remaining_weight}g</span
                                                >
                                                <span
                                                    class="text-xs text-zinc-400 dark:text-zinc-600"
                                                    >{pct}%</span
                                                >
                                            </span>
                                        </div>
                                        <SpoolGauge
                                            remaining={sp.remaining_weight}
                                            initial={sp.initial_weight}
                                            color={resolveSpoolColor(sp.preset)}
                                            size="sm"
                                            showLabel={false}
                                        />
                                    </button>
                                {/each}
                            </div>

                            <!-- Manual weight deduction — one slider, targets the selected spool. -->
                            {#if selectedSpool}
                                <form
                                    method="POST"
                                    action="?/adjustSpoolWeight"
                                    use:enhance={adjustWeightEnhance}
                                    class="mt-4 pt-4 border-t border-zinc-200/60 dark:border-[#1a1a22]"
                                >
                                    <input
                                        type="hidden"
                                        name="spoolId"
                                        value={selectedSpool.id}
                                    />
                                    <input
                                        type="hidden"
                                        name="remainingWeight"
                                        value={selectedSpool.remaining_weight -
                                            deductGrams}
                                    />

                                    <div
                                        class="flex items-center justify-between mb-3"
                                    >
                                        <p
                                            class="text-xs text-zinc-400 dark:text-zinc-600 tracking-wide uppercase"
                                        >
                                            Deduct{#if multi}
                                                · Slot {(selectedSlot?.slot_index ??
                                                    0) + 1}{/if}
                                        </p>
                                        <span
                                            class="text-sm font-medium tabular-nums {deductGrams >
                                            0
                                                ? 'text-amber-500'
                                                : 'text-zinc-400 dark:text-zinc-600'}"
                                        >
                                            −{deductGrams}g
                                        </span>
                                    </div>

                                    <input
                                        type="range"
                                        min="0"
                                        max={selectedSpool.remaining_weight}
                                        step="1"
                                        bind:value={deductGrams}
                                        class="weight-slider w-full"
                                        style="--pct: {selectedSpool.remaining_weight >
                                        0
                                            ? (deductGrams /
                                                  selectedSpool.remaining_weight) *
                                              100
                                            : 0}%; --spool-color: {resolveSpoolColor(
                                            selectedSpool.preset,
                                        )}"
                                    />

                                    <div
                                        class="flex items-center justify-between mt-3"
                                    >
                                        <span
                                            class="text-sm text-zinc-400 dark:text-zinc-500 tabular-nums"
                                        >
                                            After: <span
                                                class="text-zinc-900 dark:text-zinc-100 font-medium"
                                                >{selectedSpool.remaining_weight -
                                                    deductGrams}g</span
                                            >
                                        </span>
                                        <button
                                            type="submit"
                                            disabled={deductGrams <= 0}
                                            class="bg-amber-500/8 hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium border border-amber-500/10 hover:border-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            Deduct
                                        </button>
                                    </div>
                                </form>
                            {/if}
                        </div>
                    {:else}
                        <div
                            class="bg-amber-500/5 border border-amber-500/10 rounded-xl p-5"
                        >
                            <p
                                class="text-sm text-amber-600 dark:text-amber-400 font-light"
                            >
                                No spool loaded
                            </p>
                            <p
                                class="text-xs text-zinc-400 dark:text-zinc-600 mt-1"
                            >
                                Load a spool to start printing
                            </p>
                        </div>
                    {/if}

                    <!-- Last Print Info -->
                    {#if lastPrintJob}
                        <div
                            class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]"
                        >
                            <p
                                class="text-xs text-zinc-400 dark:text-zinc-600 mb-3 tracking-wide uppercase"
                            >
                                Last Printed Module
                            </p>
                            <div class="flex justify-between items-center">
                                <span
                                    class="text-base text-zinc-900 dark:text-zinc-100 font-medium"
                                    >{lastPrintJob.module_name ||
                                        "Unknown"}</span
                                >
                                {#if lastPrintJob.status == "successful"}
                                    <span
                                        class="inline-flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400 text-xs font-medium"
                                    >
                                        <svg
                                            class="w-3.5 h-3.5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            ><path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M5 13l4 4L19 7"
                                            /></svg
                                        >
                                        Success
                                    </span>
                                {:else}
                                    <span
                                        class="inline-flex items-center gap-1.5 text-red-500 dark:text-red-400 text-xs font-medium"
                                    >
                                        <svg
                                            class="w-3.5 h-3.5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            ><path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M6 18L18 6M6 6l12 12"
                                            /></svg
                                        >
                                        Failed
                                    </span>
                                {/if}
                            </div>
                            {#if lastPrintJob.status !== "successful" && lastPrintJob.failure_reason}
                                <p
                                    class="text-xs text-red-500/70 dark:text-red-400/60 mt-3 pt-3 border-t border-zinc-200/60 dark:border-[#1a1a22]"
                                >
                                    {lastPrintJob.failure_reason}
                                </p>
                            {/if}
                        </div>
                    {:else}
                        <div
                            class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22]"
                        >
                            <p
                                class="text-xs text-zinc-400 dark:text-zinc-600 mb-3 tracking-wide uppercase"
                            >
                                Last Printed Module
                            </p>
                            <p class="text-sm text-zinc-400 dark:text-zinc-600">
                                No previous prints
                            </p>
                        </div>
                    {/if}

                    <!-- Next Suggested Print -->
                    {#if printer?.suggested_queue}
                        {@const nextPrint = printer.suggested_queue.find(
                            (item: any) => item.status !== "DONE",
                        )}
                        {#if nextPrint}
                            {@const matchingModule = printModules.find(
                                (m: any) => m.id === nextPrint.module_id,
                            )}
                            <button
                                type="button"
                                disabled={startingPrinterIds.has(
                                    Number(printer.id),
                                )}
                                onclick={() =>
                                    matchingModule &&
                                    onEnqueue(matchingModule, printer)}
                                class="w-full text-left bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-5 mt-4 hover:bg-emerald-500/10 hover:border-emerald-500/25 transition-all duration-200 disabled:opacity-50"
                            >
                                <div class="flex items-center gap-4">
                                    <div
                                        class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0"
                                    >
                                        <svg
                                            class="w-5 h-5 text-emerald-500"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            stroke-width="1.5"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                                            />
                                        </svg>
                                    </div>
                                    <div>
                                        <div
                                            class="text-xs text-zinc-400 dark:text-zinc-600 mb-1 tracking-wide uppercase"
                                        >
                                            Next Suggested Print
                                        </div>
                                        <div
                                            class="text-base text-zinc-900 dark:text-zinc-100 font-medium"
                                        >
                                            {nextPrint.module_name}
                                        </div>
                                        <div
                                            class="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 tabular-nums"
                                        >
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
                        disabled={controlLoading === "marking-broken"}
                        onclick={() => onToggleBroken(printer, true)}
                        class="w-full bg-red-500/5 hover:bg-red-500/10 text-red-500/70 dark:text-red-400/60 hover:text-red-600 dark:hover:text-red-400 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm border border-red-500/8 hover:border-red-500/15 disabled:opacity-50"
                    >
                        {controlLoading === "marking-broken"
                            ? "Marking as broken…"
                            : "Mark as Broken"}
                    </button>
                </div>
            {:else if printer.status === "inactive"}
                <!-- BROKEN STATUS MENU -->
                <div class="space-y-5">
                    <div
                        class="bg-red-500/5 border border-red-500/15 rounded-xl p-5"
                    >
                        <p
                            class="text-sm text-red-600 dark:text-red-400 font-medium mb-1"
                        >
                            Printer is under repair
                        </p>
                        <p class="text-xs text-zinc-400 dark:text-zinc-600">
                            Downtime is being tracked from when this printer was
                            marked broken. Mark as repaired to stop the downtime
                            clock.
                        </p>
                    </div>
                    <button
                        disabled={controlLoading === "marking-repaired"}
                        onclick={() => onToggleBroken(printer, false)}
                        class="w-full bg-emerald-500/8 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium border border-emerald-500/10 hover:border-emerald-500/20 disabled:opacity-50"
                    >
                        {controlLoading === "marking-repaired"
                            ? "Marking as repaired…"
                            : "Mark as Repaired"}
                    </button>
                </div>
            {:else}
                <!-- Fallback for other statuses -->
                <div
                    class="bg-zinc-50 dark:bg-[#111114] rounded-xl p-5 border border-zinc-100 dark:border-[#1a1a22] text-center"
                >
                    <p class="text-zinc-400 dark:text-zinc-600">
                        Status: {printer.status}
                    </p>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    /* Usage segment of the spool-weight bar — the spool's own colour with a diagonal
     hatch over it so consumed filament reads as "to be removed". Matches SpoolGauge. */
    .usage-stripe {
        background-color: var(--spool-color, rgb(245 158 11));
        background-image: repeating-linear-gradient(
            45deg,
            rgba(0, 0, 0, 0.25) 0 3px,
            rgba(255, 255, 255, 0.3) 3px 6px
        );
    }

    /* Manual weight-deduction slider — filled in the target spool's colour up to the
     thumb (falls back to amber), zinc track after. Colour comes from --spool-color. */
    .weight-slider {
        -webkit-appearance: none;
        appearance: none;
        height: 6px;
        border-radius: 9999px;
        background: linear-gradient(
            to right,
            var(--spool-color, rgb(245 158 11)) 0%,
            var(--spool-color, rgb(245 158 11)) var(--pct),
            rgb(228 228 231) var(--pct),
            rgb(228 228 231) 100%
        );
        cursor: pointer;
        outline: none;
    }
    @media (prefers-color-scheme: dark) {
        .weight-slider {
            background: linear-gradient(
                to right,
                var(--spool-color, rgb(245 158 11)) 0%,
                var(--spool-color, rgb(245 158 11)) var(--pct),
                rgb(39 39 42) var(--pct),
                rgb(39 39 42) 100%
            );
        }
        .weight-slider::-webkit-slider-thumb {
            border-color: rgb(12 12 15);
        }
        .weight-slider::-moz-range-thumb {
            border-color: rgb(12 12 15);
        }
    }
    .weight-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 9999px;
        background: var(--spool-color, rgb(245 158 11));
        border: 2px solid white;
        box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
        transition: transform 0.15s ease;
    }
    .weight-slider::-webkit-slider-thumb:active {
        transform: scale(1.15);
    }
    .weight-slider::-moz-range-thumb {
        width: 18px;
        height: 18px;
        border-radius: 9999px;
        background: var(--spool-color, rgb(245 158 11));
        border: 2px solid white;
        box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
    }
</style>
