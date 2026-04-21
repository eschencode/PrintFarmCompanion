<script lang="ts">
  import JSZip from 'jszip';
  import { createEventDispatcher } from 'svelte';
  import { normalizePlateType } from '$lib/plate-types';

  const dispatch = createEventDispatcher<{ done: void }>();

  export let spoolPresets: any[] = [];
  export let printerModels: any[] = [];

  let isDragging = false;
  let fileInput: HTMLInputElement;
  let extracting = false;
  let error: string | null = null;

  type EntryState = 'pending' | 'uploading' | 'done' | 'error';

  type ZipEntry = {
    fileName: string;
    name: string;             // editable module name
    blob: Blob;
    thumbnail: string | null;
    estimatedTime: number | null;
    expectedWeight: number | null;
    nozzleDiameter: number | null;
    plateType: string | null;
    objectsPerPrint: number;
    defaultSpoolPresetId: number | null;
    printerModel: string | null;
    state: EntryState;
    errorMsg: string | null;
  };

  let entries: ZipEntry[] = [];
  let uploading = false;
  let doneCount = 0;

  // ── Drop / file input ────────────────────────────────────────────────────────

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) await processZip(f);
  }

  async function handleFileInput(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) await processZip(f);
  }

  async function processZip(f: File) {
    if (!f.name.toLowerCase().endsWith('.zip')) {
      error = 'Please drop a .zip file containing .3mf files';
      return;
    }
    extracting = true;
    error = null;
    entries = [];
    doneCount = 0;

    try {
      const zip = await JSZip.loadAsync(f);
      const threeMfKeys = Object.keys(zip.files).filter(
        k => k.toLowerCase().endsWith('.3mf') && !zip.files[k].dir
      );

      if (threeMfKeys.length === 0) {
        error = 'No .3mf files found inside the ZIP';
        return;
      }

      const parsed: ZipEntry[] = [];
      for (const key of threeMfKeys) {
        const blob = await zip.files[key].async('blob');
        const meta = await extractMeta(blob);
        const baseName = key.split('/').pop()!;
        parsed.push({
          fileName: baseName,
          name: baseName.replace(/\.3mf$/i, ''),
          blob,
          thumbnail: meta.thumbnail,
          estimatedTime: meta.estimatedTime,
          expectedWeight: meta.expectedWeight,
          nozzleDiameter: meta.nozzleDiameter,
          plateType: meta.plateType,
          objectsPerPrint: meta.objectsPerPrint,
          defaultSpoolPresetId: null,
          printerModel: null,
          state: 'pending',
          errorMsg: null,
        });
      }
      entries = parsed;
    } catch (e) {
      error = `Failed to read ZIP: ${e instanceof Error ? e.message : e}`;
    } finally {
      extracting = false;
    }
  }

  // ── Metadata extraction (mirrors ThreeMfUpload logic) ───────────────────────

  async function extractMeta(blob: Blob) {
    let thumbnail: string | null = null;
    let estimatedTime: number | null = null;
    let expectedWeight: number | null = null;
    let nozzleDiameter: number | null = null;
    let plateType: string | null = null;
    let objectsPerPrint = 1;

    try {
      const inner = await JSZip.loadAsync(blob);
      const allFiles = Object.keys(inner.files);

      // Thumbnail
      const thumbCandidates = [
        'Metadata/plate_1.png', 'Metadata/top_1.png', 'Metadata/plate_1_small.png',
        ...allFiles.filter(n => n.startsWith('Metadata/') && n.endsWith('.png')),
      ];
      for (const p of [...new Set(thumbCandidates)]) {
        const entry = inner.file(p);
        if (entry) {
          thumbnail = await blobToDataUrl(await entry.async('blob'));
          break;
        }
      }

      // plate_1.json
      const plateJsonKeys = ['Metadata/plate_1.json', ...allFiles.filter(n => /Metadata\/plate_\d+\.json/.test(n))];
      for (const p of [...new Set(plateJsonKeys)]) {
        const entry = inner.file(p);
        if (!entry) continue;
        try {
          const json = JSON.parse(await entry.async('text'));
          if (estimatedTime === null && json.prediction != null) {
            const v = Number(json.prediction); if (!isNaN(v)) estimatedTime = v;
          }
          if (expectedWeight === null) {
            for (const key of ['weight', 'filament_weight', 'material_weight']) {
              if (json[key] != null) { const v = Number(json[key]); if (!isNaN(v)) { expectedWeight = v; break; } }
            }
          }
          if (json.objects_per_print != null) { const v = parseInt(json.objects_per_print, 10); if (!isNaN(v) && v > 0) objectsPerPrint = v; }
          else if (Array.isArray(json.objects) && json.objects.length > 0) objectsPerPrint = json.objects.length;
          if (!plateType) plateType = normalizePlateType(json.bed_type ?? json.plate_type ?? json.bed_type_preset ?? null);
        } catch { /* skip */ }
        break;
      }

      // project_settings.config
      const projEntry = inner.file('Metadata/project_settings.config');
      if (projEntry) {
        try {
          const json = JSON.parse(await projEntry.async('text'));
          if (nozzleDiameter === null && json.nozzle_diameter) {
            const val = Array.isArray(json.nozzle_diameter) ? json.nozzle_diameter[0] : json.nozzle_diameter;
            const v = parseFloat(String(val)); if (!isNaN(v)) nozzleDiameter = v;
          }
          if (!plateType) {
            plateType = normalizePlateType(json.bed_type ?? json.plate_type ?? json.bed_type_preset ?? null);
          }
        } catch { /* skip */ }
      }

      // slice_info.config
      const sliceEntry = inner.file('Metadata/slice_info.config');
      if (sliceEntry) {
        try {
          const text = await sliceEntry.async('text');
          const doc = new DOMParser().parseFromString(text, 'text/xml');
          const meta: Record<string, string> = {};
          doc.querySelectorAll('metadata').forEach(el => {
            const k = el.getAttribute('key'); const v = el.getAttribute('value');
            if (k && v !== null) meta[k] = v;
          });
          if (estimatedTime === null && meta.prediction) { const v = parseInt(meta.prediction, 10); if (!isNaN(v)) estimatedTime = v; }
          if (expectedWeight === null && meta.weight) { const v = parseFloat(meta.weight); if (!isNaN(v)) expectedWeight = v; }
          if (nozzleDiameter === null && (meta.nozzle_diameter ?? meta.nozzle_diameters)) {
            const v = parseFloat(meta.nozzle_diameter ?? meta.nozzle_diameters); if (!isNaN(v)) nozzleDiameter = v;
          }
          if (!plateType) plateType = normalizePlateType(meta.plate_type ?? meta.bed_type ?? null);
          if (objectsPerPrint === 1) {
            const objs = doc.querySelectorAll('plate > object');
            if (objs.length > 0) objectsPerPrint = objs.length;
          }
        } catch { /* skip */ }
      }
    } catch { /* not a valid 3mf zip */ }

    // Normalize units: store time in minutes, weight as whole grams
    if (estimatedTime !== null) estimatedTime = Math.round(estimatedTime / 60);
    if (expectedWeight !== null) expectedWeight = Math.ceil(expectedWeight);

    return { thumbnail, estimatedTime, expectedWeight, nozzleDiameter, plateType, objectsPerPrint };
  }

  // ── Batch upload ─────────────────────────────────────────────────────────────

  async function uploadAll() {
    uploading = true;
    doneCount = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.state === 'done') { doneCount++; continue; }

      entries[i] = { ...entry, state: 'uploading', errorMsg: null };
      entries = [...entries];

      try {
        // 1. Upload to Pi
        let piFilePath: string | null = null;
        let fileStoredOnPi = 0;
        try {
          const fd = new FormData();
          fd.append('file', new File([entry.blob], entry.fileName, { type: 'application/octet-stream' }));
          const piRes = await fetch('/api/pi/upload', { method: 'POST', body: fd });
          const piResult = await piRes.json() as { success: boolean; pi_available: boolean; path?: string };
          if (piResult.pi_available && piResult.success && piResult.path) {
            piFilePath = piResult.path;
            fileStoredOnPi = 1;
          }
        } catch { /* Pi not configured — continue */ }

        // 2. Save to DB
        const res = await fetch('/api/print-modules', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: entry.name.trim() || entry.fileName.replace(/\.3mf$/i, ''),
            file_name: entry.fileName,
            thumbnail: entry.thumbnail,
            estimated_time: entry.estimatedTime,
            plate_type: entry.plateType,
            nozzle_diameter: entry.nozzleDiameter,
            expected_weight: entry.expectedWeight,
            objects_per_print: entry.objectsPerPrint,
            default_spool_preset_id: entry.defaultSpoolPresetId || null,
            printer_model: entry.printerModel || null,
            pi_file_path: piFilePath,
            file_stored_on_pi: fileStoredOnPi,
          }),
        });
        const result = await res.json() as { success: boolean; error?: string };
        if (result.success) {
          entries[i] = { ...entries[i], state: 'done' };
          doneCount++;
        } else {
          entries[i] = { ...entries[i], state: 'error', errorMsg: result.error ?? 'Save failed' };
        }
      } catch (e) {
        entries[i] = { ...entries[i], state: 'error', errorMsg: e instanceof Error ? e.message : String(e) };
      }
      entries = [...entries];
    }

    uploading = false;
    if (entries.every(e => e.state === 'done')) {
      dispatch('done');
    }
  }

  function reset() {
    entries = [];
    error = null;
    doneCount = 0;
    if (fileInput) fileInput.value = '';
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function formatTime(minutes: number | null): string {
    if (!minutes) return '—';
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
</script>

{#if entries.length === 0}
  <!-- Drop zone -->
  <div
    role="button"
    tabindex="0"
    aria-label="Upload ZIP folder of .3mf files"
    class="relative border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
           {isDragging
             ? 'border-zinc-500 bg-zinc-50 dark:bg-[#161616]'
             : 'border-zinc-200 dark:border-[#262626] hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-[#141414]'}"
    ondragover={(e) => { e.preventDefault(); isDragging = true; }}
    ondragleave={() => (isDragging = false)}
    ondrop={handleDrop}
    onclick={() => fileInput.click()}
    onkeydown={(e) => e.key === 'Enter' && fileInput.click()}
  >
    {#if extracting}
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-700 dark:border-t-zinc-300 rounded-full animate-spin"></div>
        <p class="text-sm text-zinc-500 dark:text-zinc-400">Extracting .3mf files…</p>
      </div>
    {:else}
      <div class="flex flex-col items-center gap-3 pointer-events-none">
        <svg class="w-10 h-10 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
        <div>
          <p class="text-sm font-medium text-zinc-600 dark:text-zinc-400">Drop a <span class="font-mono">.zip</span> folder of <span class="font-mono">.3mf</span> files</p>
          <p class="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5">Each .3mf inside becomes a module — all uploaded to Pi automatically</p>
        </div>
      </div>
    {/if}
  </div>

  {#if error}
    <p class="mt-2 text-xs text-red-500">{error}</p>
  {/if}

{:else}
  <!-- Preview table -->
  <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-100 dark:border-[#1e1e1e] overflow-hidden">
    <div class="px-5 py-3 border-b border-zinc-100 dark:border-[#1a1a1a] flex items-center justify-between">
      <div>
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
          Bulk Upload — {entries.length} file{entries.length !== 1 ? 's' : ''} found
        </p>
        {#if uploading}
          <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{doneCount} / {entries.length} uploaded</p>
        {/if}
      </div>
      <button onclick={reset} class="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
        Cancel
      </button>
    </div>

    <!-- Progress bar (while uploading) -->
    {#if uploading}
      <div class="h-1 bg-zinc-100 dark:bg-zinc-800">
        <div
          class="h-full bg-emerald-500 transition-all duration-500"
          style="width: {entries.length ? (doneCount / entries.length) * 100 : 0}%"
        ></div>
      </div>
    {/if}

    <div class="divide-y divide-zinc-50 dark:divide-[#1a1a1a] max-h-[60vh] overflow-y-auto">
      {#each entries as entry, i (entry.fileName)}
        <div class="flex items-center gap-3 px-5 py-3">
          <!-- Thumbnail -->
          <div class="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-zinc-100 dark:bg-[#1a1a1a] flex items-center justify-center">
            {#if entry.thumbnail}
              <img src={entry.thumbnail} alt="" class="w-full h-full object-cover" />
            {:else}
              <svg class="w-5 h-5 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1">
                <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            {/if}
          </div>

          <!-- Name input -->
          <div class="flex-1 min-w-0">
            <input
              type="text"
              bind:value={entries[i].name}
              disabled={entry.state === 'uploading' || entry.state === 'done'}
              class="w-full bg-transparent text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none border-b border-transparent focus:border-zinc-300 dark:focus:border-zinc-600 transition-colors disabled:opacity-60"
            />
            <p class="text-[10px] text-zinc-400 dark:text-zinc-600 truncate mt-0.5">{entry.fileName}</p>
          </div>

          <!-- Metadata chips -->
          <div class="hidden sm:flex items-center gap-2 shrink-0">
            {#if entry.expectedWeight}
              <span class="text-[10px] text-zinc-400 dark:text-zinc-500">{entry.expectedWeight}g</span>
            {/if}
            {#if entry.estimatedTime}
              <span class="text-[10px] text-zinc-400 dark:text-zinc-500">{formatTime(entry.estimatedTime)}</span>
            {/if}
            {#if entry.nozzleDiameter}
              <span class="text-[10px] text-zinc-400 dark:text-zinc-500">{entry.nozzleDiameter}mm</span>
            {/if}
          </div>

          <!-- State indicator -->
          <div class="shrink-0 w-16 text-right">
            {#if entry.state === 'pending'}
              <span class="text-[10px] text-zinc-400 dark:text-zinc-600">Pending</span>
            {:else if entry.state === 'uploading'}
              <div class="inline-block w-3.5 h-3.5 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin"></div>
            {:else if entry.state === 'done'}
              <span class="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Done</span>
            {:else if entry.state === 'error'}
              <span class="text-[10px] font-medium text-red-500" title={entry.errorMsg ?? ''}>Error</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <div class="px-5 py-4 border-t border-zinc-100 dark:border-[#1a1a1a] flex items-center justify-between gap-3">
      <p class="text-[10px] text-zinc-400 dark:text-zinc-600">
        Metadata extracted automatically — Pi upload included if configured
      </p>
      <div class="flex items-center gap-2">
        {#if entries.some(e => e.state === 'error')}
          <button
            onclick={uploadAll}
            disabled={uploading}
            class="px-4 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
          >
            Retry Errors
          </button>
        {/if}
        <button
          onclick={uploadAll}
          disabled={uploading || entries.every(e => e.state === 'done')}
          class="px-4 py-2 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? `Uploading ${doneCount + 1}/${entries.length}…` : entries.every(e => e.state === 'done') ? 'All Done' : `Upload All (${entries.length})`}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Hidden file input -->
<input
  bind:this={fileInput}
  type="file"
  accept=".zip"
  class="hidden"
  onchange={handleFileInput}
/>
