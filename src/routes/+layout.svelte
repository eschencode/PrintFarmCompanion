<script lang="ts">
	import ConfirmDialogHost from '$lib/components/ConfirmDialogHost.svelte';

	let { children } = $props();
</script>

{@render children()}
<ConfirmDialogHost />
