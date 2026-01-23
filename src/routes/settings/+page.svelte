<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { goto } from '$app/navigation'; // Add this import
  import { fileHandlerStore } from '$lib/stores/fileHandler';
  
  export let data: PageData;
  export let form: ActionData;
  
  // Subscribe to store
  $: fileHandlerState = $fileHandlerStore;
  
  let fileHandlerToken = '';
  let testingConnection = false;
  let connectionStatus: 'untested' | 'success' | 'failed' = 'untested';
  
  // Sync local variable with store
  $: fileHandlerToken = fileHandlerState.token;
  
  function saveFileHandlerToken() {
    fileHandlerStore.setToken(fileHandlerToken);
    connectionStatus = 'untested';
    alert('✅ Token saved! Connection will be tested automatically.');
  }
  
  async function testConnection() {
    if (!fileHandlerToken) {
      alert('⚠️ Please enter a token first');
      return;
    }
    
    testingConnection = true;
    connectionStatus = 'untested';
    
    const connected = await fileHandlerStore.testConnection();
    
    connectionStatus = connected ? 'success' : 'failed';
    testingConnection = false;
  }
</script>

<div class="min-h-screen bg-black text-white p-6">
  <div class="max-w-6xl mx-auto">
    <!-- Header - UPDATED -->
    <div class="flex justify-between items-center mb-8">
      <div>
        <h1 class="text-3xl font-light tracking-wide mb-2">Settings</h1>
        <p class="text-slate-400 text-sm">Manage print modules and spool presets</p>
      </div>
      <!-- Changed from <a> to <button> with goto -->
      <button 
        onclick={() => goto('/')}
        class="text-slate-400 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Dashboard
      </button>
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

    <!-- File Handler Configuration -->
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

    <!-- Rest of settings page - Print Modules and Spool Presets -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      <!-- Print Modules Section -->
      <div class="space-y-6">
        <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
            <h2 class="text-xl font-medium">Print Modules</h2>
            <p class="text-sm text-slate-500 mt-1">Define your print configurations</p>
          </div>
          
          <!-- Add Module Form -->
          <form method="POST" action="?/addModule" class="p-6 space-y-4">
            <div>
              <label for="moduleName" class="block text-sm text-slate-400 mb-2">Module Name</label>
              <input 
                type="text" 
                id="moduleName"
                name="name"
                required
                placeholder="e.g., Small Gear Print"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            
            <div>
              <label for="modulePath" class="block text-sm text-slate-400 mb-2">File Path</label>
              <input 
                type="text" 
                id="modulePath"
                name="path"
                required
                placeholder="/Users/username/Documents/3d-models/file.3mf"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
              />
              <p class="text-xs text-slate-600 mt-1">Must be an absolute path</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="expectedWeight" class="block text-sm text-slate-400 mb-2">Weight (g)</label>
                <input 
                  type="number" 
                  id="expectedWeight"
                  name="expectedWeight"
                  required
                  min="0"
                  step="0.1"
                  placeholder="25"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label for="expectedTime" class="block text-sm text-slate-400 mb-2">Time (min)</label>
                <input 
                  type="number" 
                  id="expectedTime"
                  name="expectedTime"
                  required
                  min="0"
                  placeholder="120"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label for="objectsPerPrint" class="block text-sm text-slate-400 mb-2">Objects Per Print</label>
              <input 
                type="number" 
                id="objectsPerPrint"
                name="objectsPerPrint"
                required
                min="1"
                value="1"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <button 
              type="submit"
              class="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-3 rounded-lg transition-colors"
            >
              Add Module
            </button>
          </form>
        </div>

        <!-- Modules List -->
        {#if data.printModules && data.printModules.length > 0}
          <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
              <h3 class="text-lg font-medium">Existing Modules ({data.printModules.length})</h3>
            </div>
            <div class="divide-y divide-slate-800">
              {#each data.printModules as module}
                <div class="p-4 hover:bg-slate-800/30 transition-colors">
                  <div class="flex justify-between items-start mb-2">
                    <h4 class="text-white font-medium">{module.name}</h4>
                    <form method="POST" action="?/deleteModule">
                      <input type="hidden" name="id" value={module.id} />
                      <button 
                        type="submit"
                        class="text-red-400 hover:text-red-300 text-sm"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                  <div class="space-y-1 text-sm">
                    <p class="text-slate-400 font-mono text-xs truncate">{module.path}</p>
                    <div class="flex gap-4 text-slate-500">
                      <span>{module.expected_weight}g</span>
                      <span>{module.expected_time}min</span>
                      <span>{module.objects_per_print} objects</span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Spool Presets Section -->
      <div class="space-y-6">
        <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
            <h2 class="text-xl font-medium">Spool Presets</h2>
            <p class="text-sm text-slate-500 mt-1">Create reusable spool configurations</p>
          </div>
          
          <!-- Add Preset Form -->
          <form method="POST" action="?/addSpoolPreset" class="p-6 space-y-4">
            <div>
              <label for="presetName" class="block text-sm text-slate-400 mb-2">Preset Name</label>
              <input 
                type="text" 
                id="presetName"
                name="name"
                required
                placeholder="e.g., Bambu PLA Basic Black"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="brand" class="block text-sm text-slate-400 mb-2">Brand</label>
                <input 
                  type="text" 
                  id="brand"
                  name="brand"
                  required
                  placeholder="Bambu Lab"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label for="material" class="block text-sm text-slate-400 mb-2">Material</label>
                <input 
                  type="text" 
                  id="material"
                  name="material"
                  required
                  placeholder="PLA"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="color" class="block text-sm text-slate-400 mb-2">Color</label>
                <input 
                  type="text" 
                  id="color"
                  name="color"
                  placeholder="Black"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label for="defaultWeight" class="block text-sm text-slate-400 mb-2">Weight (g)</label>
                <input 
                  type="number" 
                  id="defaultWeight"
                  name="defaultWeight"
                  required
                  min="0"
                  value="1000"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label for="cost" class="block text-sm text-slate-400 mb-2">Cost ($)</label>
              <input 
                type="number" 
                id="cost"
                name="cost"
                min="0"
                step="0.01"
                placeholder="20.00"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <button 
              type="submit"
              class="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-3 rounded-lg transition-colors"
            >
              Add Spool Preset
            </button>
          </form>
        </div>

        <!-- Presets List -->
        {#if data.spoolPresets && data.spoolPresets.length > 0}
          <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
              <h3 class="text-lg font-medium">Existing Presets ({data.spoolPresets.length})</h3>
            </div>
            <div class="divide-y divide-slate-800">
              {#each data.spoolPresets as preset}
                <div class="p-4 hover:bg-slate-800/30 transition-colors">
                  <div class="flex justify-between items-start">
                    <div>
                      <h4 class="text-white font-medium mb-1">{preset.name}</h4>
                      <p class="text-sm text-slate-400">{preset.brand} • {preset.material}</p>
                      {#if preset.color}
                        <p class="text-xs text-slate-500 mt-1">{preset.color}</p>
                      {/if}
                      <div class="flex gap-4 mt-2 text-sm">
                        <span class="text-slate-500">{preset.default_weight}g</span>
                        {#if preset.cost}
                          <span class="text-green-400">${preset.cost.toFixed(2)}</span>
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

    </div>
  </div>
</div>

<style>
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