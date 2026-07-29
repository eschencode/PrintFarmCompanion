<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import type { DashboardPrinter, PrinterEvent, PrintJobWithDetails } from '$lib/types';

  /**
   * Past prints for one printer: job cards interleaved with printer-level
   * events (spool loads), each job expandable into its event timeline, with a
   * retroactive outcome-change form on finished jobs. Data is lazy-fetched
   * from /api/printer/:id/history so the dashboard load stays lean.
   */
  export let printer: DashboardPrinter;
  export let onClose: () => void;

  interface HistorySpool {
    slot_index: number;
    spool_id: number | null;
    used_weight: number | null;
    color: string | null;
    color_hex: string | null;
    brand: string | null;
    material: string | null;
  }
  type HistoryJob = PrintJobWithDetails & { spools: HistorySpool[] };

  let jobs: HistoryJob[] = [];
  let events: PrinterEvent[] = [];
  let hasMore = false;
  let loading = true;
  let loadingMore = false;
  let error: string | null = null;

  let expandedJobId: number | null = null;
  let editJobId: number | null = null;
  let editReason = '';
  let submitting = false;
  let deleteJobId: number | null = null;
  let deleting = false;

  async function fetchHistory(before?: number) {
    const url = `/api/printer/${printer.id}/history` + (before ? `?before=${before}` : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json() as Promise<{ success: boolean; jobs: HistoryJob[]; events: PrinterEvent[]; hasMore: boolean }>;
  }

  async function loadInitial() {
    loading = true;
    error = null;
    try {
      const data = await fetchHistory();
      jobs = data.jobs;
      events = data.events;
      hasMore = data.hasMore;
    } catch (e) {
      console.error('Error loading printer history:', e);
      error = 'Failed to load history';
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (jobs.length === 0) return;
    loadingMore = true;
    try {
      const oldest = jobs[jobs.length - 1].created_at;
      const data = await fetchHistory(oldest);
      jobs = [...jobs, ...data.jobs];
      events = [...events, ...data.events.filter((e) => !events.some((x) => x.id === e.id))];
      hasMore = data.hasMore;
    } catch (e) {
      console.error('Error loading more history:', e);
    } finally {
      loadingMore = false;
    }
  }

  onMount(loadInitial);

  // ── Merged feed: job cards + job-unlinked events (spool loads), newest first
  type FeedItem = { time: number } & ({ kind: 'job'; job: HistoryJob } | { kind: 'event'; event: PrinterEvent });
  $: feed = (
    [
      ...jobs.map((job) => ({ kind: 'job' as const, time: job.start_time ?? job.created_at, job })),
      ...events
        .filter((e) => e.print_job_id === null)
        .map((event) => ({ kind: 'event' as const, time: event.created_at, event })),
    ] as FeedItem[]
  ).sort((a, b) => b.time - a.time);

  function jobEvents(job: HistoryJob): PrinterEvent[] {
    return events
      .filter((e) => Number(e.print_job_id) === Number(job.id))
      .sort((a, b) => a.created_at - b.created_at);
  }

  function parseDetail(e: PrinterEvent): Record<string, any> {
    try {
      return e.detail ? JSON.parse(e.detail) : {};
    } catch {
      return {};
    }
  }

  function eventLabel(e: PrinterEvent): string {
    const d = parseDetail(e);
    switch (e.event_type) {
      case 'spool_loaded':
        return `Spool loaded${d.spool ? ` — ${d.spool}` : ''}${d.slot > 0 ? ` (slot ${d.slot})` : ''}`;
      case 'spool_unloaded':
        return `Spool unloaded${d.slot > 0 ? ` (slot ${d.slot})` : ''}`;
      case 'print_started':
        return `Print started${d.module ? ` — ${d.module}` : ''}`;
      case 'print_finished':
        return 'Printer reported finished';
      case 'marked_successful':
        return `Marked successful${d.totalWeight ? ` — ${d.totalWeight}g used` : ''}`;
      case 'marked_failed':
        return `Marked failed${d.reason ? ` — ${d.reason}` : ''}`;
      case 'outcome_changed':
        return `Outcome changed: ${statusLabel(d.from)} → ${statusLabel(d.to)}${d.reason ? ` — ${d.reason}` : ''}`;
      case 'print_deleted':
        return `Print deleted${d.module ? ` — ${d.module}` : ''}`;
      default:
        return e.event_type;
    }
  }

  function statusLabel(status: string | null | undefined): string {
    switch (status) {
      case 'successful': return 'Success';
      case 'failed': return 'Failed';
      case 'failed_confirmed': return 'Failed';
      case 'printing': return 'Printing';
      case 'print_finished': return 'Finished';
      default: return status ?? 'Unknown';
    }
  }

  function formatDateTime(unixSec: number | null): string {
    if (!unixSec) return '—';
    return new Date(unixSec * 1000).toLocaleString(undefined, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  function formatTime(unixSec: number): string {
    return new Date(unixSec * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(job: HistoryJob): string | null {
    if (!job.start_time) return null;
    const end = isTerminal(job.status) ? job.updated_at : null;
    if (!end || end <= job.start_time) return null;
    const mins = Math.round((end - job.start_time) / 60);
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  }

  function usedWeight(job: HistoryJob): number {
    return job.spools.reduce((sum, s) => sum + (s.used_weight ?? 0), 0);
  }

  function isTerminal(status: string): boolean {
    return status === 'successful' || status === 'failed' || status === 'failed_confirmed';
  }

  /** The outcome a retroactive flip would move this job to. */
  function flipTarget(status: string): 'successful' | 'failed' {
    return status === 'successful' ? 'failed' : 'successful';
  }

  function startEdit(job: HistoryJob) {
    editJobId = job.id;
    deleteJobId = null;
    editReason = '';
  }
</script>

<div
  class="fixed inset-0 bg-black/50 modal-backdrop z-50 flex items-center justify-center p-6"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="button"
  tabindex="0"
  aria-label="Close print history"
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
      <!-- Header -->
      <div class="flex justify-between items-start mb-8">
        <div>
          <h2 class="text-2xl font-light text-zinc-900 dark:text-zinc-50 tracking-tight">Past Prints</h2>
          <p class="text-sm text-zinc-400 dark:text-zinc-600 mt-1 tracking-wide">{printer.name}</p>
        </div>
        <button
          onclick={onClose}
          class="p-2 -m-2 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-50 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
          aria-label="Close print history"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {#if loading}
        <div class="py-16 text-center text-sm text-zinc-400 dark:text-zinc-600">Loading history…</div>
      {:else if error}
        <div class="py-16 text-center">
          <p class="text-sm text-red-500 mb-3">{error}</p>
          <button onclick={loadInitial} class="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 underline">Retry</button>
        </div>
      {:else if feed.length === 0}
        <div class="py-16 text-center text-sm text-zinc-400 dark:text-zinc-600">No prints on this printer yet</div>
      {:else}
        <div class="space-y-3">
          {#each feed as item (item.kind === 'job' ? `job-${item.job.id}` : `evt-${item.event.id}`)}
            {#if item.kind === 'event'}
              <!-- Slim printer-level event row (spool load/unload between jobs) -->
              <div class="flex items-center gap-3 px-4 py-2 text-xs text-zinc-500 dark:text-zinc-500">
                {#if item.event.event_type === 'spool_loaded' && parseDetail(item.event).colorHex}
                  <span class="w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/10 shrink-0" style="background-color: {parseDetail(item.event).colorHex}"></span>
                {:else}
                  <span class="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0"></span>
                {/if}
                <span class="flex-1 truncate">{eventLabel(item.event)}</span>
                <span class="shrink-0 tabular-nums">{formatDateTime(item.event.created_at)}</span>
              </div>
            {:else}
              {@const job = item.job}
              {@const isExpanded = expandedJobId === job.id}
              <div class="rounded-xl border border-zinc-200/80 dark:border-[#1a1a22] bg-zinc-50/50 dark:bg-zinc-900/20">
                <!-- Job card row -->
                <button
                  onclick={() => (expandedJobId = isExpanded ? null : job.id)}
                  class="w-full flex items-center gap-4 p-4 text-left hover:bg-zinc-100/60 dark:hover:bg-zinc-800/30 rounded-xl transition-colors"
                >
                  {#if job.module_thumbnail}
                    <img src={job.module_thumbnail} alt="" class="w-10 h-10 rounded-lg object-cover bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                  {:else}
                    <div class="w-10 h-10 rounded-lg bg-zinc-200 dark:bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-400 dark:text-zinc-600">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                  {/if}
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
                      {job.module_name ?? 'Unknown module'}
                    </p>
                    <p class="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5">
                      {formatDateTime(job.start_time ?? job.created_at)}
                      {#if formatDuration(job)} · {formatDuration(job)}{/if}
                      {#if usedWeight(job) > 0} · {usedWeight(job)}g{/if}
                    </p>
                    {#if job.failure_reason}
                      <p class="text-xs text-red-500/80 mt-0.5 truncate">{job.failure_reason}</p>
                    {/if}
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    {#each job.spools.filter((s) => s.spool_id) as spool}
                      <span
                        class="w-3 h-3 rounded-full border border-black/10 dark:border-white/10"
                        style="background-color: {spool.color_hex ?? '#a1a1aa'}"
                        title="{[spool.brand, spool.material, spool.color].filter(Boolean).join(' ')}"
                      ></span>
                    {/each}
                    {#if job.status === 'successful'}
                      <span class="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                        Success
                      </span>
                    {:else if job.status === 'failed' || job.status === 'failed_confirmed'}
                      <span class="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>
                        Failed
                      </span>
                    {:else if job.status === 'printing' || job.status === 'print_finished'}
                      <span class="text-xs text-blue-600 dark:text-blue-400">{statusLabel(job.status)}</span>
                    {:else}
                      <span class="text-xs text-zinc-500">{statusLabel(job.status)}</span>
                    {/if}
                    <svg class="w-4 h-4 text-zinc-400 dark:text-zinc-600 transition-transform {isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {#if isExpanded}
                  {@const jEvents = jobEvents(job)}
                  <div class="px-4 pb-4 pt-1 border-t border-zinc-200/60 dark:border-[#1a1a22]">
                    <!-- Event timeline -->
                    <div class="mt-3 space-y-2">
                      {#if jEvents.length > 0}
                        {#each jEvents as e}
                          <div class="flex items-start gap-3 text-xs">
                            <span class="mt-1 w-1.5 h-1.5 rounded-full shrink-0 {e.event_type === 'marked_failed' || (e.event_type === 'outcome_changed' && parseDetail(e).to === 'failed') ? 'bg-red-400' : e.event_type === 'marked_successful' || (e.event_type === 'outcome_changed' && parseDetail(e).to === 'successful') ? 'bg-green-400' : 'bg-zinc-300 dark:bg-zinc-700'}"></span>
                            <span class="flex-1 text-zinc-600 dark:text-zinc-400">{eventLabel(e)}</span>
                            <span class="shrink-0 text-zinc-400 dark:text-zinc-600 tabular-nums">{formatDateTime(e.created_at)}</span>
                          </div>
                        {/each}
                      {:else}
                        <!-- Job predates the event log — coarse derived timeline -->
                        {#if job.start_time}
                          <div class="flex items-start gap-3 text-xs">
                            <span class="mt-1 w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0"></span>
                            <span class="flex-1 text-zinc-600 dark:text-zinc-400">Print started</span>
                            <span class="shrink-0 text-zinc-400 dark:text-zinc-600 tabular-nums">{formatDateTime(job.start_time)}</span>
                          </div>
                        {/if}
                        {#if isTerminal(job.status)}
                          <div class="flex items-start gap-3 text-xs">
                            <span class="mt-1 w-1.5 h-1.5 rounded-full shrink-0 {job.status === 'successful' ? 'bg-green-400' : 'bg-red-400'}"></span>
                            <span class="flex-1 text-zinc-600 dark:text-zinc-400">Marked {statusLabel(job.status).toLowerCase()}</span>
                            <span class="shrink-0 text-zinc-400 dark:text-zinc-600 tabular-nums">{formatDateTime(job.updated_at)}</span>
                          </div>
                        {/if}
                      {/if}
                    </div>

                    <!-- Footer: retroactive outcome change + delete -->
                    {#if editJobId === job.id && isTerminal(job.status)}
                      {@const flipTo = flipTarget(job.status)}
                      <form
                        method="POST"
                        action="?/changeJobOutcome"
                        class="mt-4 rounded-lg border border-zinc-200 dark:border-[#1f1f28] p-3 space-y-3"
                        use:enhance={() => {
                          submitting = true;
                          return async ({ result, update }) => {
                            submitting = false;
                            if (result.type === 'success' && result.data?.success) {
                              editJobId = null;
                              await Promise.all([loadInitial(), invalidateAll()]);
                            } else {
                              await update();
                            }
                          };
                        }}
                      >
                        <input type="hidden" name="jobId" value={job.id} />
                        <input type="hidden" name="outcome" value={flipTo} />
                        <p class="text-xs text-zinc-500 dark:text-zinc-500">
                          {#if flipTo === 'failed'}
                            Mark this print as failed — stock added by this print will be removed again.
                          {:else}
                            Mark this print as successful — its output will be added to stock.
                          {/if}
                        </p>
                        {#if flipTo === 'failed'}
                          <input
                            type="text"
                            name="failureReason"
                            bind:value={editReason}
                            placeholder="Reason (e.g. batch defect found later)"
                            class="w-full text-sm px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-[#1f1f28] text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                          />
                        {/if}
                        <div class="flex gap-2">
                          <button
                            type="submit"
                            disabled={submitting}
                            class="px-3 py-1.5 text-xs rounded-lg font-medium transition-colors disabled:opacity-50 {flipTo === 'failed' ? 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'}"
                          >
                            {submitting ? 'Saving…' : flipTo === 'failed' ? 'Mark failed' : 'Mark successful'}
                          </button>
                          <button
                            type="button"
                            onclick={() => (editJobId = null)}
                            class="px-3 py-1.5 text-xs rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    {:else if deleteJobId === job.id}
                      <form
                        method="POST"
                        action="?/deleteJob"
                        class="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-3"
                        use:enhance={() => {
                          deleting = true;
                          return async ({ result, update }) => {
                            deleting = false;
                            if (result.type === 'success' && result.data?.success) {
                              deleteJobId = null;
                              expandedJobId = null;
                              await Promise.all([loadInitial(), invalidateAll()]);
                            } else {
                              await update();
                            }
                          };
                        }}
                      >
                        <input type="hidden" name="jobId" value={job.id} />
                        <p class="text-xs text-zinc-600 dark:text-zinc-400">
                          Permanently delete this print record?
                          {#if job.status === 'successful'} Its output will be removed from stock.{/if}
                          This can't be undone.
                        </p>
                        <div class="flex gap-2">
                          <button
                            type="submit"
                            disabled={deleting}
                            class="px-3 py-1.5 text-xs rounded-lg font-medium bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          >
                            {deleting ? 'Deleting…' : 'Delete permanently'}
                          </button>
                          <button
                            type="button"
                            onclick={() => (deleteJobId = null)}
                            class="px-3 py-1.5 text-xs rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    {:else}
                      <div class="mt-4 flex items-center gap-4">
                        {#if isTerminal(job.status)}
                          <button
                            onclick={() => startEdit(job)}
                            class="text-xs text-zinc-400 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-50 underline underline-offset-2 transition-colors"
                          >
                            Change outcome to {flipTarget(job.status)}
                          </button>
                        {/if}
                        <button
                          onclick={() => { deleteJobId = job.id; editJobId = null; }}
                          class="text-xs text-zinc-400 dark:text-zinc-600 hover:text-red-600 dark:hover:text-red-400 underline underline-offset-2 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>

        {#if hasMore}
          <div class="mt-6 text-center">
            <button
              onclick={loadMore}
              disabled={loadingMore}
              class="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
