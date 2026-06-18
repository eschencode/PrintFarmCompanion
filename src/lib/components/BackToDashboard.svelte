<script lang="ts">
  import { goto } from '$app/navigation';
</script>

<button
  type="button"
  on:click={() => goto('/')}
  class="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors cursor-pointer whitespace-nowrap"
>
  ← Back to Dashboard
</button>
