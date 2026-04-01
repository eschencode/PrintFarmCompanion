<script lang="ts">
  import JSZip from 'jszip';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ uploaded: { id: number; name: string } }>();

  export let spoolPresets: any[] = [];
  export let printerModels: any[] = [];
  export let inventoryItems: any[] = [];

  let isDragging = false;
  let fileInput: HTMLInputElement;

  type PreviewData = {
    name: string;
    thumbnail: string | null;
    fileName: string;
    estimatedTime: number | null;
    plateType: string | null;
    nozzleDiameter: number | null;
    expectedWeight: number | null;
    objectsPerPrint: number;
    defaultSpoolPresetId: number | null;
    inventorySlug: string | null;
    printerModel: string | null;
    localFileHandlerPath: string | null;
  };

  let previewData: PreviewData | null = null;
  let currentFile: File | null = null;  // original File kept for Pi upload
  let extracting = false;
  let saving = false;
  let savingStep = '';  // 'pi' | 'db' | ''
  let error: string | null = null;

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) await processFile(f);
  }

  async function handleFileInput(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) await processFile(f);
  }

  async function processFile(f: File) {
    if (!f.name.endsWith('.3mf')) {
      error = 'Only .3mf files are supported';
      return;
    }

    extracting = true;
    error = null;
    previewData = null;
    currentFile = f;

    try {
      const zip = await JSZip.loadAsync(f);
      const allFiles = Object.keys(zip.files);
      
      console.log('📦 3mf Archive contents:', allFiles);
      
      // Try to get the file path from the File object
      let suggestedLocalPath: string | null = null;
      
      if ('webkitRelativePath' in f && (f as any).webkitRelativePath) {
        suggestedLocalPath = (f as any).webkitRelativePath.replace(/\/[^/]*$/, '');
      }
      
      if (!suggestedLocalPath) {
        suggestedLocalPath = `/Users/linus/Documents/3d-models/${f.name.replace(/\.3mf$/i, '')}/${f.name}`;
      }

      // --- Thumbnail ---
      let thumbnail: string | null = null;
      const thumbCandidates = [
        'Metadata/plate_1.png',
        'Metadata/top_1.png',
        'Metadata/plate_1_small.png',
        ...allFiles.filter(n => n.startsWith('Metadata/') && n.endsWith('.png'))
      ];
      for (const path of [...new Set(thumbCandidates)]) {
        const entry = zip.file(path);
        if (entry) {
          const blob = await entry.async('blob');
          thumbnail = await blobToDataUrl(blob);
          break;
        }
      }

      let estimatedTime: number | null = null;
      let plateType: string | null = null;
      let nozzleDiameter: number | null = null;
      let expectedWeight: number | null = null;
      let objectsPerPrint: number = 1;
      let defaultSpoolPresetId: number | null = null;
      let inventorySlug: string | null = null;
      let printerModel: string | null = null;

      // Metadata collection object for detailed logging
      const metadata: Record<string, any> = {
        fileName: f.name,
        fileSize: f.size,
        archiveContents: allFiles,
        extractedMetadata: {}
      };

      // --- plate_1.json: contains prediction (time), weight, nozzle, and object count ---
      const plateJsonPaths = [
        'Metadata/plate_1.json',
        ...allFiles.filter(n => /Metadata\/plate_\d+\.json/.test(n))
      ];
      for (const path of [...new Set(plateJsonPaths)]) {
        const entry = zip.file(path);
        if (!entry) continue;
        try {
          const json = JSON.parse(await entry.async('text'));
          
          console.log('📋 plate_1.json full content:', json);
          metadata.extractedMetadata['plateJson'] = json;
          
          if (estimatedTime === null && json.prediction != null) {
            const parsed = typeof json.prediction === 'number' ? json.prediction : parseInt(json.prediction, 10);
            if (!isNaN(parsed)) estimatedTime = parsed;
          }
          
          if (expectedWeight === null && json.weight != null) {
            const parsed = typeof json.weight === 'number' ? json.weight : parseFloat(json.weight);
            if (!isNaN(parsed)) expectedWeight = parsed;
          }
          
          if (expectedWeight === null && json.filament_weight != null) {
            const parsed = typeof json.filament_weight === 'number' ? json.filament_weight : parseFloat(json.filament_weight);
            if (!isNaN(parsed)) expectedWeight = parsed;
          }
          
          if (expectedWeight === null && json.material_weight != null) {
            const parsed = typeof json.material_weight === 'number' ? json.material_weight : parseFloat(json.material_weight);
            if (!isNaN(parsed)) expectedWeight = parsed;
          }

          // Look for object count information
          if (json.objects_per_print != null) {
            const parsed = parseInt(json.objects_per_print, 10);
            if (!isNaN(parsed) && parsed > 0) objectsPerPrint = parsed;
            console.log('✅ Found objects_per_print:', objectsPerPrint);
          }
          
          // Alternative field names for object count
          if (objectsPerPrint === 1 && json.object_count != null) {
            const parsed = parseInt(json.object_count, 10);
            if (!isNaN(parsed) && parsed > 0) objectsPerPrint = parsed;
            console.log('✅ Found object_count:', objectsPerPrint);
          }
          
          if (objectsPerPrint === 1 && json.num_objects != null) {
            const parsed = parseInt(json.num_objects, 10);
            if (!isNaN(parsed) && parsed > 0) objectsPerPrint = parsed;
            console.log('✅ Found num_objects:', objectsPerPrint);
          }

          // Check for objects array
          if (objectsPerPrint === 1 && Array.isArray(json.objects)) {
            objectsPerPrint = json.objects.length || 1;
            console.log('✅ Found objects array with length:', objectsPerPrint);
          }
          
        } catch (e) {
          console.warn(`Could not parse ${path} as JSON:`, e);
        }
        break;
      }

      // --- project_settings.config ---
      const projectEntry = zip.file('Metadata/project_settings.config');
      if (projectEntry) {
        try {
          const json = JSON.parse(await projectEntry.async('text'));
          
          console.log('📋 project_settings.config full content:', json);
          metadata.extractedMetadata['projectSettings'] = json;

          if (nozzleDiameter === null && json.nozzle_diameter) {
            const val = Array.isArray(json.nozzle_diameter) ? json.nozzle_diameter[0] : json.nozzle_diameter;
            const parsed = parseFloat(String(val));
            if (!isNaN(parsed)) nozzleDiameter = parsed;
          }
          if (!plateType) {
            const raw = json.bed_type ?? json.plate_type;
            if (raw) plateType = String(raw).trim() || null;
          }
        } catch (e) {
          console.warn('project_settings.config is not JSON or could not be parsed:', e);
        }
      }

      // --- slice_info.config (XML) ---
      const sliceEntry = zip.file('Metadata/slice_info.config');
      if (sliceEntry) {
        try {
          const text = await sliceEntry.async('text');
          console.log('📄 slice_info.config full content:');
          console.log(text);
          
          const doc = new DOMParser().parseFromString(text, 'text/xml');
          
          const metadataElements: Record<string, any> = {};
          doc.querySelectorAll('metadata').forEach(el => {
            const key = el.getAttribute('key');
            const value = el.getAttribute('value');
            if (key && value !== null) {
              metadataElements[key] = value;
            }
          });
          
          console.log('📋 slice_info.config parsed metadata:', metadataElements);
          metadata.extractedMetadata['sliceInfoMetadata'] = metadataElements;
          
          if (metadataElements['prediction'] && estimatedTime === null) {
            const parsed = parseInt(metadataElements['prediction'], 10);
            if (!isNaN(parsed)) estimatedTime = parsed;
          }
          
          if (metadataElements['weight'] && expectedWeight === null) {
            const parsed = parseFloat(metadataElements['weight']);
            if (!isNaN(parsed)) expectedWeight = parsed;
          }
          
          if (metadataElements['nozzle_diameter'] && nozzleDiameter === null) {
            const parsed = parseFloat(metadataElements['nozzle_diameter']);
            if (!isNaN(parsed)) nozzleDiameter = parsed;
          }

          // Try nozzle_diameters as alternative (from slice_info)
          if (metadataElements['nozzle_diameters'] && nozzleDiameter === null) {
            const parsed = parseFloat(metadataElements['nozzle_diameters']);
            if (!isNaN(parsed)) nozzleDiameter = parsed;
          }
          
          if (metadataElements['plate_type'] && !plateType) {
            plateType = metadataElements['plate_type'];
          }

          // Try bed_type as alternative (from slice_info)
          if (metadataElements['bed_type'] && !plateType) {
            plateType = metadataElements['bed_type'];
          }

          // Count object elements in slice_info.config XML
          if (objectsPerPrint === 1) {
            const objectElements = doc.querySelectorAll('plate > object');
            if (objectElements.length > 0) {
              objectsPerPrint = objectElements.length;
              console.log('✅ Found objects in slice_info.config XML:', objectsPerPrint);
              
              // Log object names for reference
              const objectNames = Array.from(objectElements)
                .map(el => el.getAttribute('name'))
                .filter((name, idx, arr) => arr.indexOf(name) === idx); // unique names
              console.log('📦 Object names:', objectNames);
            }
          }
          
        } catch (e) {
          console.warn('Could not parse slice_info.config:', e);
        }
      }

      console.log('📊 FINAL EXTRACTED DATA:', {
        estimatedTime,
        expectedWeight,
        nozzleDiameter,
        plateType,
        objectsPerPrint
      });

      previewData = {
        name: f.name.replace(/\.3mf$/i, ''),
        thumbnail,
        fileName: f.name,
        estimatedTime: estimatedTime ?? null,
        plateType: plateType ?? null,
        nozzleDiameter: nozzleDiameter ?? null,
        expectedWeight: expectedWeight ?? null,
        objectsPerPrint: objectsPerPrint || 1,
        defaultSpoolPresetId,
        inventorySlug,
        printerModel: printerModel ?? null,
        localFileHandlerPath: suggestedLocalPath,
      };
    } catch (e) {
      error = `Failed to read .3mf: ${e instanceof Error ? e.message : e}`;
      console.error(e);
    } finally {
      extracting = false;
    }
  }

  async function confirmUpload() {
    if (!previewData || !currentFile) return;
    saving = true;
    error = null;

    let piFilePath: string | null = null;
    let fileStoredOnPi = 0;

    try {
      // ── Step 1: Try to upload file to Pi (graceful degradation if not configured) ──
      savingStep = 'pi';
      try {
        const formData = new FormData();
        formData.append('file', currentFile, currentFile.name);

        const piRes = await fetch('/api/pi/upload', {
          method: 'POST',
          body: formData,
        });
        const piResult = await piRes.json() as { success: boolean; pi_available: boolean; path?: string; error?: string };

        if (piResult.pi_available && piResult.success && piResult.path) {
          piFilePath = piResult.path;
          fileStoredOnPi = 1;
        } else if (piResult.pi_available && !piResult.success) {
          console.warn('[Pi] File upload failed:', piResult.error);
        }
        // If pi_available === false, Pi is simply not configured — silent fallback
      } catch (piErr) {
        // Pi endpoint unreachable or returned non-JSON — continue without Pi
        console.warn('[Pi] Upload skipped:', piErr);
      }

      // ── Step 2: Save metadata to D1 ──────────────────────────────────────────────
      savingStep = 'db';
      const res = await fetch('/api/print-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: previewData.name,
          file_name: previewData.fileName,
          thumbnail: previewData.thumbnail,
          estimated_time: previewData.estimatedTime,
          plate_type: previewData.plateType || null,
          nozzle_diameter: previewData.nozzleDiameter,
          expected_weight: previewData.expectedWeight,
          objects_per_print: previewData.objectsPerPrint,
          default_spool_preset_id: previewData.defaultSpoolPresetId,
          inventory_slug: previewData.inventorySlug,
          printer_model: previewData.printerModel,
          local_file_handler_path: previewData.localFileHandlerPath,
          pi_file_path: piFilePath,
          file_stored_on_pi: fileStoredOnPi,
        }),
      });

      const result = await res.json() as { success: boolean; data?: { id: number; name: string }; error?: string };
      if (result.success) {
        dispatch('uploaded', result.data!);
        previewData = null;
        currentFile = null;
        if (fileInput) fileInput.value = '';
      } else {
        error = result.error ?? 'Upload failed';
      }
    } catch (e) {
      error = `Upload failed: ${e instanceof Error ? e.message : e}`;
    } finally {
      saving = false;
      savingStep = '';
    }
  }

  function reset() {
    previewData = null;
    currentFile = null;
    error = null;
    if (fileInput) fileInput.value = '';
  }

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
</script>

{#if previewData}
  <!-- Preview / edit card -->
  <div class="bg-white dark:bg-[#111] rounded-xl border border-zinc-200 dark:border-[#1e1e1e] overflow-hidden">
    <div class="px-5 py-4 border-b border-zinc-100 dark:border-[#1a1a1a] flex items-center justify-between">
      <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">.3mf Preview — edit before saving</p>
      <button onclick={reset} class="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">Cancel</button>
    </div>

    <div class="p-5 flex gap-5">
      <!-- Thumbnail -->
      <div class="w-28 h-28 shrink-0 rounded-lg overflow-hidden bg-zinc-100 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] flex items-center justify-center">
        {#if previewData.thumbnail}
          <img src={previewData.thumbnail} alt="Print preview" class="w-full h-full object-cover" />
        {:else}
          <svg class="w-8 h-8 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
        {/if}
      </div>

      <!-- Editable fields -->
      <div class="flex-1 min-w-0 space-y-3">
        <!-- Name -->
        <div>
          <label for="upload-name" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">Module Name</label>
          <input
            id="upload-name"
            type="text"
            bind:value={previewData.name}
            class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
          />
          <p class="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">{previewData.fileName}</p>
        </div>

        <!-- Local File Handler Path -->
        <div>
          <label for="upload-lfh-path" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">Local File Handler Path</label>
          <input
            id="upload-lfh-path"
            type="text"
            bind:value={previewData.localFileHandlerPath}
            placeholder="/path/to/file.3mf"
            class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors text-xs"
          />
          <p class="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">Path to open .3mf in Bambu Studio on your local machine</p>
        </div>

        <div class="grid grid-cols-2 gap-x-3 gap-y-3">
          <!-- Spool Preset -->
          <div class="col-span-2">
            <label for="upload-spool" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">Spool Preset</label>
            <select
              id="upload-spool"
              bind:value={previewData.defaultSpoolPresetId}
              class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
            >
              <option value="">None</option>
              {#each spoolPresets as preset (preset.id)}
                <option value={preset.id}>
                  {preset.name} ({preset.material})
                </option>
              {/each}
            </select>
          </div>

          <!-- Est. Time (minutes) -->
          <div>
            <label for="upload-time" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">
              Est. Time{previewData.estimatedTime ? ` — ${formatTime(previewData.estimatedTime)}` : ''}
            </label>
            <div class="flex items-center gap-1.5">
              <input
                id="upload-time"
                type="number"
                value={previewData.estimatedTime !== null ? Math.round(previewData.estimatedTime / 60) : ''}
                oninput={(e) => {
                  if (!previewData) return;
                  const val = parseInt((e.target as HTMLInputElement).value, 10);
                  previewData.estimatedTime = isNaN(val) ? null : val * 60;
                }}
                placeholder="min"
                class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
              />
              <span class="text-xs text-zinc-400 shrink-0">min</span>
            </div>
          </div>

          <!-- Objects per Print -->
          <div>
            <label for="upload-obj-count" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">Objects per Print</label>
            <div class="flex items-center gap-1.5">
              <input
                id="upload-obj-count"
                type="number"
                min="1"
                bind:value={previewData.objectsPerPrint}
                placeholder="1"
                class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
              />
              <span class="text-xs text-zinc-400 shrink-0">pcs</span>
            </div>
          </div>

          <!-- Plate type -->
          <div>
            <label for="upload-plate-type" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">Plate Type</label>
            <input
              id="upload-plate-type"
              type="text"
              bind:value={previewData.plateType}
              placeholder="e.g. textured_plate"
              class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
            />
          </div>

          <!-- Nozzle diameter -->
          <div>
            <label for="upload-nozzle" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">Nozzle</label>
            <div class="flex items-center gap-1.5">
              <input
                id="upload-nozzle"
                type="number"
                step="0.1"
                value={previewData.nozzleDiameter ?? ''}
                oninput={(e) => {
                  if (!previewData) return;
                  const val = parseFloat((e.target as HTMLInputElement).value);
                  previewData.nozzleDiameter = isNaN(val) ? null : val;
                }}
                placeholder="0.4"
                class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
              />
              <span class="text-xs text-zinc-400 shrink-0">mm</span>
            </div>
          </div>

          <!-- Expected weight -->
          <div>
            <label for="upload-weight" class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">Weight</label>
            <div class="flex items-center gap-1.5">
              <input
                id="upload-weight"
                type="number"
                step="0.1"
                bind:value={previewData.expectedWeight}
                placeholder="0.0"
                class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
              />
              <span class="text-xs text-zinc-400 flex-shrink-0">g</span>
            </div>
          </div>

          <!-- Printer Model -->
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">Printer Model</label>
            {#if printerModels.length > 0}
              <select
                bind:value={previewData.printerModel}
                class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
              >
                <option value={null}>— None selected —</option>
                {#each printerModels as model (model.id)}
                  <option value={model.name}>{model.name}</option>
                {/each}
              </select>
            {:else}
              <input
                type="text"
                bind:value={previewData.printerModel}
                placeholder="e.g. P1S"
                class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
              />
            {/if}
          </div>

          <!-- Inventory Slug -->
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 block mb-1">Inventory</label>
            {#if inventoryItems.length > 0}
              <select
                bind:value={previewData.inventorySlug}
                class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
              >
                <option value="">None</option>
                {#each inventoryItems as item (item.slug)}
                  <option value={item.slug}>{item.name}</option>
                {/each}
              </select>
            {:else}
              <input
                type="text"
                bind:value={previewData.inventorySlug}
                placeholder="slug"
                class="w-full bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#262626] rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
              />
            {/if}
          </div>
        </div>
      </div>
    </div>

    {#if error}
      <div class="px-5 pb-3">
        <p class="text-xs text-red-500">{error}</p>
      </div>
    {/if}

    <div class="px-5 py-4 border-t border-zinc-100 dark:border-[#1a1a1a] flex justify-end gap-3">
      <button
        onclick={reset}
        class="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        Cancel
      </button>
      <button
        onclick={confirmUpload}
        disabled={saving || !previewData.name.trim()}
        class="px-4 py-2 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {savingStep === 'pi' ? 'Sending to Pi…' : savingStep === 'db' ? 'Saving…' : 'Confirm Upload'}
      </button>
    </div>
  </div>

{:else}
  <!-- Drop zone -->
  <div
    role="button"
    tabindex="0"
    aria-label="Upload .3mf file"
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
        <p class="text-sm text-zinc-500 dark:text-zinc-400">Extracting .3mf…</p>
      </div>
    {:else}
      <div class="flex flex-col items-center gap-3 pointer-events-none">
        <svg class="w-10 h-10 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
        </svg>
        <div>
          <p class="text-sm font-medium text-zinc-600 dark:text-zinc-400">Drop a <span class="font-mono">.3mf</span> file here</p>
          <p class="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5">or click to browse</p>
        </div>
      </div>
    {/if}
  </div>

  {#if error}
    <p class="mt-2 text-xs text-red-500">{error}</p>
  {/if}
{/if}

<!-- Hidden file input -->
<input
  bind:this={fileInput}
  type="file"
  accept=".3mf"
  class="hidden"
  onchange={handleFileInput}
/>
