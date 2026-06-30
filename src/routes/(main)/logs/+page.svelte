<script lang="ts">
  import { onMount } from 'svelte';
  import BackToDashboard from '$lib/components/BackToDashboard.svelte';
  import { isDesktop } from '$lib/stores/desktop';

  interface LogEntry {
    timestamp: number;
    level: string;
    category: string;
    printer_serial: string;
    printer_name: string;
    message: string;
  }

  interface PrinterInfo {
    serial: string;
    name: string;
  }

  let entries = $state<LogEntry[]>([]);
  let printers = $state<PrinterInfo[]>([]);
  let error = $state('');

  // Filters
  let selectedPrinter = $state('');
  let selectedLevel = $state('');
  let selectedCategory = $state('');
  let searchText = $state('');

  // Auto-refresh
  let isLive = $state(true);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let logContainer: HTMLElement;
  let shouldAutoScroll = $state(true);

  const categories = ['MQTT', 'FTPS', 'Print', 'Webhook', 'Idle', '3MF', 'Bambu', 'Status', 'System'];

  const categoryColors: Record<string, string> = {
    MQTT: 'bg-blue-500/20 text-blue-400',
    FTPS: 'bg-emerald-500/20 text-emerald-400',
    Print: 'bg-zinc-500/20 text-zinc-300',
    Webhook: 'bg-purple-500/20 text-purple-400',
    Idle: 'bg-zinc-600/20 text-zinc-500',
    '3MF': 'bg-orange-500/20 text-orange-400',
    Bambu: 'bg-cyan-500/20 text-cyan-400',
    Status: 'bg-teal-500/20 text-teal-400',
    System: 'bg-zinc-500/20 text-zinc-400',
  };

  const levelColors: Record<string, string> = {
    info: 'text-zinc-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
  };

  function formatTime(ts: number): string {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatTimeAgo(ts: number): string {
    const diff = Date.now() / 1000 - ts;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  // Separate cursors per source — Pi and desktop run on different clocks, so a
  // single shared cursor could drop entries from whichever clock lags.
  let piCursor = 0;
  let directCursor = 0;

  async function invokeTauri<T>(cmd: string, args: Record<string, unknown>): Promise<T | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    } catch {
      return null;
    }
  }

  async function fetchPrinters() {
    const merged = new Map<string, PrinterInfo>();
    try {
      const resp = await fetch('/api/pi/logs/printers');
      const data = (await resp.json()) as { printers?: PrinterInfo[] };
      for (const p of data.printers ?? []) merged.set(p.serial, p);
    } catch {
      // ignore — Pi may be unreachable / unconfigured
    }
    if ($isDesktop) {
      const dp = await invokeTauri<PrinterInfo[]>('fetch_direct_printers', {});
      for (const p of dp ?? []) if (!merged.has(p.serial)) merged.set(p.serial, p);
    }
    printers = [...merged.values()];
  }

  async function fetchPiLogs(): Promise<LogEntry[]> {
    const params = new URLSearchParams();
    if (selectedPrinter) params.set('printer', selectedPrinter);
    if (selectedLevel) params.set('level', selectedLevel);
    if (selectedCategory) params.set('category', selectedCategory);
    if (piCursor > 0) params.set('since', piCursor.toString());
    params.set('limit', '500');

    const resp = await fetch(`/api/pi/logs?${params}`);
    const data = (await resp.json()) as { entries?: LogEntry[]; error?: string };
    if (data.error) {
      // On desktop the Pi may be unconfigured — don't let that hide the direct logs.
      if (!$isDesktop) error = data.error;
      return [];
    }
    error = '';
    return data.entries ?? [];
  }

  async function fetchDirectLogs(): Promise<LogEntry[]> {
    if (!$isDesktop) return [];
    const entries = await invokeTauri<LogEntry[]>('fetch_direct_logs', {
      since: directCursor,
      printer: selectedPrinter || null,
      level: selectedLevel || null,
      category: selectedCategory || null,
      limit: 500,
    });
    return entries ?? [];
  }

  async function fetchLogs(reset = false) {
    if (reset) {
      piCursor = 0;
      directCursor = 0;
      entries = [];
    }
    try {
      const [piNew, directNew] = await Promise.all([fetchPiLogs(), fetchDirectLogs()]);
      if (piNew.length) piCursor = Math.max(piCursor, ...piNew.map((e) => e.timestamp));
      if (directNew.length) directCursor = Math.max(directCursor, ...directNew.map((e) => e.timestamp));

      const combined = [...piNew, ...directNew].sort((a, b) => a.timestamp - b.timestamp);
      if (combined.length === 0 && !reset) return;

      entries = reset ? combined : [...entries, ...combined];
      if (entries.length > 2000) entries = entries.slice(-1500);

      if (shouldAutoScroll && logContainer) {
        requestAnimationFrame(() => {
          logContainer.scrollTop = logContainer.scrollHeight;
        });
      }
    } catch (e) {
      error = `Failed to fetch logs: ${e}`;
    }
  }

  let pollTicks = 0;
  function startPolling() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
      if (!isLive) return;
      fetchLogs(false);
      // Refresh the printer dropdown occasionally — desktop printers only appear
      // in the list once they've connected and logged something.
      if (++pollTicks % 5 === 0) fetchPrinters();
    }, 3000);
  }

  function handleScroll() {
    if (!logContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainer;
    shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 50;
  }

  function clearFilters() {
    selectedPrinter = '';
    selectedLevel = '';
    selectedCategory = '';
    searchText = '';
    fetchLogs(true);
  }

  // Re-fetch when filters change
  function onFilterChange() {
    fetchLogs(true);
  }

  let filteredEntries = $derived(
    searchText
      ? entries.filter(e => e.message.toLowerCase().includes(searchText.toLowerCase()))
      : entries
  );

  onMount(() => {
    fetchPrinters();
    fetchLogs(true);
    startPolling();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  });
</script>

<div class="min-h-screen bg-white dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100">
  <!-- Header -->
  <div class="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-4">
    <h1 class="text-lg font-semibold tracking-tight">Printer Logs</h1>

    <div class="ml-auto flex items-center gap-3">
      <BackToDashboard />
      {#if error}
        <span class="text-xs text-red-400">{error}</span>
      {/if}

      <button
        onclick={() => { isLive = !isLive; }}
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors
               {isLive
                 ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                 : 'bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700/80'}"
      >
        <span class="w-1.5 h-1.5 rounded-full {isLive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}"></span>
        {isLive ? 'Live' : 'Paused'}
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 flex flex-wrap items-center gap-2">
    <select
      bind:value={selectedPrinter}
      onchange={onFilterChange}
      class="bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
    >
      <option value="">All printers</option>
      {#each printers as p}
        <option value={p.name || p.serial}>{p.name || p.serial}</option>
      {/each}
    </select>

    <select
      bind:value={selectedLevel}
      onchange={onFilterChange}
      class="bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
    >
      <option value="">All levels</option>
      <option value="info">Info</option>
      <option value="warning">Warning</option>
      <option value="error">Error</option>
    </select>

    <select
      bind:value={selectedCategory}
      onchange={onFilterChange}
      class="bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
    >
      <option value="">All categories</option>
      {#each categories as cat}
        <option value={cat}>{cat}</option>
      {/each}
    </select>

    <input
      type="text"
      placeholder="Search messages..."
      bind:value={searchText}
      class="bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 placeholder-zinc-500 w-48"
    />

    {#if selectedPrinter || selectedLevel || selectedCategory || searchText}
      <button
        onclick={clearFilters}
        class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        Clear
      </button>
    {/if}

    <span class="ml-auto text-[10px] text-zinc-500 tabular-nums">{filteredEntries.length} entries</span>
  </div>

  <!-- Log entries -->
  <div
    bind:this={logContainer}
    onscroll={handleScroll}
    class="overflow-y-auto font-mono text-[11px] leading-relaxed"
    style="height: calc(100vh - 105px);"
  >
    {#if filteredEntries.length === 0 && !error}
      <div class="flex items-center justify-center h-full text-zinc-500 text-sm">
        {#if selectedPrinter || selectedLevel || selectedCategory}
          No logs match your filters
        {:else}
          Waiting for logs...
        {/if}
      </div>
    {:else}
      <table class="w-full">
        <tbody>
          {#each filteredEntries as entry}
            {@const levelClass = levelColors[entry.level] ?? 'text-zinc-400'}
            {@const catClass = categoryColors[entry.category] ?? 'bg-zinc-600/20 text-zinc-400'}
            <tr class="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30
                        {entry.level === 'error' ? 'bg-red-950/10' : entry.level === 'warning' ? 'bg-amber-950/5' : ''}">
              <td class="px-2 py-0.5 text-zinc-500 whitespace-nowrap align-top" title={formatTimeAgo(entry.timestamp)}>
                {formatTime(entry.timestamp)}
              </td>
              <td class="px-1 py-0.5 whitespace-nowrap align-top">
                <span class="inline-block px-1.5 py-0 rounded text-[10px] font-medium {catClass}">
                  {entry.category}
                </span>
              </td>
              <td class="px-1 py-0.5 whitespace-nowrap align-top {levelClass} font-medium" style="min-width: 50px;">
                {#if entry.level === 'warning'}WRN{:else if entry.level === 'error'}ERR{:else}INF{/if}
              </td>
              <td class="px-1 py-0.5 whitespace-nowrap align-top text-zinc-500" style="min-width: 80px;">
                {entry.printer_name || entry.printer_serial || ''}
              </td>
              <td class="px-2 py-0.5 {levelClass} break-all">
                {entry.message}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
