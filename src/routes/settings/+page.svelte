<script lang="ts">
  import type { PageData, ActionData } from './$types';
  
  export let data: PageData;
  export let form: ActionData;
</script>

<h1>Settings</h1>

<nav class="breadcrumb">
  <a href="/">← Back to Dashboard</a>
</nav>

<!-- Show messages -->
{#if form?.success}
  <div class="success">
    <p>✅ {form.message || 'Action completed successfully'}</p>
  </div>
{/if}

{#if form?.error}
  <div class="error">
    <p>❌ {form.error}</p>
  </div>
{/if}

<!-- Add Print Module Form -->
<section>
  <h2>Add Print Module</h2>
  <form method="POST" action="?/addModule" class="settings-form">
    <div class="form-group">
      <label for="moduleName">Module Name:</label>
      <input type="text" name="name" id="moduleName" placeholder="e.g., Haken Blau" required />
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="expectedWeight">Expected Weight (g):</label>
        <input type="number" name="expectedWeight" id="expectedWeight" placeholder="175" required />
      </div>

      <div class="form-group">
        <label for="expectedTime">Expected Time (minutes):</label>
        <input type="number" name="expectedTime" id="expectedTime" placeholder="300" required />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="objectsPerPrint">Objects Per Print:</label>
        <input type="number" name="objectsPerPrint" id="objectsPerPrint" placeholder="19" value="1" required />
      </div>

      <div class="form-group">
        <label for="defaultSpoolPresetId">Default Spool Preset (optional):</label>
        <select name="defaultSpoolPresetId" id="defaultSpoolPresetId">
          <option value="">None</option>
          {#each data.spoolPresets as preset}
            <option value={preset.id}>{preset.name} - {preset.material}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="form-group">
      <label for="path">File Path:</label>
      <input type="text" name="path" id="path" placeholder="/models/haken_blau.3mf" required />
    </div>

    <button type="submit" class="btn-primary">Add Module</button>
  </form>
</section>

<hr />

<!-- Existing Print Modules -->
<section>
  <h2>Existing Print Modules ({data.printModules.length})</h2>
  
  {#if data.printModules.length === 0}
    <p>No print modules found.</p>
  {:else}
    <ul class="module-list">
      {#each data.printModules as module}
        <li>
          <div class="module-info">
            <strong>{module.name}</strong>
            <div class="module-details">
              <span>📦 {module.objects_per_print} objects</span>
              <span>⚖️ {module.expected_weight}g</span>
              <span>⏱️ {module.expected_time} min</span>
              <span>📁 {module.path}</span>
            </div>
          </div>
          <form method="POST" action="?/deleteModule" style="display: inline;">
            <input type="hidden" name="moduleId" value={module.id} />
            <button 
              type="submit" 
              class="btn-danger" 
              onclick={(e) => { 
                if (!confirm('Delete this module?')) e.preventDefault(); 
              }}
            >
              Delete
            </button>
          </form>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<hr />

<!-- Add Spool Preset Form -->
<section>
  <h2>Add Spool Preset</h2>
  <form method="POST" action="?/addSpoolPreset" class="settings-form">
    <div class="form-group">
      <label for="presetName">Preset Name:</label>
      <input type="text" name="name" id="presetName" placeholder="e.g., Bambu Blau PLA" required />
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="presetBrand">Brand:</label>
        <input type="text" name="brand" id="presetBrand" placeholder="Generic" required />
      </div>

      <div class="form-group">
        <label for="presetMaterial">Material:</label>
        <select name="material" id="presetMaterial" required>
          <option value="PLA">PLA</option>
          <option value="PETG">PETG</option>
          <option value="ABS">ABS</option>
          <option value="TPU">TPU</option>
          <option value="Nylon">Nylon</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="presetColor">Color:</label>
        <input type="text" name="color" id="presetColor" placeholder="Blue" />
      </div>

      <div class="form-group">
        <label for="defaultWeight">Default Weight (g):</label>
        <input type="number" name="defaultWeight" id="defaultWeight" placeholder="1000" required />
      </div>
    </div>

    <div class="form-group">
      <label for="presetCost">Cost:</label>
      <input type="number" step="0.01" name="cost" id="presetCost" placeholder="20.00" />
    </div>

    <button type="submit" class="btn-primary">Add Preset</button>
  </form>
</section>

<hr />

<!-- Existing Spool Presets -->
<section>
  <h2>Existing Spool Presets ({data.spoolPresets.length})</h2>
  
  {#if data.spoolPresets.length === 0}
    <p>No spool presets found.</p>
  {:else}
    <ul>
      {#each data.spoolPresets as preset}
        <li>
          <strong>{preset.name}</strong> - {preset.brand} {preset.material}
          {#if preset.color}({preset.color}){/if}
          - {preset.default_weight}g
          {#if preset.cost}
            - ${preset.cost.toFixed(2)}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

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