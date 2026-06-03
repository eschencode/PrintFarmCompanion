<script lang="ts">
  import { goto } from '$app/navigation';
</script>

<div class="min-h-screen p-6 sm:p-10">
  <div class="max-w-3xl mx-auto">

    <div class="mb-10">
      <a
        href="/"
        onclick={(e) => { e.preventDefault(); goto('/'); }}
        class="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mb-4 tracking-wide transition-colors"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Dashboard
      </a>
      <h1 class="text-[2rem] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-none">Settings</h1>
      <p class="text-zinc-400 dark:text-zinc-500 text-sm mt-2">Configure your workspace</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">

      <a href="/settings/printers" class="group flex items-start gap-4 p-5 bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
        <div class="w-10 h-10 rounded-lg bg-zinc-50 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0 group-hover:bg-zinc-100 dark:group-hover:bg-[#222] transition-colors">
          <svg class="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 17H7a2 2 0 01-2-2V9a2 2 0 012-2h1V5a1 1 0 011-1h6a1 1 0 011 1v2h1a2 2 0 012 2v6a2 2 0 01-2 2zM9 17v2h6v-2M9 12h.01"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Printers</p>
          <p class="text-xs text-zinc-400 mt-0.5 leading-relaxed">Printer models and individual printer configuration</p>
        </div>
        <svg class="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0 mt-0.5 group-hover:text-zinc-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </a>

      <a href="/settings/materials" class="group flex items-start gap-4 p-5 bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
        <div class="w-10 h-10 rounded-lg bg-zinc-50 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0 group-hover:bg-zinc-100 dark:group-hover:bg-[#222] transition-colors">
          <svg class="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 3L2 9l10 6 10-6-10-6zM2 17l10 6 10-6M2 13l10 6 10-6"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Materials</p>
          <p class="text-xs text-zinc-400 mt-0.5 leading-relaxed">Spool presets and filament templates</p>
        </div>
        <svg class="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0 mt-0.5 group-hover:text-zinc-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </a>

      <a href="/settings/dashboard" class="group flex items-start gap-4 p-5 bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
        <div class="w-10 h-10 rounded-lg bg-zinc-50 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0 group-hover:bg-zinc-100 dark:group-hover:bg-[#222] transition-colors">
          <svg class="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Dashboard</p>
          <p class="text-xs text-zinc-400 mt-0.5 leading-relaxed">Grid layout presets for the dashboard view</p>
        </div>
        <svg class="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0 mt-0.5 group-hover:text-zinc-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </a>

      <a href="/settings/integrations" class="group flex items-start gap-4 p-5 bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
        <div class="w-10 h-10 rounded-lg bg-zinc-50 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0 group-hover:bg-zinc-100 dark:group-hover:bg-[#222] transition-colors">
          <svg class="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Integrations</p>
          <p class="text-xs text-zinc-400 mt-0.5 leading-relaxed">Shopify sync and SKU → inventory mappings</p>
        </div>
        <svg class="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0 mt-0.5 group-hover:text-zinc-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </a>

      <a href="/settings/connections" class="group flex items-start gap-4 p-5 bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
        <div class="w-10 h-10 rounded-lg bg-zinc-50 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0 group-hover:bg-zinc-100 dark:group-hover:bg-[#222] transition-colors">
          <svg class="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Connections</p>
          <p class="text-xs text-zinc-400 mt-0.5 leading-relaxed">Connection modes and quick-start behavior</p>
        </div>
        <svg class="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0 mt-0.5 group-hover:text-zinc-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </a>

      <a href="/modules" class="group flex items-start gap-4 p-5 bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
        <div class="w-10 h-10 rounded-lg bg-zinc-50 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0 group-hover:bg-zinc-100 dark:group-hover:bg-[#222] transition-colors">
          <svg class="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">Print Modules</p>
          <p class="text-xs text-zinc-400 mt-0.5 leading-relaxed">Upload .3mf files and manage print configurations</p>
        </div>
        <svg class="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0 mt-0.5 group-hover:text-zinc-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </a>

    </div>

    <div class="flex flex-wrap gap-2 mt-8">
      <a href="/recommendations"
        class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-[#161616] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-[#1f1f1f] transition-colors">
        Recommendations Logs
      </a>
      <a href="/logs"
        class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-[#161616] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-[#1f1f1f] transition-colors">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
        </svg>
        Pi Logs
      </a>
    </div>

  </div>
</div>
