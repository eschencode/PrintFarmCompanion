<script lang="ts">
	import '../layout.css';
	import favicon from '$lib/assets/favicon.ico';

	let { children } = $props();

	import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { fileHandlerStore } from '$lib/stores/fileHandler';
  import { fileHandlerEnabled } from '$lib/stores/connectionToggles';

  onMount(() => {
    if (get(fileHandlerEnabled)) {
      fileHandlerStore.init();
    }

    const unsub = fileHandlerEnabled.subscribe((enabled) => {
      if (enabled) {
        fileHandlerStore.init();
      } else {
        fileHandlerStore.stopChecking();
      }
    });

    return () => {
      unsub();
      fileHandlerStore.stopChecking();
    };
  });
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
