<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let module: any;
  export let isOpen = false;
  export let spoolPresets: any[] = [];
  export let printerModels: any[] = [];
  export let inventoryItems: any[] = [];

  const dispatch = createEventDispatcher();

  type FilamentSlot = { slotIndex: number; spoolPresetId: number | null; weight: number | null };

  // Form state — mirrors the new schema field names
  let name = '';
  let estimatedTime = 0;
  let objectsPerPrint = 1;
  let nozzleDiameter: number | null = null;
  let slots: FilamentSlot[] = [];
  let objectId: number | null = null;
  let printerPresetId: number | null = null;

  function addSlot() {
    slots = [...slots, { slotIndex: slots.length, spoolPresetId: null, weight: null }];
  }

  function removeSlot(index: number) {
    slots = slots.filter((_, i) => i !== index).map((s, i) => ({ ...s, slotIndex: i }));
  }

  let isSaving = false;
  let error = '';

  // ── Inline new-object creation ────────────────────────────────────────────
  let showNewObjectForm = false;
  let newObjectName = '';
  let newObjectError = '';
  let savingNewObject = false;
  let createdObjects: { id: number; name: string }[] = [];
  $: allInventoryItems = [...inventoryItems, ...createdObjects];

  async function createNewObject() {
    newObjectError = '';
    const n = newObjectName.trim();
    if (!n) { newObjectError = 'Name is required'; return; }
    savingNewObject = true;
    try {
      const res = await fetch('/api/objects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n }),
      });
      const result = await res.json() as { success: boolean; data?: { id: number }; error?: string };
      if (result.success && result.data?.id) {
        createdObjects = [...createdObjects, { id: result.data.id, name: n }];
        objectId = result.data.id;
        showNewObjectForm = false;
        newObjectName = '';
      } else {
        newObjectError = result.error ?? 'Failed to create';
      }
    } catch {
      newObjectError = 'Network error';
    } finally {
      savingNewObject = false;
    }
  }

  // Populate form whenever the modal opens
  $: if (isOpen && module) {
    name = module.name ?? '';
    estimatedTime = module.expected_time_minutes ?? 0;
    objectsPerPrint = module.objects_per_print ?? 1;
    nozzleDiameter = module.nozzle_diameter ?? null;
    // module.slots is preferred (multi-slot); fall back to the legacy single-slot field.
    const rawSlots = Array.isArray(module.slots) && module.slots.length > 0
      ? module.slots.map((s: any) => ({
          slotIndex: s.slot_index,
          spoolPresetId: s.spool_preset_id ?? null,
          weight: s.weight ?? null,
        }))
      : module.default_spool_preset_id != null
        ? [{ slotIndex: 0, spoolPresetId: module.default_spool_preset_id, weight: null }]
        : [{ slotIndex: 0, spoolPresetId: null, weight: null }];
    slots = rawSlots.sort((a: FilamentSlot, b: FilamentSlot) => a.slotIndex - b.slotIndex);
    objectId = module.object_id ?? null;
    printerPresetId = module.printer_preset_id ?? null;
    error = '';
    showNewObjectForm = false;
    createdObjects = [];
  }

  function formatTime(min: number): string {
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  async function save() {
    isSaving = true;
    error = '';
    try {
      const res = await fetch(`/api/print-modules?id=${module.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          estimated_time: estimatedTime,
          objects_per_print: objectsPerPrint,
          nozzle_diameter: nozzleDiameter,
          slots: slots.map((s) => ({
            slot_index: s.slotIndex,
            spool_preset_id: s.spoolPresetId,
            weight: s.weight,
          })),
          object_id: objectId,
          printer_preset_id: printerPresetId,
        }),
      });
      const result = await res.json() as { success: boolean; error?: string };
      if (result.success) {
        dispatch('close');
      } else {
        error = result.error ?? 'Save failed';
      }
    } catch {
      error = 'Network error';
    } finally {
      isSaving = false;
    }
  }

  function close() {
    isOpen = false;
    dispatch('close');
  }
</script>

{#if isOpen}
  <div role="presentation" class="fixed inset-0 z-40 bg-black/50" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()}></div>

  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] w-full max-w-lg max-h-[92vh] flex flex-col">

      <!-- Header -->
      <div class="flex items-start gap-4 p-5 border-b border-zinc-100 dark:border-[#1e1e1e]">
        {#if module.thumbnail}
          <img src={module.thumbnail} alt="" class="w-14 h-14 rounded-lg object-cover shrink-0 bg-zinc-100 dark:bg-[#1a1a1a]" />
        {:else}
          <div class="w-14 h-14 rounded-lg bg-zinc-100 dark:bg-[#1a1a1a] shrink-0 flex items-center justify-center">
            <svg class="w-6 h-6 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </div>
        {/if}
        <div class="flex-1 min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 mb-1">Edit Module</p>
          <input
            type="text"
            bind:value={name}
            class="w-full text-base font-medium bg-transparent text-zinc-900 dark:text-zinc-100 focus:outline-none border-b border-transparent focus:border-zinc-300 dark:focus:border-zinc-600 transition-colors pb-0.5"
          />
          {#if module.filename}
            <p class="text-xs text-zinc-400 dark:text-zinc-600 mt-1 font-mono truncate">{module.filename}</p>
          {/if}
        </div>
        <button onclick={close} class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 shrink-0 mt-1">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Scrollable body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">

        <!-- Print settings -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="em-time" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">
              Time (min){estimatedTime ? ` — ${formatTime(estimatedTime)}` : ''}
            </label>
            <input id="em-time" type="number" bind:value={estimatedTime} min="0"
              class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors" />
          </div>
          <div>
            <label for="em-objs" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">Objects per Print</label>
            <input id="em-objs" type="number" bind:value={objectsPerPrint} min="1"
              class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors" />
          </div>
          <div>
            <label for="em-nozzle" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">Nozzle (mm)</label>
            <input id="em-nozzle" type="number" step="0.1"
              value={nozzleDiameter ?? ''}
              oninput={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); nozzleDiameter = isNaN(v) ? null : v; }}
              placeholder="0.4"
              class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors" />
          </div>
        </div>

        <!-- Filament slots -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Filament Slots ({slots.length})
            </span>
            <button
              type="button"
              onclick={addSlot}
              class="text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              + Add slot
            </button>
          </div>
          <div class="space-y-1.5">
            {#each slots as slot, i (i)}
              {@const preset = slot.spoolPresetId ? spoolPresets.find((p: any) => p.id === slot.spoolPresetId) : null}
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 w-5 text-right shrink-0">#{i + 1}</span>
                {#if preset?.color}
                  <span class="w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-600 shrink-0" style="background:{preset.color}"></span>
                {/if}
                <select
                  bind:value={slots[i].spoolPresetId}
                  class="flex-1 min-w-0 bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
                >
                  <option value={null}>Any spool</option>
                  {#each spoolPresets as p (p.id)}
                    <option value={p.id}>{p.brand} {p.color} ({p.material})</option>
                  {/each}
                </select>
                <div class="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={slots[i].weight ?? ''}
                    oninput={(e) => {
                      const v = parseInt((e.target as HTMLInputElement).value, 10);
                      slots[i].weight = isNaN(v) ? null : v;
                    }}
                    placeholder="—"
                    aria-label="Weight for slot {i + 1} (grams)"
                    class="w-24 bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-2 text-base font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors text-right tabular-nums"
                  />
                  <span class="text-xs text-zinc-400">g</span>
                </div>
                <button
                  type="button"
                  onclick={() => removeSlot(i)}
                  disabled={slots.length === 1}
                  class="text-zinc-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                  title="Remove slot"
                  aria-label="Remove slot {i + 1}"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>
          <p class="text-[10px] text-zinc-400 dark:text-zinc-600 mt-1">
            "Any spool" matches any loaded filament.
          </p>
        </div>

        <!-- Printer preset -->
        <div>
          <label for="em-printer" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">Printer Preset</label>
          <select id="em-printer" bind:value={printerPresetId}
            class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors">
            <option value={null}>None</option>
            {#each printerModels as m (m.id)}
              <option value={m.id}>{m.brand} {m.model}</option>
            {/each}
          </select>
        </div>

        <!-- Object (inventory) -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="em-object" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Object</label>
            <button type="button"
              onclick={() => { showNewObjectForm = !showNewObjectForm; newObjectName = ''; newObjectError = ''; }}
              class="text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
              {showNewObjectForm ? 'Cancel' : '+ New Object'}
            </button>
          </div>

          {#if showNewObjectForm}
            <div class="bg-zinc-50 dark:bg-[#161616] border border-zinc-200 dark:border-[#2a2a2a] rounded-lg p-3 space-y-2 mb-2">
              <input type="text" bind:value={newObjectName} placeholder="Object name"
                class="w-full bg-white dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#333] rounded px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500" />
              {#if newObjectError}<p class="text-[10px] text-red-500">{newObjectError}</p>{/if}
              <button type="button" onclick={createNewObject} disabled={savingNewObject || !newObjectName.trim()}
                class="w-full py-1 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {savingNewObject ? 'Creating…' : 'Create & Select'}
              </button>
            </div>
          {/if}

          <select id="em-object" bind:value={objectId}
            class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors">
            <option value={null}>None</option>
            {#each allInventoryItems as item (item.id)}
              <option value={item.id}>{item.name}</option>
            {/each}
          </select>
        </div>

      </div>

      <!-- Footer -->
      <div class="border-t border-zinc-100 dark:border-[#1e1e1e] p-4 flex items-center justify-between gap-3">
        {#if error}
          <p class="text-xs text-red-500 flex-1">{error}</p>
        {:else}
          <div class="flex-1"></div>
        {/if}
        <button onclick={close} class="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
          Cancel
        </button>
        <button onclick={save} disabled={isSaving || !name.trim()}
          class="px-4 py-2 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

    </div>
  </div>
{/if}
