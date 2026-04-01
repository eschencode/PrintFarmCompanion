<script lang="ts">
  import type { PageData } from './$types';
  import ThreeMfUpload from '$lib/components/ThreeMfUpload.svelte';
  import EditModuleModal from '$lib/components/EditModuleModal.svelte';

  export let data: PageData;

  let modules = data.modules;
  let showUpload = false;
  let editingModule: any = null;
  let showEditModal = false;

  // Load data once at page level
  let spoolPresets: any[] = [];
  let printerModels: any[] = [];
  let inventoryItems: any[] = [];
  let dataLoaded = false;

  // Load all data once when page mounts
  async function loadData() {
    try {
      const [presetsRes, modelsRes, inventoryRes] = await Promise.all([
        fetch('/api/print-modules?presets=true'),
        fetch('/api/printer-models'),
        fetch('/api/inventory')
      ]);

      if (presetsRes.ok) {
        const result = await presetsRes.json() as any;
        if (result.success) spoolPresets = result.data;
      }

      if (modelsRes.ok) {
        const result = await modelsRes.json() as any;
        if (result.success) printerModels = result.data;
      }

      if (inventoryRes.ok) {
        const result = await inventoryRes.json() as any;
        if (result.success) {
          inventoryItems = result.data.map((item: any) => ({
            slug: item.slug,
            name: item.name
          }));
        }
      }

      dataLoaded = true;
    } catch (e) {
      console.warn('Failed to load data:', e);
      dataLoaded = true;
    }
  }

  // Load data on component mount
  $: if (typeof window !== 'undefined' && !dataLoaded) {
    loadData();
  }

  function formatTime(seconds: number | null): string {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  async function handleUploaded(e: CustomEvent<{ id: number; name: string }>) {
    showUpload = false;
    // Reload modules from the API
    const res = await fetch('/api/print-modules');
    const result = await res.json() as any;
    if (result.success) modules = result.data;
  }

  function openEditModal(module: any) {
    editingModule = module;
    showEditModal = true;
  }

  function closeEditModal() {
    showEditModal = false;
    // Reload modules from the API after closing modal
    fetch('/api/print-modules').then((res) => res.json()).then((result: any) => {
      if (result.success) modules = result.data;
    });
  }

  async function deleteModule(id: number) {
    const res = await fetch(`/api/print-modules?id=${id}`, { method: 'DELETE' });
    const result = await res.json() as any;
    if (result.success) {
      modules = modules.filter((m: any) => m.id !== id);
    }
  }
</script>

<svelte:head><title>Print Modules</title></svelte:head>

<div class="min-h-screen bg-zinc-50 dark:bg-[#0a0a0a] p-6">
  <!-- Header -->
  <div class="max-w-5xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <a href="/" aria-label="Go back" class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </a>
        <div>
          <h1 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Print Modules</h1>
          <p class="text-xs text-zinc-400 dark:text-zinc-500">{modules.length} module{modules.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <button
        onclick={() => (showUpload = !showUpload)}
        class="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Upload .3mf
      </button>
    </div>

    <!-- Upload panel -->
    {#if showUpload}
      <div class="mb-6">
        <ThreeMfUpload 
          {spoolPresets}
          {printerModels}
          {inventoryItems}
          on:uploaded={handleUploaded} 
        />
      </div>
    {/if}

    <!-- Module grid -->
    {#if modules.length === 0}
      <div class="text-center py-20 text-zinc-400 dark:text-zinc-600">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
        <p class="text-sm">No modules yet — upload a <span class="font-mono">.3mf</span> file to get started</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each modules as module (module.id)}
          <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden group">
            <!-- Thumbnail -->
            <div class="h-36 bg-zinc-100 dark:bg-[#1a1a1a] flex items-center justify-center overflow-hidden relative">
              {#if module.thumbnail}
                <img src={module.thumbnail} alt={module.name} class="w-full h-full object-cover" />
              {:else if module.image_path}
                <img src={module.image_path} alt={module.name} class="w-full h-full object-cover" />
              {:else}
                <svg class="w-10 h-10 text-zinc-300 dark:text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
              {/if}

              <!-- Pi badge -->
              {#if module.file_stored_on_pi}
                <div class="absolute top-2 right-2 bg-emerald-500/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full">Pi</div>
              {/if}
            </div>

            <!-- Info -->
            <div class="p-4">
              <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{module.name}</p>

              <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {#if module.spool_preset_name}
                  <span class="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {#if module.spool_preset_color}
                      <span class="w-2.5 h-2.5 rounded-full border border-zinc-300 dark:border-zinc-600 shrink-0" style="background:{module.spool_preset_color}"></span>
                    {/if}
                    {module.spool_preset_name}
                  </span>
                {/if}
                
                  <span class="text-xs text-zinc-400 dark:text-zinc-500">{(module.expected_weight)}g</span>
                
                {#if module.expected_time}
                  <span class="text-xs text-zinc-400 dark:text-zinc-500">{formatTime(module.expected_time)}</span>
                {/if}
                {#if module.plate_type}
                  <span class="text-xs text-zinc-400 dark:text-zinc-500">{module.plate_type}</span>
                {/if}
                {#if module.nozzle_diameter}
                  <span class="text-xs text-zinc-400 dark:text-zinc-500">{module.nozzle_diameter}mm</span>
                {/if}
              </div>

              <!-- File source indicators -->
              <div class="mt-2.5 flex gap-1.5">
                {#if module.local_file_handler_path}
                  <span class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">Local</span>
                {/if}
                {#if module.pi_file_path}
                  <span class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">Pi</span>
                {/if}
                {#if module.file_name && !module.local_file_handler_path && !module.pi_file_path}
                  <span class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">.3mf</span>
                {/if}
              </div>
            </div>

            <!-- Actions -->
            <div class="px-4 pb-4 space-y-2">
              <div class="flex gap-2">
                <button
                  onclick={() => openEditModal(module)}
                  class="flex-1 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg hover:bg-zinc-200 dark:hover:bg-[#262626] transition-colors flex items-center justify-center gap-1"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                  Edit
                </button>
                <button
                  onclick={() => deleteModule(module.id)}
                  class="px-3 py-2 text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10"
                  title="Delete module"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if editingModule}
  <EditModuleModal 
    module={editingModule} 
    isOpen={showEditModal} 
    {spoolPresets}
    {printerModels}
    {inventoryItems}
    on:close={closeEditModal} 
  />
{/if}
