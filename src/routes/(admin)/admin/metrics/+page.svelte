<script lang="ts">
  import { onMount } from "svelte";
  import * as echarts from "echarts";

  let { data } = $props();

  let signupsEl: HTMLDivElement;
  let jobsEl: HTMLDivElement;

  onMount(() => {
    const charts: echarts.ECharts[] = [];

    const lineOpts = (rows: { day: string; count: number }[], color: string, name: string) => ({
      grid: { left: 40, right: 16, top: 16, bottom: 28 },
      tooltip: { trigger: "axis" as const },
      xAxis: { type: "category" as const, data: rows.map((r) => r.day) },
      yAxis: { type: "value" as const, minInterval: 1 },
      series: [
        {
          name,
          type: "line" as const,
          data: rows.map((r) => r.count),
          smooth: true,
          showSymbol: false,
          lineStyle: { color, width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: color + "40" },
              { offset: 1, color: color + "00" },
            ]),
          },
        },
      ],
    });

    const signupsChart = echarts.init(signupsEl);
    signupsChart.setOption(lineOpts(data.metrics.signupsByDay, "#7c3aed", "Signups"));
    charts.push(signupsChart);

    const jobsChart = echarts.init(jobsEl);
    jobsChart.setOption({
      grid: { left: 40, right: 16, top: 16, bottom: 28 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: data.metrics.jobsByDay.map((r) => r.day) },
      yAxis: { type: "value", minInterval: 1 },
      series: [
        {
          name: "Print jobs",
          type: "bar",
          data: data.metrics.jobsByDay.map((r) => r.count),
          itemStyle: { color: "#7c3aed", borderRadius: [3, 3, 0, 0] },
        },
      ],
    });
    charts.push(jobsChart);

    const onResize = () => charts.forEach((c) => c.resize());
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      charts.forEach((c) => c.dispose());
    };
  });
</script>

<svelte:head><title>Metrics · Admin</title></svelte:head>

<h1 class="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-6">Platform metrics</h1>

<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
  {#each [
    { label: "Users", value: data.metrics.totals.users },
    { label: "Workspaces", value: data.metrics.totals.workspaces },
    { label: "Active (7d)", value: data.metrics.totals.active7d },
    { label: "Active (30d)", value: data.metrics.totals.active30d },
  ] as stat}
    <div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl p-4">
      <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">{stat.label}</p>
      <p class="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50 mt-1">{stat.value}</p>
    </div>
  {/each}
</div>

<div class="space-y-4">
  <div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl p-5">
    <p class="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">Signups (last 90 days)</p>
    <div bind:this={signupsEl} class="w-full h-64"></div>
  </div>

  <div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl p-5">
    <p class="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">Print jobs (last 90 days)</p>
    <div bind:this={jobsEl} class="w-full h-64"></div>
  </div>
</div>
