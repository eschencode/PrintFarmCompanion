<script lang="ts">
  import { enhance } from "$app/forms";

  const cards = [
    { title: "Utilization", desc: "How busy each printer is — active vs idle time across your fleet." },
    { title: "Module breakdown", desc: "Which modules you print most, their success rates and filament use." },
    { title: "Failure analysis", desc: "Where prints fail, so you can spot a flaky printer or a bad module." },
    { title: "Filament usage", desc: "Grams per spool type over time — what you're really burning through." },
  ];
</script>

<svelte:head><title>Stats · Print Farm Companion</title></svelte:head>

<div class="mb-6">
  <h1 class="text-3xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50">Your stats</h1>
  <p class="text-sm text-zinc-500 mt-2 leading-relaxed">
    Nothing to set up here — this is just where your farm's performance data
    lives. As you print, these build up automatically so you can see how things
    are going and where to improve.
  </p>
</div>

<div class="grid grid-cols-2 gap-3 mb-8">
  {#each cards as card}
    <div class="bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl p-4">
      <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
        {card.title}
      </p>
      <p class="text-xs text-zinc-500 mt-1.5 leading-relaxed">{card.desc}</p>
    </div>
  {/each}
</div>

<form method="POST" action="?/finish" use:enhance>
  <button
    type="submit"
    class="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium py-3 hover:opacity-90 transition-opacity"
  >
    Got it — take me to my dashboard 🎉
  </button>
</form>
