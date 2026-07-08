<script lang="ts">
  // Auth pages live outside the (main) group, so pull in the global Tailwind
  // stylesheet here too.
  import '../layout.css';
  let { children } = $props();
</script>

{@render children()}
