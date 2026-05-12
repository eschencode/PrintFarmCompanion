<script lang="ts">
  import type { PageData } from './$types';
  import ConnectionsSection from '$lib/components/settings/ConnectionsSection.svelte';
  import AutoQueueSection from '$lib/components/settings/AutoQueueSection.svelte';

  export let data: PageData;
</script>

<div class="min-h-screen p-6 sm:p-10">
  <div class="max-w-2xl mx-auto">

    <div class="mb-8">
      <a href="/settings" class="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mb-4 tracking-wide transition-colors">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Settings
      </a>
      <h1 class="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Connections</h1>
      <p class="text-zinc-400 dark:text-zinc-500 text-sm mt-1">Connection modes, auto-queue and quick-start behavior</p>
    </div>

    <div class="space-y-4">
      <ConnectionsSection printers={data.printers as any[]} />
      <AutoQueueSection />
    </div>

  </div>
</div>
