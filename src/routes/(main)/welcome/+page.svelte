<script lang="ts">
  const steps = [
    {
      n: 1,
      title: "Add your printers",
      desc: "Tell us what machines you run. Manual mode works with just a name — connection details can come later.",
      href: "/setup/printers",
    },
    {
      n: 2,
      title: "Add your filament",
      desc: "Set up the spools you print with — brand, material, color — so jobs can track material usage.",
      href: "/setup/spools",
    },
    {
      n: 3,
      title: "Add a print module",
      desc: "A module is something you print. Upload a sliced file and print time, weight and filaments are read automatically.",
      href: "/setup/modules",
    },
    {
      n: 4,
      title: "Set up inventory",
      desc: "Every successful print counts into stock. Inventory tracks it and forecasts demand so you print the right things.",
      href: "/setup/inventory",
    },
    {
      n: 5,
      title: "Arrange your dashboard",
      desc: "We fill your grid with every printer and tool. Rearrange it, resize it, split it into pages — however you like to work.",
      href: "/setup/dashboard",
    },
    {
      n: 6,
      title: "See how it performs",
      desc: "Utilization, failures, filament use — stats build up automatically as you print. Just a quick look around.",
      href: "/setup/stats",
    },
  ];
</script>

<svelte:head><title>Welcome · Print Farm Companion</title></svelte:head>

<div class="min-h-screen bg-white dark:bg-[#0a0a0b] text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-6">
  <div class="w-full max-w-lg">
    <div class="mb-10">
      <h1 class="text-4xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50">
        Welcome to your print&nbsp;farm.
      </h1>
      <p class="text-sm text-zinc-500 mt-3 leading-relaxed">
        Your dashboard is a grid — every cell is a printer, a stat, or a tool.
        Right now it's waiting for your setup. A few short steps and it comes alive.
        You can skip anything and finish later; your progress is saved.
      </p>
    </div>

    <div class="space-y-3 mb-10">
      {#each steps as step}
        <div class="flex items-start gap-4 bg-zinc-50 dark:bg-[#0c0c0f] border border-zinc-200/80 dark:border-[#1a1a22] rounded-xl p-4">
          <div class="shrink-0 w-7 h-7 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold flex items-center justify-center mt-0.5">
            {step.n}
          </div>
          <div>
            <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100">{step.title}</p>
            <p class="text-xs text-zinc-500 mt-1 leading-relaxed">{step.desc}</p>
          </div>
        </div>
      {/each}
    </div>

    <div class="flex items-center gap-3">
      <a
        href="/setup/printers"
        class="flex-1 text-center rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium py-3 hover:opacity-90 transition-opacity"
      >
        Start setup
      </a>
      <a
        href="/"
        class="px-5 py-3 rounded-lg text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        Skip for now
      </a>
    </div>
    <p class="text-xs text-zinc-400 dark:text-zinc-600 mt-4 text-center">
      Everything here also lives in Settings — this is just the guided path.
    </p>
  </div>
</div>
