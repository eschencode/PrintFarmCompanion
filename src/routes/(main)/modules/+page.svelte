<script lang="ts">
  import type { PageData } from './$types';
  import ThreeMfUpload from '$lib/components/ThreeMfUpload.svelte';
  import ZipBulkUpload from '$lib/components/ZipBulkUpload.svelte';
  import EditModuleModal from '$lib/components/EditModuleModal.svelte';
  import { fileHandlerStore } from '$lib/stores/fileHandler';

  export let data: PageData;

  // Decorate raw modules with derived display fields that no longer exist
  // as columns in the new schema (printer_model_name, slot summaries, etc.).
  function decorateModule(m: any) {
    const printerModelName =
      m.printer_preset_brand && m.printer_preset_model
        ? `${m.printer_preset_brand} ${m.printer_preset_model}`
        : null;

    // Build a chip per slot. spool_preset_id === null = "Any spool" wildcard.
    const presetsList = data.spoolPresets ?? [];
    const rawSlots = Array.isArray(m.slots) && m.slots.length > 0
      ? m.slots
      : m.default_spool_preset_id != null
        ? [{ slot_index: 0, spool_preset_id: m.default_spool_preset_id }]
        : [];

    const slot_chips = rawSlots
      .slice()
      .sort((a: any, b: any) => a.slot_index - b.slot_index)
      .map((s: any) => {
        const weight = typeof s.weight === 'number' ? s.weight : null;
        if (s.spool_preset_id == null) {
          return { name: 'Any spool', color: null as string | null, isAny: true, weight };
        }
        const p = presetsList.find((pp: any) => pp.id === s.spool_preset_id);
        return p
          ? {
              name: `${p.brand} ${p.material}${p.color ? ' ' + p.color : ''}`,
              color: p.color ?? null,
              isAny: false,
              weight,
            }
          : { name: 'Unknown spool', color: null, isAny: false, weight };
      });

    // Filter key: list of preset display names (or "Any spool"). Used for chip filtering.
    const slot_filter_keys: string[] = slot_chips.map((c: any) => c.name);

    return {
      ...m,
      printer_model_name: printerModelName,
      slot_chips,
      slot_filter_keys,
      plate_type: m.plate_preset_name ?? null,
    };
  }

  let modules: any[] = (data.modules ?? []).map(decorateModule);
  let showUpload = false;
  let showZipUpload = false;
  let editingModule: any = null;
  let showEditModal = false;
  $: fileHandlerState = $fileHandlerStore;

  // ── Filter state ────────────────────────────────────────────────────────────
  let filterModel = 'all';   // 'all' | printer_model_name | '__none__'
  let filterPlate = 'all';   // 'all' | plate_type
  let filterPreset = 'all';  // 'all' | spool_preset_name
  let hideInactive = false;  // when true, hide inactive cards

  // ── Derived filter options ──────────────────────────────────────────────────
  $: allModels = (() => {
    const names = modules.map((m: any) => m.printer_model_name as string | null);
    const unique = [...new Set(names)].sort((a, b) => {
      if (a == null) return 1;
      if (b == null) return -1;
      return a.localeCompare(b);
    });
    return unique;
  })();

  $: allPlates = (() => {
    const plates = modules
      .filter((m: any) => m.plate_type)
      .map((m: any) => m.plate_type as string);
    return [...new Set(plates)].sort();
  })();

  $: allPresets = (() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const m of modules) {
      for (const k of (m.slot_filter_keys ?? []) as string[]) {
        if (!seen.has(k)) { seen.add(k); names.push(k); }
      }
    }
    return names.sort((a, b) => a.localeCompare(b));
  })();

  // ── Filtered + grouped modules ──────────────────────────────────────────────
  $: filteredModules = modules.filter((m: any) => {
    if (hideInactive && !m.active) return false;
    const modelKey = m.printer_model_name ?? null;
    if (filterModel !== 'all') {
      if (filterModel === '__none__' && modelKey !== null) return false;
      if (filterModel !== '__none__' && modelKey !== filterModel) return false;
    }
    if (filterPlate !== 'all' && m.plate_type !== filterPlate) return false;
    if (filterPreset !== 'all' && !((m.slot_filter_keys ?? []) as string[]).includes(filterPreset)) return false;
    return true;
  });

  $: groupedModules = (() => {
    const groups: Record<string, any[]> = {};
    for (const m of filteredModules) {
      const key = m.printer_model_name ?? 'Uncategorized';
      (groups[key] ??= []).push(m);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    });
  })();

  $: activeCount = modules.filter((m: any) => m.active).length;
  $: inactiveCount = modules.filter((m: any) => !m.active).length;

  // ── Auxiliary data from server load ────────────────────────────────────────
  $: spoolPresets = data.spoolPresets ?? [];
  $: printerModels = data.printerPresets ?? [];
  $: inventoryItems = (data.objects ?? []).map((o: any) => ({ id: o.id, name: o.name }));

  function formatTime(minutes: number | null): string {
    if (!minutes) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  async function reloadModules() {
    const res = await fetch('/api/print-modules');
    const result = await res.json() as any;
    if (result.success) modules = (result.data ?? []).map(decorateModule);
  }

  async function handleUploaded() {
    showUpload = false;
    await reloadModules();
  }

  async function handleZipUploaded() {
    showZipUpload = false;
    await reloadModules();
  }

  function openEditModal(module: any) {
    editingModule = module;
    showEditModal = true;
  }

  async function closeEditModal() {
    showEditModal = false;
    await reloadModules();
  }

  async function deleteModule(module: any) {
    if (!confirm(`Delete "${module.name}"?`)) return;
    const res = await fetch(`/api/print-modules?id=${module.id}`, { method: 'DELETE' });
    const result = await res.json() as any;
    if (result.success) {
      modules = modules.filter((m: any) => m.id !== module.id);
      if (result.local_file_handler_path && fileHandlerState.connected && fileHandlerState.token) {
        fetch('http://127.0.0.1:3001/file', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json', 'x-auth-token': fileHandlerState.token },
          body: JSON.stringify({ filePath: result.local_file_handler_path }),
        }).catch(() => {});
      }
    }
  }

  // Optimistic toggle — update locally first, then persist
  async function toggleActive(module: any) {
    const newActive = module.active ? 0 : 1;
    module.active = newActive;
    modules = [...modules]; // trigger reactivity
    await fetch(`/api/print-modules?id=${module.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: newActive }),
    });
  }
</script>

<svelte:head><title>Print Modules</title></svelte:head>

<div class="min-h-screen bg-zinc-50 dark:bg-[#0a0a0a] p-6">
  <div class="max-w-5xl mx-auto">

    <!-- Header -->
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3">
        <a href="/" aria-label="Go back" class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </a>
        <div>
          <h1 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Print Modules</h1>
          <p class="text-xs text-zinc-400 dark:text-zinc-500">
            {activeCount} active
            {#if inactiveCount > 0}· {inactiveCount} inactive{/if}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          onclick={() => { showZipUpload = !showZipUpload; showUpload = false; }}
          class="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          Bulk ZIP
        </button>
        <button
          onclick={() => { showUpload = !showUpload; showZipUpload = false; }}
          class="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Upload .3mf
        </button>
      </div>
    </div>

    <!-- Upload panels -->
    {#if showUpload}
      <div class="mb-5">
        <ThreeMfUpload {spoolPresets} {printerModels} {inventoryItems} on:uploaded={handleUploaded} />
      </div>
    {/if}
    {#if showZipUpload}
      <div class="mb-5">
        <ZipBulkUpload {spoolPresets} {printerModels} on:done={handleZipUploaded} />
      </div>
    {/if}

    <!-- Filter bar -->
    {#if modules.length > 0}
      <div class="flex flex-wrap items-center gap-2 mb-5">

        <!-- Model filter chips -->
        <div class="flex flex-wrap gap-1.5">
          <button
            onclick={() => filterModel = 'all'}
            class="px-3 py-1 text-xs rounded-full font-medium transition-colors
              {filterModel === 'all'
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}"
          >
            All models
          </button>
          {#each allModels as model}
            {@const key = model ?? '__none__'}
            {@const label = model ?? 'No model'}
            <button
              onclick={() => filterModel = key}
              class="px-3 py-1 text-xs rounded-full font-medium transition-colors
                {filterModel === key
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}"
            >
              {label}
            </button>
          {/each}
        </div>

        <!-- Divider -->
        {#if allPlates.length > 0}
          <div class="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1"></div>

          <!-- Plate filter chips -->
          <button
            onclick={() => filterPlate = 'all'}
            class="px-3 py-1 text-xs rounded-full font-medium transition-colors
              {filterPlate === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}"
          >
            All plates
          </button>
          {#each allPlates as plate}
            <button
              onclick={() => filterPlate = plate}
              class="px-3 py-1 text-xs rounded-full font-medium transition-colors
                {filterPlate === plate
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}"
            >
              {plate}
            </button>
          {/each}
        {/if}

        <!-- Spool preset / color filter chips -->
        {#if allPresets.length > 1}
          <div class="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1"></div>
          <button
            onclick={() => filterPreset = 'all'}
            class="px-3 py-1 text-xs rounded-full font-medium transition-colors
              {filterPreset === 'all'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}"
          >
            All colors
          </button>
          {#each allPresets as preset}
            <button
              onclick={() => filterPreset = preset}
              class="px-3 py-1 text-xs rounded-full font-medium transition-colors
                {filterPreset === preset
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}"
            >
              {preset}
            </button>
          {/each}
        {/if}

        <!-- Active filter toggle -->
        {#if inactiveCount > 0}
          <div class="ml-auto">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <span class="text-xs text-zinc-400 dark:text-zinc-500">Hide inactive</span>
              <button
                role="switch"
                aria-checked={hideInactive}
                aria-label="Hide inactive modules"
                onclick={() => hideInactive = !hideInactive}
                class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                  {hideInactive ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-300 dark:bg-zinc-600'}"
              >
                <span class="inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-zinc-900 shadow transition-transform
                  {hideInactive ? 'translate-x-4.5' : 'translate-x-0.75'}"></span>
              </button>
            </label>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Module groups -->
    {#if modules.length === 0}
      <div class="text-center py-20 text-zinc-400 dark:text-zinc-600">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
        <p class="text-sm">No modules yet — upload a <span class="font-mono">.3mf</span> file to get started</p>
      </div>
    {:else if filteredModules.length === 0}
      <div class="text-center py-16 text-zinc-400 dark:text-zinc-600">
        <p class="text-sm">No modules match the current filters</p>
        <button onclick={() => { filterModel = 'all'; filterPlate = 'all'; filterPreset = 'all'; hideInactive = false; }}
          class="mt-2 text-xs text-blue-500 hover:underline">Clear filters</button>
      </div>
    {:else}
      {#each groupedModules as [groupName, groupModules]}
        <!-- Group header — only show when showing all models -->
        {#if filterModel === 'all' && groupedModules.length > 1}
          <div class="flex items-center gap-3 mb-3 mt-6 first:mt-0">
            <span class="text-xs font-semibold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase">{groupName}</span>
            <div class="flex-1 h-px bg-zinc-200 dark:bg-[#1e1e1e]"></div>
            <span class="text-xs text-zinc-300 dark:text-zinc-700">{groupModules.length}</span>
          </div>
        {/if}

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
          {#each groupModules as module (module.id)}
            <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden group transition-opacity
              {module.active ? '' : 'opacity-50'}">

              <!-- Thumbnail -->
              <div class="h-36 bg-zinc-100 dark:bg-[#1a1a1a] flex items-center justify-center overflow-hidden relative">
                {#if module.thumbnail}
                  <img src={module.thumbnail} alt={module.name} class="w-full h-full object-cover" />
                {:else}
                  <svg class="w-10 h-10 text-zinc-300 dark:text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                  </svg>
                {/if}

                <!-- Inactive badge -->
                {#if !module.active}
                  <div class="absolute inset-0 flex items-center justify-center bg-black/20">
                    <span class="text-[10px] font-semibold text-white bg-zinc-900/70 px-2 py-0.5 rounded-full tracking-wide">INACTIVE</span>
                  </div>
                {/if}
              </div>

              <!-- Info -->
              <div class="p-4 pb-2">
                <div class="flex items-start justify-between gap-2">
                  <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{module.name}</p>
                  <!-- Active toggle switch -->
                  <button
                    role="switch"
                    aria-checked={!!module.active}
                    aria-label={module.active ? 'Disable recommendations for this module' : 'Enable recommendations for this module'}
                    onclick={() => toggleActive(module)}
                    class="relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors mt-0.5
                      {module.active ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}"
                  >
                    <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform
                      {module.active ? 'translate-x-4.5' : 'translate-x-0.75'}"></span>
                  </button>
                </div>

                <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {#each (module.slot_chips ?? []) as chip}
                    <span class="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {#if chip.color}
                        <span class="w-2.5 h-2.5 rounded-full border border-zinc-300 dark:border-zinc-600 shrink-0" style="background:{chip.color}"></span>
                      {:else if chip.isAny}
                        <span class="w-2.5 h-2.5 rounded-full border border-dashed border-zinc-400 dark:border-zinc-500 shrink-0"></span>
                      {/if}
                      {chip.name}{#if chip.weight != null}<span class="text-zinc-400 dark:text-zinc-500 ml-1">{chip.weight}g</span>{/if}
                    </span>
                  {/each}
                  {#if module.weight}
                    <span class="text-xs text-zinc-400 dark:text-zinc-500">{module.weight}g</span>
                  {/if}
                  {#if module.expected_time_minutes}
                    <span class="text-xs text-zinc-400 dark:text-zinc-500">{formatTime(module.expected_time_minutes)}</span>
                  {/if}
                  {#if module.plate_type}
                    <span class="text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{module.plate_type}</span>
                  {/if}
                  {#if module.nozzle_diameter}
                    <span class="text-xs text-zinc-400 dark:text-zinc-500">{module.nozzle_diameter}mm</span>
                  {/if}
                </div>

                <!-- File indicator -->
                <div class="mt-2 flex gap-1.5">
                  {#if module.filename}
                    <span class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 truncate max-w-full" title={module.filename}>
                      {module.filename.split('/').pop()}
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Actions -->
              <div class="px-4 pb-4 pt-2">
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
                    onclick={() => deleteModule(module)}
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
      {/each}
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
