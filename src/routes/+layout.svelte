<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.ico';

	let { children } = $props();

	import { onMount } from 'svelte';
  import { fileHandlerStore } from '$lib/stores/fileHandler';
  
  onMount(() => {
    console.log('🚀 App initialized - starting file handler');
    fileHandlerStore.init();
    
    // Cleanup when app closes (browser tab closed)
    return () => {
      console.log('👋 App closing - stopping file handler');
      fileHandlerStore.stopChecking();
    };
  });
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
