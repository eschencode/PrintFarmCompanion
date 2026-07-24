<script lang="ts">
  import { enhance } from "$app/forms";
  import BackToDashboard from "$lib/components/BackToDashboard.svelte";

  let { data, form } = $props();

  let saving = $state(false);
  let testing = $state(false);
</script>

<svelte:head><title>Pi Bridge · Settings</title></svelte:head>

<div class="min-h-screen p-6 sm:p-10">
  <div class="max-w-3xl mx-auto">

    <div class="mb-10 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-[2rem] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-none">Pi Bridge</h1>
        <p class="text-zinc-400 dark:text-zinc-500 text-sm mt-2">Raspberry Pi tunnel URL and secret for this workspace</p>
      </div>
      <BackToDashboard />
    </div>

    <div class="space-y-3">
      <div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">Connection</p>
        <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4">
          A Raspberry Pi on your local network bridges the browser to your printers over a
          Cloudflare tunnel. Enter its public tunnel URL and the shared secret it expects on the
          <code class="text-[0.7rem]">x-pi-secret</code> header. The secret is encrypted at rest and never sent back to the browser.
        </p>

        <form
          method="POST"
          action="?/savePiConfig"
          use:enhance={() => {
            saving = true;
            return async ({ update }) => {
              await update();
              saving = false;
            };
          }}
          class="space-y-4"
        >
          <div>
            <label for="tunnelUrl" class="block text-xs text-zinc-400 mb-1">Tunnel URL</label>
            <input
              id="tunnelUrl"
              name="tunnelUrl"
              type="url"
              placeholder="https://pi.yourdomain.com"
              value={data.piConfig?.tunnelUrl ?? ""}
              required
              class="w-full rounded-lg border border-zinc-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0c0c0c] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
            />
            <p class="text-[0.7rem] text-zinc-400 mt-1">Must be an https:// URL.</p>
          </div>

          <div>
            <label for="piSecret" class="block text-xs text-zinc-400 mb-1">Shared secret</label>
            <input
              id="piSecret"
              name="piSecret"
              type="password"
              autocomplete="off"
              placeholder={data.piConfig?.hasSecret ? "•••••••• (leave blank to keep current)" : "Enter the Pi secret"}
              class="w-full rounded-lg border border-zinc-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0c0c0c] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
            />
          </div>

          <div class="flex items-center gap-2.5">
            <button
              type="submit"
              disabled={saving}
              class="rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>

        {#if form?.saved}
          <p class="text-xs text-emerald-600 dark:text-emerald-400 mt-3">Saved.</p>
        {:else if form?.error}
          <p class="text-xs text-red-500 mt-3">{form.error}</p>
        {/if}
      </div>

      <!-- Test connection -->
      <div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">Test</p>
        <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4">
          Pings the Pi's <code class="text-[0.7rem]">/health</code> endpoint with the saved secret. Save your changes first.
        </p>
        <form
          method="POST"
          action="?/testPiConnection"
          use:enhance={() => {
            testing = true;
            return async ({ update }) => {
              await update({ reset: false });
              testing = false;
            };
          }}
          class="flex items-center gap-2.5"
        >
          <button
            type="submit"
            disabled={testing}
            class="rounded-lg border border-zinc-200 dark:border-[#2a2a2a] px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>

          {#if form?.tested && form?.success}
            <span class="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <span class="h-2 w-2 rounded-full bg-emerald-500"></span> Connected
            </span>
          {:else if form?.tested && form?.error}
            <span class="text-sm text-red-500">{form.error}</span>
          {/if}
        </form>
      </div>
    </div>
  </div>
</div>
