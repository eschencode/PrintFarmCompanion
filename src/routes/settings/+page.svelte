<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { onMount } from 'svelte';
  
  export let data: PageData;
  export let form: ActionData;
  
  let fileHandlerToken = '';
  let testingConnection = false;
  let connectionStatus: 'untested' | 'success' | 'failed' = 'untested';
  
  onMount(() => {
    fileHandlerToken = localStorage.getItem('fileHandlerToken') || '';
  });
  
  function saveFileHandlerToken() {
    localStorage.setItem('fileHandlerToken', fileHandlerToken);
    connectionStatus = 'untested';
    alert('✅ Token saved! Test the connection below.');
  }
  
  async function testConnection() {
    if (!fileHandlerToken) {
      alert('⚠️ Please enter a token first');
      return;
    }
    
    testingConnection = true;
    connectionStatus = 'untested';
    
    try {
      const response = await fetch('http://127.0.0.1:3001/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': fileHandlerToken
        }
      });
      
      if (response.ok) {
        connectionStatus = 'success';
      } else {
        connectionStatus = 'failed';
      }
    } catch (error) {
      connectionStatus = 'failed';
    } finally {
      testingConnection = false;
    }
  }
</script>

<div class="min-h-screen bg-black text-white p-6">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-center mb-8">
      <div>
        <h1 class="text-3xl font-light tracking-wide mb-2">Settings</h1>
        <p class="text-slate-400 text-sm">Manage print modules and spool presets</p>
      </div>
      <a 
        href="/" 
        class="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Dashboard
      </a>
    </div>

    <!-- Messages -->
    {#if form?.success}
      <div class="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
        <svg class="w-5 h-5 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
        <p class="text-green-400">{form.message || 'Action completed successfully'}</p>
      </div>
    {/if}

    {#if form?.error}
      <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
        <svg class="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>
        <p class="text-red-400">{form.error}</p>
      </div>
    {/if}

    <!-- File Handler Configuration (NEW - Add at top) -->
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
        <h2 class="text-xl font-medium flex items-center gap-2">
          <span class="text-2xl">🔧</span>
          Local File Handler Configuration
        </h2>
        <p class="text-sm text-slate-500 mt-1">Configure automatic file opening on print start</p>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="fileHandlerToken" class="block text-sm text-slate-400 mb-2">
            Auth Token
            <span class="text-slate-600">(from local-file-handler/.env)</span>
          </label>
          <input 
            type="text" 
            id="fileHandlerToken"
            bind:value={fileHandlerToken}
            placeholder="Paste your AUTH_TOKEN here"
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
          />
          <p class="text-xs text-slate-500 mt-2">
            💡 This token is stored locally in your browser and never sent to the server.
          </p>
          <p class="text-xs text-slate-600 mt-1">
            Find your token in: <code class="text-blue-400">local-file-handler/.env</code>
          </p>
        </div>
        
        <div class="flex gap-3">
          <button 
            onclick={saveFileHandlerToken}
            class="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 rounded-lg transition-colors"
          >
            Save Token
          </button>
          <button 
            onclick={testConnection}
            disabled={testingConnection || !fileHandlerToken}
            class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-lg transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if testingConnection}
              Testing...
            {:else}
              Test Connection
            {/if}
          </button>
        </div>
        
        {#if connectionStatus === 'success'}
          <div class="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-2">
            <svg class="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <span class="text-green-400 text-sm">✅ Connection successful! File handler is online.</span>
          </div>
        {:else if connectionStatus === 'failed'}
          <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
            <svg class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
            </svg>
            <div class="text-sm">
              <p class="text-red-400 font-medium">❌ Connection failed</p>
              <p class="text-slate-500 mt-1">Make sure the file handler is running:</p>
              <code class="text-xs bg-slate-800 px-2 py-1 rounded mt-1 inline-block text-blue-400">
                cd local-file-handler && bun run start
              </code>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Rest of existing settings sections -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Left Column: Forms -->
      <div class="space-y-6">
        <!-- Add Print Module Form -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
            <h2 class="text-xl font-medium flex items-center gap-2">
              <span class="text-2xl">📦</span>
              Add Print Module
            </h2>
          </div>
          <form method="POST" action="?/addModule" class="p-6 space-y-4">
            <div>
              <label for="moduleName" class="block text-sm text-slate-400 mb-2">Module Name</label>
              <input 
                type="text" 
                name="name" 
                id="moduleName" 
                placeholder="e.g., Haken Blau" 
                required 
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="expectedWeight" class="block text-sm text-slate-400 mb-2">Weight (g)</label>
                <input 
                  type="number" 
                  name="expectedWeight" 
                  id="expectedWeight" 
                  placeholder="175" 
                  required 
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label for="expectedTime" class="block text-sm text-slate-400 mb-2">Time (min)</label>
                <input 
                  type="number" 
                  name="expectedTime" 
                  id="expectedTime" 
                  placeholder="300" 
                  required 
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="objectsPerPrint" class="block text-sm text-slate-400 mb-2">Objects Per Print</label>
                <input 
                  type="number" 
                  name="objectsPerPrint" 
                  id="objectsPerPrint" 
                  placeholder="19" 
                  value="1" 
                  required 
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label for="defaultSpoolPresetId" class="block text-sm text-slate-400 mb-2">Default Spool</label>
                <select 
                  name="defaultSpoolPresetId" 
                  id="defaultSpoolPresetId"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="">None</option>
                  {#each data.spoolPresets as preset}
                    <option value={preset.id}>{preset.name} - {preset.material}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div>
              <label for="path" class="block text-sm text-slate-400 mb-2">File Path</label>
              <input 
                type="text" 
                name="path" 
                id="path" 
                placeholder="/models/haken_blau.3mf" 
                required 
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label for="imagePath" class="block text-sm text-slate-400 mb-2">Image Path (optional)</label>
              <input 
                type="text" 
                name="imagePath" 
                id="imagePath" 
                placeholder="/images/haken_blau.png" 
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <button 
              type="submit" 
              class="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 rounded-lg transition-colors"
            >
              Add Module
            </button>
          </form>
        </div>

        <!-- Add Spool Preset Form -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
            <h2 class="text-xl font-medium flex items-center gap-2">
              <span class="text-2xl">🎨</span>
              Add Spool Preset
            </h2>
          </div>
          <form method="POST" action="?/addSpoolPreset" class="p-6 space-y-4">
            <div>
              <label for="presetName" class="block text-sm text-slate-400 mb-2">Preset Name</label>
              <input 
                type="text" 
                name="name" 
                id="presetName" 
                placeholder="e.g., Bambu Blau PLA" 
                required 
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="presetBrand" class="block text-sm text-slate-400 mb-2">Brand</label>
                <input 
                  type="text" 
                  name="brand" 
                  id="presetBrand" 
                  placeholder="Generic" 
                  required 
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label for="presetMaterial" class="block text-sm text-slate-400 mb-2">Material</label>
                <select 
                  name="material" 
                  id="presetMaterial" 
                  required
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="PLA">PLA</option>
                  <option value="PETG">PETG</option>
                  <option value="ABS">ABS</option>
                  <option value="TPU">TPU</option>
                  <option value="Nylon">Nylon</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="presetColor" class="block text-sm text-slate-400 mb-2">Color</label>
                <input 
                  type="text" 
                  name="color" 
                  id="presetColor" 
                  placeholder="Blue" 
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label for="defaultWeight" class="block text-sm text-slate-400 mb-2">Weight (g)</label>
                <input 
                  type="number" 
                  name="defaultWeight" 
                  id="defaultWeight" 
                  placeholder="1000" 
                  required 
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label for="presetCost" class="block text-sm text-slate-400 mb-2">Cost ($)</label>
              <input 
                type="number" 
                step="0.01" 
                name="cost" 
                id="presetCost" 
                placeholder="20.00" 
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <button 
              type="submit" 
              class="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 rounded-lg transition-colors"
            >
              Add Preset
            </button>
          </form>
        </div>
      </div>

      <!-- Right Column: Lists -->
      <div class="space-y-6">
        <!-- Existing Print Modules -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
            <h2 class="text-xl font-medium">Print Modules ({data.printModules.length})</h2>
          </div>
          <div class="p-6">
            {#if data.printModules.length === 0}
              <div class="text-center py-8">
                <div class="text-5xl mb-3 opacity-30">📦</div>
                <p class="text-slate-500">No print modules found</p>
                <p class="text-slate-600 text-sm mt-1">Add your first module using the form</p>
              </div>
            {:else}
              <div class="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {#each data.printModules as module}
                  <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:border-slate-600 transition-colors">
                    <div class="flex justify-between items-start mb-3">
                      <h3 class="text-lg font-medium text-white">{module.name}</h3>
                      <form method="POST" action="?/deleteModule" style="display: inline;">
                        <input type="hidden" name="moduleId" value={module.id} />
                        <button 
                          type="submit" 
                          class="text-red-400 hover:text-red-300 transition-colors text-sm"
                          onclick={(e) => { 
                            if (!confirm('Delete this module?')) e.preventDefault(); 
                          }}
                        >
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </form>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                      <div class="flex items-center gap-2 text-slate-400">
                        <span>📦</span>
                        <span>{module.objects_per_print} objects</span>
                      </div>
                      <div class="flex items-center gap-2 text-slate-400">
                        <span>⚖️</span>
                        <span>{module.expected_weight}g</span>
                      </div>
                      <div class="flex items-center gap-2 text-slate-400">
                        <span>⏱️</span>
                        <span>{module.expected_time} min</span>
                      </div>
                      <div class="flex items-center gap-2 text-slate-400 col-span-2 truncate">
                        <span>📁</span>
                        <span class="truncate">{module.path}</span>
                      </div>
                      {#if module.image_path}
                        <div class="flex items-center gap-2 text-slate-400 col-span-2 truncate">
                          <span>🖼️</span>
                          <span class="truncate">{module.image_path}</span>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <!-- Existing Spool Presets -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
            <h2 class="text-xl font-medium">Spool Presets ({data.spoolPresets.length})</h2>
          </div>
          <div class="p-6">
            {#if data.spoolPresets.length === 0}
              <div class="text-center py-8">
                <div class="text-5xl mb-3 opacity-30">🎨</div>
                <p class="text-slate-500">No spool presets found</p>
                <p class="text-slate-600 text-sm mt-1">Add your first preset using the form</p>
              </div>
            {:else}
              <div class="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {#each data.spoolPresets as preset}
                  <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:border-slate-600 transition-colors">
                    <h3 class="text-base font-medium text-white mb-2">{preset.name}</h3>
                    <div class="space-y-1 text-sm">
                      <div class="flex justify-between text-slate-400">
                        <span>Brand:</span>
                        <span class="text-white">{preset.brand}</span>
                      </div>
                      <div class="flex justify-between text-slate-400">
                        <span>Material:</span>
                        <span class="text-white">{preset.material}</span>
                      </div>
                      {#if preset.color}
                        <div class="flex justify-between text-slate-400">
                          <span>Color:</span>
                          <span class="text-white">{preset.color}</span>
                        </div>
                      {/if}
                      <div class="flex justify-between text-slate-400">
                        <span>Weight:</span>
                        <span class="text-white">{preset.default_weight}g</span>
                      </div>
                      {#if preset.cost}
                        <div class="flex justify-between text-slate-400">
                          <span>Cost:</span>
                          <span class="text-green-400">${preset.cost.toFixed(2)}</span>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .breadcrumb {
    margin-bottom: 2rem;
  }

  .breadcrumb a {
    color: #2196F3;
    text-decoration: none;
    font-weight: bold;
  }

  .breadcrumb a:hover {
    text-decoration: underline;
  }

  section {
    margin: 2rem 0;
  }

  hr {
    margin: 3rem 0;
    border: none;
    border-top: 2px solid #e0e0e0;
  }

  .settings-form {
    background: #f9f9f9;
    padding: 1.5rem;
    border-radius: 8px;
    max-width: 700px;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  label {
    display: block;
    font-weight: bold;
    margin-bottom: 0.25rem;
    color: #333;
  }

  input, select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  input:focus, select:focus {
    outline: none;
    border-color: #2196F3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
  }

  button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 1rem;
    transition: background 0.2s;
  }

  .btn-primary {
    background: #2196F3;
    color: white;
    width: 100%;
  }

  .btn-primary:hover {
    background: #1976D2;
  }

  .btn-danger {
    background: #f44336;
    color: white;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }

  .btn-danger:hover {
    background: #d32f2f;
  }

  ul {
    list-style: none;
    padding: 0;
  }

  li {
    padding: 1rem;
    margin: 0.5rem 0;
    background: #f5f5f5;
    border-radius: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .module-list li {
    flex-direction: column;
    align-items: stretch;
  }

  .module-info {
    margin-bottom: 1rem;
  }

  .module-details {
    display: flex;
    gap: 1rem;
    margin-top: 0.5rem;
    font-size: 0.9rem;
    color: #666;
  }

  .success {
    background: #d4edda;
    border: 2px solid #28a745;
    padding: 1rem;
    border-radius: 8px;
    margin: 1rem 0;
  }

  .error {
    background: #f8d7da;
    border: 2px solid #dc3545;
    padding: 1rem;
    border-radius: 8px;
    margin: 1rem 0;
  }
</style>