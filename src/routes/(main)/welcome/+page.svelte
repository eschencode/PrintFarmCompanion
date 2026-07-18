<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();

  // svelte-ignore state_referenced_locally
  let workspaceName = $state(data.workspaceName);
  let savingName = $state(false);
  let resending = $state(false);

  const displayName = $derived(form?.workspaceName ?? data.workspaceName);
  const verified = $derived(data.emailVerified);

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
    <div class="mb-8">
      <h1 class="text-4xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50">
        Welcome to your print&nbsp;farm.
      </h1>
      <p class="text-sm text-zinc-500 mt-3 leading-relaxed">
        Your dashboard is a grid — every cell is a printer, a stat, or a tool.
        Right now it's waiting for your setup. A few short steps and it comes alive.
        You can skip anything and finish later; your progress is saved.
      </p>
    </div>

    {#if !verified}
      <div class="mb-6 rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3.5 text-sm text-amber-800 dark:text-amber-200">
        {#if form?.resent}
          <p>Verification email sent to <span class="font-medium">{data.email}</span>. Check your inbox.</p>
        {:else}
          <div class="flex items-start justify-between gap-3">
            <p class="leading-relaxed">
              We sent a verification link to <span class="font-medium">{data.email}</span>.
              Verify your email to secure your account.
            </p>
            <form
              method="POST"
              action="?/resendVerification"
              use:enhance={() => {
                resending = true;
                return async ({ update }) => {
                  await update({ reset: false });
                  resending = false;
                };
              }}
            >
              <button
                type="submit" disabled={resending}
                class="shrink-0 whitespace-nowrap rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-medium hover:bg-amber-500/15 disabled:opacity-60 transition-colors"
              >
                {resending ? "Sending…" : "Resend"}
              </button>
            </form>
          </div>
          {#if form?.resendError}
            <p class="mt-2 text-xs text-red-600 dark:text-red-300">{form.resendError}</p>
          {/if}
        {/if}
      </div>
    {/if}

    <form
      method="POST"
      action="?/renameWorkspace"
      class="mb-8"
      use:enhance={() => {
        savingName = true;
        return async ({ update }) => {
          await update({ reset: false });
          savingName = false;
        };
      }}
    >
      <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Your workspace</span>
      <div class="mt-1.5 flex items-center gap-2">
        <input
          name="workspaceName" type="text" bind:value={workspaceName}
          placeholder={displayName || "My Printfarm"}
          class="flex-1 rounded-lg bg-zinc-50 dark:bg-[#0f0f11] border border-zinc-200 dark:border-[#232329] px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none transition-colors"
        />
        <button
          type="submit" disabled={savingName || workspaceName.trim() === displayName.trim() || !workspaceName.trim()}
          class="shrink-0 rounded-lg border border-zinc-300 dark:border-[#232329] px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-[#15151a] disabled:opacity-50 disabled:cursor-default transition-colors"
        >
          {savingName ? "Saving…" : form?.renamed ? "Saved" : "Rename"}
        </button>
      </div>
      {#if form?.renameError}
        <p class="mt-1.5 text-xs text-red-600 dark:text-red-300">{form.renameError}</p>
      {/if}
    </form>

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
