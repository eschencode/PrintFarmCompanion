<script lang="ts">
  import { onMount } from 'svelte';
  
  let { children } = $props();

  onMount(() => {
    // Prevent sleep on iPad
    if (document.hidden !== undefined) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          ctx?.fillRect(0, 0, 1, 1);
        }
      });
    }

    // Disable auto-sleep
    const noSleep = new (window as any).NoSleep();
    noSleep.enable();
  });
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Printer Kiosk" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/nosleep/0.12.0/NoSleep.min.js"></script>
</svelte:head>

<style>
  :global(html), :global(body) {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    background: #f2f2f7;
    color: #000000;
    font-family: Arial, sans-serif;
    height: 100vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
  }

  :global(a) {
    -webkit-appearance: none;
    appearance: none;
  }

  :global(button) {
    -webkit-appearance: none;
    appearance: none;
  }
</style>

{@render children()}