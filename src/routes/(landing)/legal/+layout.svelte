<script lang="ts">
  import "../../layout.css";
  import favicon from "$lib/assets/favicon.ico";

  let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-[#0a0a0b] text-zinc-300">
  <div class="max-w-2xl mx-auto px-6 py-12">
    <a href="/landing" class="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">← PrintFarmCompanion</a>

    <div class="mt-8 legal-prose">
      {@render children()}
    </div>

    <footer class="mt-16 pt-6 border-t border-[#232329] flex gap-5 text-sm text-zinc-500">
      <a href="/legal/imprint" class="hover:text-zinc-300 transition-colors">Imprint</a>
      <a href="/legal/privacy" class="hover:text-zinc-300 transition-colors">Privacy</a>
      <a href="/legal/terms" class="hover:text-zinc-300 transition-colors">Terms</a>
    </footer>
  </div>
</div>

<style>
  .legal-prose :global(h1) {
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: #fafafa;
    margin-bottom: 0.5rem;
  }
  .legal-prose :global(h2) {
    font-size: 1.125rem;
    font-weight: 600;
    color: #e4e4e7;
    margin-top: 2rem;
    margin-bottom: 0.5rem;
  }
  .legal-prose :global(p),
  .legal-prose :global(li) {
    font-size: 0.9rem;
    line-height: 1.7;
    color: #a1a1aa;
  }
  .legal-prose :global(p) {
    margin-bottom: 0.75rem;
  }
  .legal-prose :global(ul) {
    list-style: disc;
    padding-left: 1.25rem;
    margin-bottom: 0.75rem;
  }
  .legal-prose :global(a) {
    color: #d4d4d8;
    text-decoration: underline;
  }
  .legal-prose :global(.todo) {
    display: block;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.25);
    border-radius: 0.5rem;
    padding: 0.6rem 0.9rem;
    color: #fbbf24;
    font-size: 0.85rem;
    margin: 0.5rem 0 1rem;
  }
</style>
