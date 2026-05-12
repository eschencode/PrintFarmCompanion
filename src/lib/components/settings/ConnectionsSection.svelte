<script lang="ts">
  import { fileHandlerStore } from '$lib/stores/fileHandler';
  import { fileHandlerEnabled, directPrinterEnabled, printerPiEnabled, manualModeEnabled } from '$lib/stores/connectionToggles';
  import { isDesktop } from '$lib/stores/desktop';
  import type { Printer } from '$lib/types';

  /**
   * Settings section for enabling/disabling and testing the three printer connection modes:
   * File Handler (local .3mf opener), Direct Printer (Tauri MQTT), and Printer Pi (bridge).
   * Each connection manages its own test state internally.
   */
  export let printers: Printer[];

  $: fhEnabled = $fileHandlerEnabled;
  $: dpEnabled = $directPrinterEnabled;
  $: piEnabled = $printerPiEnabled;
  $: manualEnabled = $manualModeEnabled;
  $: desktop = $isDesktop;

  let fileHandlerToken = '';

  let testStatus: Record<string, { testing: boolean; result: 'untested' | 'success' | 'failed' }> = {
    fileHandler: { testing: false, result: 'untested' },
    directPrinter: { testing: false, result: 'untested' },
    printerPi: { testing: false, result: 'untested' },
  };

  function saveFileHandlerToken() {
    fileHandlerStore.setToken(fileHandlerToken);
    testStatus = { ...testStatus, fileHandler: { testing: false, result: 'untested' } };
  }

  async function testFileHandler() {
    if (!desktop && !fileHandlerToken) return;
    testStatus = { ...testStatus, fileHandler: { testing: true, result: 'untested' } };
    const connected = await fileHandlerStore.testConnection();
    testStatus = { ...testStatus, fileHandler: { testing: false, result: connected ? 'success' : 'failed' } };
  }

  async function testDirectPrinter() {
    testStatus = { ...testStatus, directPrinter: { testing: true, result: 'untested' } };
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      if (typeof invoke === 'function') {
        testStatus = { ...testStatus, directPrinter: { testing: false, result: 'success' } };
      } else {
        testStatus = { ...testStatus, directPrinter: { testing: false, result: 'failed' } };
      }
    } catch {
      testStatus = { ...testStatus, directPrinter: { testing: false, result: 'failed' } };
    }
  }

  async function testPrinterPi() {
    const serial = printers.find(p => p.printer_serial)?.printer_serial;
    if (!serial) {
      testStatus = { ...testStatus, printerPi: { testing: false, result: 'failed' } };
      return;
    }
    testStatus = { ...testStatus, printerPi: { testing: true, result: 'untested' } };
    try {
      const res = await fetch(`/api/pi/status?serial=${serial}`);
      const d = await res.json() as { pi_available?: boolean };
      testStatus = { ...testStatus, printerPi: { testing: false, result: d.pi_available ? 'success' : 'failed' } };
    } catch {
      testStatus = { ...testStatus, printerPi: { testing: false, result: 'failed' } };
    }
  }
</script>

<div id="connections" class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden mb-10">
  <div class="px-5 py-4 border-b border-zinc-50 dark:border-[#1a1a1a]">
    <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Connections</p>
    <p class="text-xs text-zinc-400 mt-1">Enable or disable the services your print farm relies on. Each connection can be tested independently.</p>
  </div>
  <div class="p-5 space-y-5">

    <!-- ── File Handler ── -->
    <div class="rounded-lg border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden">
      <div class="px-4 py-3 bg-zinc-50 dark:bg-[#161616] flex items-center justify-between gap-4">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">File Handler</p>
        </div>
        <button
          type="button"
          onclick={() => fileHandlerEnabled.toggle()}
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors {fhEnabled ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}"
          role="switch"
          aria-checked={fhEnabled}
          aria-label="Toggle File Handler"
        >
          <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform {fhEnabled ? 'translate-x-6' : 'translate-x-1'}"></span>
        </button>
      </div>
      <div class="px-4 py-3 space-y-3">
        <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {desktop
            ? 'A bundled background service that automatically opens .3mf files in Bambu Studio when you start a print. Runs as a sidecar inside the desktop app — no setup needed.'
            : 'A local server that opens .3mf files in Bambu Studio when you start a print. Requires a running file handler process and an auth token to connect.'}
        </p>
        {#if fhEnabled}
          {#if !desktop}
            <div>
              <label for="fileHandlerToken" class="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block mb-1">Auth Token</label>
              <div class="flex gap-2">
                <input
                  type="text"
                  id="fileHandlerToken"
                  bind:value={fileHandlerToken}
                  placeholder="Paste token from file handler"
                  class="flex-1 h-8 bg-white dark:bg-[#111] border border-zinc-200 dark:border-[#262626] rounded-md px-2.5 text-xs text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 font-mono focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
                />
                <button onclick={saveFileHandlerToken}
                  class="h-8 px-3 rounded-md text-[11px] font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors">
                  Save
                </button>
              </div>
            </div>
          {/if}
          <div class="flex items-center gap-2.5">
            <button onclick={testFileHandler}
              disabled={testStatus.fileHandler.testing || (!desktop && !fileHandlerToken)}
              class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {testStatus.fileHandler.testing ? 'Testing...' : 'Test'}
            </button>
            {#if testStatus.fileHandler.result === 'success'}
              <span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                Connected
              </span>
            {:else if testStatus.fileHandler.result === 'failed'}
              <span class="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                Offline
              </span>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- ── Direct Printer (Tauri MQTT) ── -->
    <div class="rounded-lg border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden">
      <div class="px-4 py-3 bg-zinc-50 dark:bg-[#161616] flex items-center justify-between gap-4">
        <div class="flex-1 min-w-0 flex items-center gap-2">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Direct Printer</p>
          {#if !desktop}
            <span class="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">Desktop only</span>
          {/if}
        </div>
        <button
          type="button"
          onclick={() => directPrinterEnabled.toggle()}
          disabled={!desktop}
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors {!desktop ? 'opacity-40 cursor-not-allowed' : ''} {dpEnabled && desktop ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}"
          role="switch"
          aria-checked={dpEnabled && desktop}
          aria-label="Toggle Direct Printer"
        >
          <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform {dpEnabled && desktop ? 'translate-x-6' : 'translate-x-1'}"></span>
        </button>
      </div>
      <div class="px-4 py-3 space-y-3">
        <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Connects directly to Bambu Lab printers on your local network using MQTT. Enables real-time status updates, sending print commands, and starting prints without going through the Pi. Requires the desktop app — each printer needs an IP, serial number, and access code configured.
        </p>
        {#if dpEnabled && desktop}
          <div class="flex items-center gap-2.5">
            <button onclick={testDirectPrinter}
              disabled={testStatus.directPrinter.testing}
              class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {testStatus.directPrinter.testing ? 'Testing...' : 'Test'}
            </button>
            {#if testStatus.directPrinter.result === 'success'}
              <span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                Tauri bridge available
              </span>
            {:else if testStatus.directPrinter.result === 'failed'}
              <span class="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                Tauri bridge unavailable
              </span>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- ── Manual ── -->
    <div class="rounded-lg border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden">
      <div class="px-4 py-3 bg-zinc-50 dark:bg-[#161616] flex items-center justify-between gap-4">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Manual</p>
        </div>
        <button
          type="button"
          onclick={() => manualModeEnabled.toggle()}
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors {manualEnabled ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}"
          role="switch"
          aria-checked={manualEnabled}
          aria-label="Toggle Manual Mode"
        >
          <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform {manualEnabled ? 'translate-x-6' : 'translate-x-1'}"></span>
        </button>
      </div>
      <div class="px-4 py-3">
        <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Tracks prints without connecting to any printer. Starting a print registers the job using the module's estimated time and weight — progress is time-based. Confirm or fail prints manually when done. Overrides all other connection modes while enabled.
        </p>
      </div>
    </div>

    <!-- ── Printer Pi ── -->
    <div class="rounded-lg border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden">
      <div class="px-4 py-3 bg-zinc-50 dark:bg-[#161616] flex items-center justify-between gap-4">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Printer Pi</p>
        </div>
        <button
          type="button"
          onclick={() => printerPiEnabled.toggle()}
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors {piEnabled ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}"
          role="switch"
          aria-checked={piEnabled}
          aria-label="Toggle Printer Pi"
        >
          <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform {piEnabled ? 'translate-x-6' : 'translate-x-1'}"></span>
        </button>
      </div>
      <div class="px-4 py-3 space-y-3">
        <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          A Raspberry Pi on your local network acts as a bridge to your printers via a Cloudflare tunnel. Handles file uploads, print commands, and live status polling. Works from any browser — no desktop app needed. Requires PI_TUNNEL_URL to be configured on the server.
        </p>
        {#if piEnabled}
          <div class="flex items-center gap-2.5">
            <button onclick={testPrinterPi}
              disabled={testStatus.printerPi.testing}
              class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-zinc-200 dark:border-[#262626] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {testStatus.printerPi.testing ? 'Testing...' : 'Test'}
            </button>
            {#if testStatus.printerPi.result === 'success'}
              <span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                Pi reachable
              </span>
            {:else if testStatus.printerPi.result === 'failed'}
              <span class="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                {printers.some(p => p.printer_serial) ? 'Pi unreachable' : 'No printers with serial configured'}
              </span>
            {/if}
          </div>
        {/if}
      </div>
    </div>

  </div>
</div>
