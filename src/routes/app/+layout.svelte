<script lang="ts">
  import { page } from '$app/stores';
  let { children } = $props();

  let path = $derived($page.url.pathname);
  let isPrinters = $derived(path === '/app' || path === '/app/');
  let isInventory = $derived(path.startsWith('/app/inventory'));
</script>

<svelte:head>
  <title>PrintFarm</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="PrintFarm" />
  <meta name="theme-color" content="#0a0a0a" />
  <link rel="apple-touch-icon" href="/favicon.png" />
</svelte:head>

<div class="shell">
  <main class="content">
    {@render children()}
  </main>

  <nav class="tabbar">
    <a href="/app" class:active={isPrinters} aria-label="Printers">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M7 16v3M17 16v3M3 9h18" />
      </svg>
      <span>Printers</span>
    </a>
    <a href="/app/inventory" class:active={isInventory} aria-label="Inventory">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      <span>Inventory</span>
    </a>
  </nav>
</div>

<style>
  :global(html), :global(body) {
    margin: 0;
    padding: 0;
    background: #0a0a0a;
    color: #f5f5f7;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overscroll-behavior: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-text-size-adjust: 100%;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(button) {
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
  }

  .shell {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  .content {
    flex: 1;
    padding: calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 96px) 16px;
  }

  .tabbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    background: rgba(18, 18, 20, 0.85);
    -webkit-backdrop-filter: saturate(180%) blur(24px);
    backdrop-filter: saturate(180%) blur(24px);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding-bottom: env(safe-area-inset-bottom);
    z-index: 100;
  }

  .tabbar a {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 10px 0 8px 0;
    color: #6e6e73;
    text-decoration: none;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.2px;
    transition: color 0.15s ease;
  }

  .tabbar a svg {
    width: 24px;
    height: 24px;
  }

  .tabbar a.active {
    color: #4a9eff;
  }
</style>
