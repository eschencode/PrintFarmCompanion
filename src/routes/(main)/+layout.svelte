<script lang="ts">
	import '../layout.css';
	import favicon from '$lib/assets/favicon.ico';
	import { authClient } from '$lib/auth-client';

	let { data, children } = $props();

	let exiting = $state(false);
	async function exitImpersonation() {
		exiting = true;
		try {
			// Full navigation: the endpoint restores the admin session cookie, so
			// hooks must re-resolve from scratch.
			await authClient.admin.stopImpersonating();
			window.location.href = '/admin';
		} catch (e) {
			console.error('stopImpersonating failed:', e);
			exiting = false;
		}
	}

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

{#if data.impersonating}
	<div class="sticky top-0 z-[100] flex items-center justify-center gap-3 bg-amber-500 text-amber-950 text-sm font-medium px-4 py-2">
		<span>Admin: acting as {data.user?.email}</span>
		<button
			onclick={exitImpersonation}
			disabled={exiting}
			class="h-7 px-3 rounded-md bg-amber-950 text-amber-100 text-xs font-semibold hover:bg-amber-900 disabled:opacity-60 transition-colors"
		>
			{exiting ? 'Exiting…' : 'Exit impersonation'}
		</button>
	</div>
{/if}

{@render children()}
