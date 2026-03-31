<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  export let module: any;
  export let isOpen = false;

  const dispatch = createEventDispatcher();

  let formData: any = { ...module };
  let isSaving = false;
  let saveMessage = '';
  let spoolPresets: any[] = [];
  let loadingPresets = false;

  onMount(async () => {
    await loadSpoolPresets();
  });

  async function loadSpoolPresets() {
    loadingPresets = true;
    try {
      const response = await fetch('/api/print-modules?presets=true');
      const result = await response.json() as any;
      if (result.success) {
        spoolPresets = result.data;
      }
    } catch (error) {
      console.error('Failed to load spool presets:', error);
    } finally {
      loadingPresets = false;
    }
  }

  $: if (isOpen) {
    formData = { ...module };
    saveMessage = '';
  }

  async function saveChanges() {
    isSaving = true;
    saveMessage = '';

    try {
      const response = await fetch(`/api/print-modules?id=${module.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          expected_weight: formData.expected_weight ? parseInt(formData.expected_weight) : null,
          expected_time: formData.expected_time ? parseInt(formData.expected_time) : null,
          objects_per_print: formData.objects_per_print ? parseInt(formData.objects_per_print) : 1,
          plate_type: formData.plate_type || null,
          nozzle_diameter: formData.nozzle_diameter ? parseFloat(formData.nozzle_diameter) : null,
          default_spool_preset_id: formData.default_spool_preset_id ? parseInt(formData.default_spool_preset_id) : null,
          local_file_handler_path: formData.local_file_handler_path || null,
          inventory_slug: formData.inventory_slug || null,
          printer_model: formData.printer_model || null,
        }),
      });

      const result = await response.json() as any;
      if (result.success) {
        saveMessage = 'Module updated successfully!';
        setTimeout(() => {
          handleClose();
        }, 1000);
      } else {
        saveMessage = `Error: ${result.error || 'Unknown error'}`;
      }
    } catch (error) {
      saveMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    } finally {
      isSaving = false;
    }
  }

  function handleClose() {
    isOpen = false;
    dispatch('close');
  }

  function getSpoolPresetInfo(presetId: number | null) {
    if (!presetId) return null;
    return spoolPresets.find(p => p.id === presetId);
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div class="fixed inset-0 z-40 bg-black/50" onclick={handleClose}></div>

  <!-- Modal -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="sticky top-0 bg-white dark:bg-[#111] border-b border-zinc-100 dark:border-[#1e1e1e] p-6 flex items-center justify-between">
        <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Edit Module: {module.name}</h2>
        <button onclick={handleClose} class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 space-y-6">
        <!-- Basic Info Section -->
        <div>
          <h3 class="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Basic Information</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Module Name</label>
              <input
                type="text"
                bind:value={formData.name}
                class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#1a1a1a] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
              />
            </div>

            {#if module.file_name}
              <div>
                <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">File Name</label>
                <input type="text" value={module.file_name} disabled class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-zinc-50 dark:bg-[#0a0a0a] text-zinc-600 dark:text-zinc-400 cursor-not-allowed" />
              </div>
            {/if}

            {#if module.local_file_handler_path}
              <div>
                <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Local File Handler Path</label>
                <input type="text" bind:value={formData.local_file_handler_path} class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#1a1a1a] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600" />
              </div>
            {/if}

            {#if module.pi_file_path}
              <div>
                <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Pi File Path</label>
                <input type="text" value={module.pi_file_path} disabled class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-zinc-50 dark:bg-[#0a0a0a] text-zinc-600 dark:text-zinc-400 cursor-not-allowed" />
              </div>
            {/if}
          </div>
        </div>

        <!-- Filament/Spool Section -->
        <div>
          <h3 class="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Spool Preset</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Default Spool Preset</label>
              {#if loadingPresets}
                <div class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-zinc-50 dark:bg-[#1a1a1a] text-zinc-600 dark:text-zinc-400">
                  Loading presets...
                </div>
              {:else}
                <select
                  bind:value={formData.default_spool_preset_id}
                  class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#1a1a1a] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                >
                  <option value="">None</option>
                  {#each spoolPresets as preset (preset.id)}
                    <option value={preset.id}>
                      {preset.name} ({preset.material}{preset.color ? ` - ${preset.color}` : ''})
                    </option>
                  {/each}
                </select>
              {/if}
            </div>

            {#if formData.default_spool_preset_id && getSpoolPresetInfo(formData.default_spool_preset_id)}
              {@const spool = getSpoolPresetInfo(formData.default_spool_preset_id)}
              <div class="p-3 bg-zinc-50 dark:bg-[#0a0a0a] rounded-lg border border-zinc-200 dark:border-[#262626]">
                <h4 class="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Spool Details</h4>
                <div class="space-y-1 text-xs">
                  <div class="flex justify-between">
                    <span class="text-zinc-600 dark:text-zinc-400">Name:</span>
                    <span class="text-zinc-900 dark:text-zinc-100 font-medium">{spool.name}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-zinc-600 dark:text-zinc-400">Brand:</span>
                    <span class="text-zinc-900 dark:text-zinc-100">{spool.brand || '—'}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-zinc-600 dark:text-zinc-400">Material:</span>
                    <span class="text-zinc-900 dark:text-zinc-100">{spool.material}</span>
                  </div>
                  {#if spool.color}
                    <div class="flex justify-between items-center">
                      <span class="text-zinc-600 dark:text-zinc-400">Color:</span>
                      <div class="flex items-center gap-2">
                        <span class="w-3 h-3 rounded-full border border-zinc-300 dark:border-zinc-600" style="background:{spool.color}"></span>
                        <span class="text-zinc-900 dark:text-zinc-100">{spool.color}</span>
                      </div>
                    </div>
                  {/if}
                  <div class="flex justify-between">
                    <span class="text-zinc-600 dark:text-zinc-400">Default Weight:</span>
                    <span class="text-zinc-900 dark:text-zinc-100">{spool.default_weight}g</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-zinc-600 dark:text-zinc-400">In Storage:</span>
                    <span class="text-zinc-900 dark:text-zinc-100 font-medium">{spool.storage_count}</span>
                  </div>
                  {#if spool.cost}
                    <div class="flex justify-between">
                      <span class="text-zinc-600 dark:text-zinc-400">Cost:</span>
                      <span class="text-zinc-900 dark:text-zinc-100">${spool.cost.toFixed(2)}</span>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Print Settings Section -->
        <div>
          <h3 class="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Print Settings</h3>
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Expected Weight (g)</label>
                <input type="number" bind:value={formData.expected_weight} placeholder="0" class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#1a1a1a] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600" />
              </div>
              <div>
                <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Expected Time (seconds)</label>
                <input type="number" bind:value={formData.expected_time} placeholder="0" class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#1a1a1a] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Objects per Print</label>
                <input type="number" bind:value={formData.objects_per_print} placeholder="1" class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#1a1a1a] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600" />
              </div>
              <div>
                <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Nozzle Diameter (mm)</label>
                <input type="number" step="0.1" bind:value={formData.nozzle_diameter} placeholder="0.4" class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#1a1a1a] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600" />
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Plate Type</label>
              <input type="text" bind:value={formData.plate_type} placeholder="e.g., Textured, Smooth" class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#1a1a1a] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600" />
            </div>
          </div>
        </div>

        <!-- Additional Info Section -->
        <div>
          <h3 class="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Additional Information</h3>
          <div class="space-y-4">
            {#if module.inventory_slug !== undefined}
              <div>
                <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Inventory Slug</label>
                <input type="text" bind:value={formData.inventory_slug} class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#1a1a1a] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600" />
              </div>
            {/if}

            {#if module.printer_model !== undefined}
              <div>
                <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Printer Model</label>
                <input type="text" bind:value={formData.printer_model} class="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-[#262626] rounded-lg bg-white dark:bg-[#1a1a1a] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600" />
              </div>
            {/if}
          </div>
        </div>

        <!-- Status Info -->
        <div class="p-4 bg-zinc-50 dark:bg-[#0a0a0a] rounded-lg border border-zinc-200 dark:border-[#262626]">
          <h3 class="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Status Information</h3>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between">
              <span class="text-zinc-600 dark:text-zinc-400">Module ID:</span>
              <span class="text-zinc-900 dark:text-zinc-100 font-mono">{module.id}</span>
            </div>
            {#if module.file_name}
              <div class="flex justify-between">
                <span class="text-zinc-600 dark:text-zinc-400">File Type:</span>
                <span class="text-zinc-900 dark:text-zinc-100">.3mf</span>
              </div>
            {/if}
            {#if module.file_stored_on_pi}
              <div class="flex justify-between">
                <span class="text-zinc-600 dark:text-zinc-400">Stored on Pi:</span>
                <span class="text-emerald-600 dark:text-emerald-400 font-medium">Yes</span>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="sticky bottom-0 bg-zinc-50 dark:bg-[#0a0a0a] border-t border-zinc-100 dark:border-[#1e1e1e] p-6 flex gap-3">
        {#if saveMessage}
          <div class="flex-1 px-3 py-2 rounded-lg text-xs font-medium {saveMessage.includes('successfully') ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}">
            {saveMessage}
          </div>
        {/if}
        <button onclick={handleClose} class="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg hover:bg-zinc-50 dark:hover:bg-[#262626] transition-colors">
          Cancel
        </button>
        <button
          onclick={saveChanges}
          disabled={isSaving}
          class="px-4 py-2 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Smooth scrolling for modal */
  :global(body) {
    overflow: auto;
  }
</style>

