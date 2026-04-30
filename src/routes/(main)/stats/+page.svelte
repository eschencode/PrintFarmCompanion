<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import * as echarts from 'echarts';
  import ModuleBreakdown from '$lib/components/stats/ModuleBreakdown.svelte';
  import TimeRangeSelector from '$lib/components/stats/TimeRangeSelector.svelte';
  import { selectedTimeRange, customFrom, customTo } from '$lib/stores/timeRange';
  import type { TimeRangeKey } from '$lib/stores/timeRange';

  export let data: PageData;

  // Type definitions for breakdown data structures

  interface ColorData {
    count: number;
    objects: number;
    weight: number;
    cost: number;
    wastedCost: number;
    wastedWeight: number;
  }

  interface ModuleData {
    total: number;
    totalObjects: number;
    totalWeight: number;
    totalCost: number;
    wastedCost: number;
    wastedWeight: number;
    successfulPrints: number;
    failedPrints: number;
    avgCostPerPrint: number;
    avgWeightPerPrint: number;
    costPerObject: number;
    colors: Record<string, ColorData>;
  }

  interface SubcategoryData {
    total: number;
    totalObjects: number;
    totalWeight: number;
    totalCost: number;
    wastedCost: number;
    wastedWeight: number;
    successfulPrints: number;
    failedPrints: number;
    modules: Record<string, ModuleData>;
  }

  interface CategoryData {
    total: number;
    totalObjects: number;
    totalWeight: number;
    totalCost: number;
    wastedCost: number;
    wastedWeight: number;
    successfulPrints: number;
    failedPrints: number;
    subcategories: Record<string, SubcategoryData>;
    modules: Record<string, ModuleData>;
    colors: Record<string, Omit<ColorData, 'weight' | 'wastedWeight'>>;
  }

  // Chart element references
  let printHistoryChart: HTMLDivElement;
  let materialUsageChart: HTMLDivElement;
  let utilizationStackedChartEl: HTMLDivElement;
  let utilizationPieChartEl!: HTMLDivElement;
  let utilizationStackedChart: echarts.ECharts | undefined;
  let utilizationPieChart: echarts.ECharts | undefined;
  let stockFlowChart: HTMLDivElement;
  let shopifyOrdersChart: HTMLDivElement;
  let spoolUsageChart: HTMLDivElement;
  let spoolUsageChartInstance: echarts.ECharts | undefined;

  /** Converts a filament color name to a CSS color for chart bars. */
  function spoolColorToCSS(name: string): string {
    const map: Record<string, string> = {
      black: '#27272a', schwarz: '#27272a',
      white: '#e4e4e7', weiss: '#e4e4e7', 'weiß': '#e4e4e7',
      red: '#ef4444', rot: '#ef4444',
      blue: '#3b82f6', blau: '#3b82f6',
      green: '#22c55e', grün: '#22c55e',
      yellow: '#eab308', gelb: '#eab308',
      orange: '#f97316',
      purple: '#a855f7', lila: '#a855f7', violett: '#a855f7',
      grey: '#71717a', gray: '#71717a', grau: '#71717a',
      brown: '#92400e', braun: '#92400e',
      pink: '#ec4899', rosa: '#ec4899',
    };
    return map[name.toLowerCase().trim()] ?? '#71717a';
  }

  function updateSpoolChart() {
    if (!spoolUsageChartInstance) return;
    const entries = currentSpoolUsage as any[];
    if (!entries || entries.length === 0) {
      spoolUsageChartInstance.setOption({ series: [{ data: [] }] });
      return;
    }
    const labels = entries.map((e: any) => `${e.color} ${e.material}`).reverse();
    const weights = entries.map((e: any) => e.weightUsed).reverse();
    const colors = entries.map((e: any) => spoolColorToCSS(e.color)).reverse();
    const isDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const tc = isDark ? '#a1a1aa' : '#737373';
    spoolUsageChartInstance.setOption({
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const p = params[0];
          const entry = entries[entries.length - 1 - p.dataIndex];
          return `<b>${p.name}</b><br/>${p.value}g &nbsp;·&nbsp; ${entry?.printCount ?? ''} prints`;
        }
      },
      grid: { left: 12, right: 24, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: tc, formatter: (v: number) => `${v}g` }, splitLine: { lineStyle: { color: isDark ? '#262626' : '#f4f4f5' } } },
      yAxis: { type: 'category', data: labels, axisLabel: { color: tc } },
      series: [{
        type: 'bar', data: weights,
        itemStyle: { color: (params: any) => colors[params.dataIndex] },
        barMaxWidth: 32
      }]
    }, true);
  }

  $: if (currentSpoolUsage) updateSpoolChart();

  // Toggle states
  let showSpools = false;
  let showPrintHistory = false;

  // Edit spool state
  let editingSpoolId: number | null = null;
  let editForm = {
    brand: '',
    material: '',
    color: '',
    remaining_weight: 0,
    cost: 0
  };

  // Custom range: fetched from API when both dates are set
  let customStats: any = null;
  let customLoading = false;

  async function fetchCustomStats(fromMs: number, toMs: number) {
    customLoading = true;
    try {
      const res = await fetch(`/api/stats?from=${fromMs}&to=${toMs}`);
      if (res.ok) customStats = await res.json();
    } catch (e) {
      console.error('Custom stats fetch failed:', e);
    } finally {
      customLoading = false;
    }
  }

  // Trigger fetch when custom range dates are both set
  $: if ($selectedTimeRange === 'custom' && $customFrom && $customTo) {
    fetchCustomStats(new Date($customFrom).getTime(), new Date($customTo + 'T23:59:59').getTime());
  }

  // Active stats source: custom API result or pre-computed server data
  $: activeStats = $selectedTimeRange === 'custom' ? customStats : null;

  // Reactive statements with proper typing
  $: sortedSpools = [...(data.spools || [])].sort((a, b) => b.id - a.id);
  $: currentUtil = $selectedTimeRange === 'custom'
    ? (activeStats?.utilizationScores ?? null)
    : (data.stats.utilizationScores as any)?.[$selectedTimeRange] ?? null;
  $: if (currentUtil) {
    utilizationStackedChart?.setOption({
      yAxis: { data: currentUtil.perPrinter.map((p: any) => p.name) },
      series: [
        { data: currentUtil.perPrinter.map((p: any) => p.successHrs) },
        { data: currentUtil.perPrinter.map((p: any) => p.failedHrs) },
        { data: currentUtil.perPrinter.map((p: any) => p.idleHrs) }
      ]
    });
    utilizationPieChart?.setOption({
      series: [{
        data: [
          { value: currentUtil.totalSuccessHrs, name: 'Successful', itemStyle: { color: '#22c55e' } },
          { value: currentUtil.totalFailedHrs,  name: 'Failed',     itemStyle: { color: '#ef4444' } },
          { value: currentUtil.totalIdleHrs,    name: 'Idle',       itemStyle: { color: '#3f3f46' } }
        ]
      }]
    });
  }
  $: currentFailures = $selectedTimeRange === 'custom'
    ? (activeStats?.failureAnalysis ?? null)
    : (data.stats as any).failureAnalysis?.[$selectedTimeRange] ?? null;
  $: currentBreakdown = ($selectedTimeRange === 'custom'
    ? (activeStats?.moduleBreakdown ?? {})
    : (data.stats.moduleBreakdown?.[$selectedTimeRange] || {})) as Record<string, CategoryData>;
  $: currentSpoolUsage = $selectedTimeRange === 'custom'
    ? (activeStats?.spoolUsage ?? [])
    : (data.stats as any).spoolUsage?.[$selectedTimeRange] ?? [];
  $: currentSets = data.stats.setCosts?.[$selectedTimeRange] || {};
  $: totalPrintsInRange = Object.values(currentBreakdown).reduce((sum, cat) => sum + (cat?.total || 0), 0);
  $: totalObjectsInRange = Object.values(currentBreakdown).reduce((sum, cat) => sum + (cat?.totalObjects || 0), 0);

  function getTimeRangeLabel(range: TimeRangeKey): string {
    switch(range) {
      case 'thisWeek':   return 'This Week';
      case 'last7Days':  return 'Last 7 Days';
      case 'thisMonth':  return 'This Month';
      case 'last30Days': return 'Last 30 Days';
      case 'last90Days': return 'Last 90 Days';
      case 'custom':     return 'Custom';
    }
  }

  function startEdit(spool: any) {
    editingSpoolId = spool.id;
    editForm = {
      brand: spool.brand,
      material: spool.material,
      color: spool.color || '',
      remaining_weight: spool.remaining_weight,
      cost: spool.cost || 0
    };
  }

  function cancelEdit() {
    editingSpoolId = null;
    editForm = {
      brand: '',
      material: '',
      color: '',
      remaining_weight: 0,
      cost: 0
    };
  }

  function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleString();
  }

  function formatDuration(start: number, end: number | null) {
    if (!end) return 'In Progress';
    const minutes = Math.floor((end - start) / 1000 / 60);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  // ✅ FIX: Navigation function that always works
  function navigateToDashboard() {
    goto('/');
  }

  onMount(() => {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const textColor = isDark ? '#a1a1aa' : '#737373';
    const gridColor = isDark ? '#262626' : '#f4f4f5';
    const axisColor = isDark ? '#262626' : '#e5e5e5';
    const tooltipBg = isDark ? '#111111' : '#ffffff';
    const tooltipBorder = isDark ? '#262626' : '#e5e5e5';
    const tooltipText = isDark ? '#fafafa' : '#0a0a0a';
    const labelColor = isDark ? '#fafafa' : '#0a0a0a';

    // Print History Line Chart
    const historyChart = echarts.init(printHistoryChart);
    historyChart.setOption({
      title: {
        text: 'Print History (Last 30 Days)',
        textStyle: { color: textColor }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: data.stats.last30Days,
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: textColor }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: textColor },
        splitLine: { lineStyle: { color: gridColor } }
      },
      series: [{
        name: 'Prints',
        type: 'line',
        data: data.stats.dailyPrintCounts,
        smooth: true,
        lineStyle: { color: '#3b82f6', width: 3 },
        itemStyle: { color: '#3b82f6' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(59, 130, 246, 0.4)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
          ])
        }
      }]
    });

    // Material Usage Chart
    const materialChart = echarts.init(materialUsageChart);
    materialChart.setOption({
      title: {
        text: 'Material Usage (Last 30 Days)',
        textStyle: { color: textColor }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText },
        formatter: '{b}: {c}g'
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: data.stats.last30Days,
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: textColor }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: textColor, formatter: '{value}g' },
        splitLine: { lineStyle: { color: gridColor } }
      },
      series: [{
        name: 'Material (g)',
        type: 'bar',
        data: data.stats.dailyMaterialUsage,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#8b5cf6' },
            { offset: 1, color: '#6d28d9' }
          ])
        }
      }]
    });

    // Farm Utilization Stacked Bar Chart
    if (data.stats.utilizationScores && utilizationStackedChartEl) {
      const util = (data.stats.utilizationScores as any)[$selectedTimeRange];
      if (util?.perPrinter?.length) {
        const printerNames = util.perPrinter.map((p: any) => p.name);
        const successData = util.perPrinter.map((p: any) => p.successHrs);
        const failedData = util.perPrinter.map((p: any) => p.failedHrs);
        const idleData = util.perPrinter.map((p: any) => p.idleHrs);
        const chartHeight = Math.max(240, printerNames.length * 52);
        utilizationStackedChartEl.style.height = `${chartHeight}px`;
        utilizationStackedChart = echarts.init(utilizationStackedChartEl);
        utilizationStackedChart.setOption({
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            textStyle: { color: tooltipText },
            formatter: (params: any[]) => {
              const rows = params.map((p: any) => `${p.marker}${p.seriesName}: <b>${p.value}h</b>`).join('<br/>');
              return `<b>${params[0].name}</b><br/>${rows}`;
            }
          },
          legend: {
            data: ['Successful', 'Failed', 'Idle'],
            textStyle: { color: textColor },
            top: 0
          },
          grid: { left: 16, right: 24, top: 30, bottom: 0, containLabel: true },
          xAxis: {
            type: 'value',
            axisLine: { lineStyle: { color: axisColor } },
            axisLabel: { color: newTextColor, formatter: '{value}h' },
            splitLine: { lineStyle: { color: gridColor } }
          },
          yAxis: {
            type: 'category',
            data: printerNames,
            axisLine: { lineStyle: { color: axisColor } },
            axisLabel: { color: textColor }
          },
          series: [
            { name: 'Successful', type: 'bar', stack: 'total', data: successData, itemStyle: { color: '#22c55e' } },
            { name: 'Failed',     type: 'bar', stack: 'total', data: failedData,  itemStyle: { color: '#ef4444' } },
            { name: 'Idle',       type: 'bar', stack: 'total', data: idleData,    itemStyle: { color: '#3f3f46' } }
          ]
        });
      }
    }

    // Farm Utilization Pie Chart (Successful / Failed / Idle)
    if (data.stats.utilizationScores && utilizationPieChartEl) {
      const util = (data.stats.utilizationScores as any)[$selectedTimeRange];
      if (util) {
        utilizationPieChart = echarts.init(utilizationPieChartEl);
        utilizationPieChart.setOption({
          tooltip: {
            trigger: 'item',
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            textStyle: { color: tooltipText },
            formatter: '{b}: {c}h ({d}%)'
          },
          series: [{
            type: 'pie',
            radius: ['55%', '80%'],
            avoidLabelOverlap: false,
            label: { show: false },
            labelLine: { show: false },
            data: [
              { value: util.totalSuccessHrs, name: 'Successful', itemStyle: { color: '#22c55e' } },
              { value: util.totalFailedHrs,  name: 'Failed',     itemStyle: { color: '#ef4444' } },
              { value: util.totalIdleHrs,    name: 'Idle',       itemStyle: { color: '#3f3f46' } }
            ]
          }]
        });
      }
    }

    // Stock Flow Chart (Production vs Sales)
    let stockFlowChartInstance: echarts.ECharts | undefined;
    if (data.inventoryStats?.dailyStockFlow && stockFlowChart) {
      const flow = data.inventoryStats.dailyStockFlow;
      stockFlowChartInstance = echarts.init(stockFlowChart);
      stockFlowChartInstance.setOption({
        title: {
          text: 'Production vs Sales (Last 30 Days)',
          textStyle: { color: textColor }
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          textStyle: { color: tooltipText }
        },
        legend: {
          data: ['Produced', 'Sold B2C', 'Sold B2B'],
          textStyle: { color: textColor },
          top: 30
        },
        grid: { left: '3%', right: '4%', bottom: '3%', top: 70, containLabel: true },
        xAxis: {
          type: 'category',
          data: flow.map((d: any) => d.label),
          axisLine: { lineStyle: { color: axisColor } },
          axisLabel: { color: textColor }
        },
        yAxis: {
          type: 'value',
          axisLine: { lineStyle: { color: axisColor } },
          axisLabel: { color: textColor },
          splitLine: { lineStyle: { color: gridColor } }
        },
        series: [
          {
            name: 'Produced',
            type: 'bar',
            stack: 'in',
            data: flow.map((d: any) => d.produced),
            itemStyle: { color: '#22c55e' }
          },
          {
            name: 'Sold B2C',
            type: 'bar',
            stack: 'out',
            data: flow.map((d: any) => d.sold_b2c),
            itemStyle: { color: '#3b82f6' }
          },
          {
            name: 'Sold B2B',
            type: 'bar',
            stack: 'out',
            data: flow.map((d: any) => d.sold_b2b),
            itemStyle: { color: '#f59e0b' }
          }
        ]
      });
    }

    // Shopify Daily Orders Chart
    let shopifyChartInstance: echarts.ECharts | undefined;
    if (data.shopifyStats?.dailyOrders && shopifyOrdersChart) {
      const orders = data.shopifyStats.dailyOrders;
      shopifyChartInstance = echarts.init(shopifyOrdersChart);
      shopifyChartInstance.setOption({
        title: {
          text: 'Shopify Orders (Last 30 Days)',
          textStyle: { color: textColor }
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          textStyle: { color: tooltipText }
        },
        legend: {
          data: ['Orders', 'Items Sold'],
          textStyle: { color: textColor },
          top: 30
        },
        grid: { left: '3%', right: '4%', bottom: '3%', top: 70, containLabel: true },
        xAxis: {
          type: 'category',
          data: orders.map((d: any) => d.label),
          axisLine: { lineStyle: { color: axisColor } },
          axisLabel: { color: textColor }
        },
        yAxis: [
          {
            type: 'value',
            name: 'Orders',
            axisLine: { lineStyle: { color: axisColor } },
            axisLabel: { color: textColor },
            splitLine: { lineStyle: { color: gridColor } }
          },
          {
            type: 'value',
            name: 'Items',
            axisLine: { lineStyle: { color: axisColor } },
            axisLabel: { color: textColor },
            splitLine: { show: false }
          }
        ],
        series: [
          {
            name: 'Orders',
            type: 'bar',
            data: orders.map((d: any) => d.orders),
            itemStyle: { color: '#8b5cf6' }
          },
          {
            name: 'Items Sold',
            type: 'line',
            yAxisIndex: 1,
            data: orders.map((d: any) => d.items),
            smooth: true,
            lineStyle: { color: '#f43f5e', width: 2 },
            itemStyle: { color: '#f43f5e' }
          }
        ]
      });
    }

    // Spool Usage Bar Chart (initialized after onMount; updated reactively)
    if (spoolUsageChart) {
      spoolUsageChartInstance = echarts.init(spoolUsageChart);
      updateSpoolChart();
    }

    // Update charts when color scheme changes
    const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleColorSchemeChange = (e: MediaQueryListEvent) => {
      const dark = e.matches;
      const newTextColor = dark ? '#a1a1aa' : '#737373';
      const newGridColor = dark ? '#262626' : '#f4f4f5';
      const newAxisColor = dark ? '#262626' : '#e5e5e5';
      const newTooltipBg = dark ? '#111111' : '#ffffff';
      const newTooltipBorder = dark ? '#262626' : '#e5e5e5';
      const newTooltipText = dark ? '#fafafa' : '#0a0a0a';
      const newLabelColor = dark ? '#fafafa' : '#0a0a0a';

      const axisUpdate = {
        axisLine: { lineStyle: { color: newAxisColor } },
        axisLabel: { color: newTextColor }
      };
      const splitLineUpdate = { splitLine: { lineStyle: { color: newGridColor } } };
      const tooltipUpdate = {
        backgroundColor: newTooltipBg,
        borderColor: newTooltipBorder,
        textStyle: { color: newTooltipText }
      };

      historyChart.setOption({
        title: { textStyle: { color: newTextColor } },
        tooltip: tooltipUpdate,
        xAxis: axisUpdate,
        yAxis: { ...axisUpdate, ...splitLineUpdate }
      });
      materialChart.setOption({
        title: { textStyle: { color: newTextColor } },
        tooltip: tooltipUpdate,
        xAxis: axisUpdate,
        yAxis: { ...axisUpdate, ...splitLineUpdate }
      });
      utilizationStackedChart?.setOption({
        tooltip: tooltipUpdate,
        legend: { textStyle: { color: newTextColor } },
        xAxis: { ...axisUpdate, ...splitLineUpdate },
        yAxis: axisUpdate
      });
      utilizationPieChart?.setOption({ tooltip: tooltipUpdate });
    };

    colorSchemeQuery.addEventListener('change', handleColorSchemeChange);

    // Resize charts on window resize
    const handleResize = () => {
      historyChart.resize();
      materialChart.resize();
      utilizationStackedChart?.resize();
      utilizationPieChart?.resize();
      stockFlowChartInstance?.resize();
      shopifyChartInstance?.resize();
    };

    window.addEventListener('resize', handleResize);

    // Cleanup when component unmounts
    return () => {
      window.removeEventListener('resize', handleResize);
      colorSchemeQuery.removeEventListener('change', handleColorSchemeChange);
      historyChart.dispose();
      materialChart.dispose();
      spoolUsageChartInstance?.dispose();
      utilizationStackedChart?.dispose();
      utilizationPieChart?.dispose();
      stockFlowChartInstance?.dispose();
      shopifyChartInstance?.dispose();
    };
  });
</script>

<div class="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-50 p-6">
  <div class="max-w-7xl mx-auto">
    <!-- Header - Use dedicated function and higher z-index -->
    <div class="flex justify-between items-center mb-8 relative z-50">
      <h1 class="text-3xl font-light">Statistics & Analytics</h1>
      <button
        on:click={navigateToDashboard}
        class="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors cursor-pointer pointer-events-auto"
      >
        ← Back to Dashboard
      </button>
    </div>

    <!-- Global Time Range Selector -->
    <TimeRangeSelector />

    <!-- Key Metrics Cards -->
    <div class="grid grid-cols-5 gap-4 mb-8">
      <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-6">
        <p class="text-zinc-500 text-sm mb-1">Total Prints</p>
        <p class="text-3xl font-medium text-zinc-900 dark:text-zinc-50">{data.stats.totalPrints}</p>
      </div>
      <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-6">
        <p class="text-zinc-500 text-sm mb-1">Success Rate</p>
        <p class="text-3xl font-medium text-green-600 dark:text-green-400">
          {data.stats.totalPrints > 0 ? ((data.stats.successfulPrints / data.stats.totalPrints) * 100).toFixed(1) : 0}%
        </p>
      </div>
      <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-6">
        <p class="text-zinc-500 text-sm mb-1">Material Used</p>
        <p class="text-3xl font-medium text-blue-600 dark:text-blue-400">{data.stats.totalMaterialUsed}g</p>
      </div>
      <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-6">
        <p class="text-zinc-500 text-sm mb-1">Total Runtime</p>
        <p class="text-3xl font-medium text-purple-400">{data.stats.totalHours.toFixed(1)}h</p>
      </div>
      <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-6">
        <p class="text-zinc-500 text-sm mb-1">Active Printers</p>
        <p class="text-3xl font-medium text-cyan-400">{data.printers.length}</p>
      </div>
    </div>

    <!-- Spool Usage Bar Chart -->
    <div class="bg-white dark:bg-[#111] border border-zinc-100 dark:border-[#1e1e1e] rounded-xl p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-medium text-zinc-900 dark:text-zinc-50">Filament Usage</h2>
          <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Weight consumed by color · material this period</p>
        </div>
        {#if customLoading}
          <svg class="w-4 h-4 text-zinc-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        {/if}
      </div>
      {#if currentSpoolUsage && currentSpoolUsage.length > 0}
        <div bind:this={spoolUsageChart} style="width:100%; height:{Math.max(140, (currentSpoolUsage as any[]).length * 40)}px"></div>
      {:else}
        <p class="text-sm text-zinc-400 dark:text-zinc-600 text-center py-6">No filament data for this period.</p>
      {/if}
    </div>

    <!-- Toggle Buttons Row -->
    <div class="flex gap-3 mb-6">
      <button
        on:click|stopPropagation={() => showPrintHistory = !showPrintHistory}
        class="flex items-center gap-2 bg-zinc-50 dark:bg-[#111111] hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-[#262626] rounded-lg px-4 py-2.5 transition-colors"
      >
        <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span class="text-zinc-900 dark:text-zinc-50 font-medium">
          {showPrintHistory ? 'Hide' : 'Show'} Print History
        </span>
        <span class="text-zinc-500 text-sm">({data.printJobs.length})</span>
        <svg
          class="w-4 h-4 text-zinc-500 transition-transform duration-200 {showPrintHistory ? 'rotate-180' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <button
        on:click|stopPropagation={() => showSpools = !showSpools}
        class="flex items-center gap-2 bg-zinc-50 dark:bg-[#111111] hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-[#262626] rounded-lg px-4 py-2.5 transition-colors"
      >
        <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <span class="text-zinc-900 dark:text-zinc-50 font-medium">
          {showSpools ? 'Hide' : 'Show'} All Spools
        </span>
        <span class="text-zinc-500 text-sm">({data.spools?.length || 0})</span>
        <svg
          class="w-4 h-4 text-zinc-500 transition-transform duration-200 {showSpools ? 'rotate-180' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>

    <!-- Print History Table (Collapsible) -->
    {#if showPrintHistory}
      <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg mb-8 overflow-hidden animate-fade-in">
        <div class="p-6 border-b border-zinc-200 dark:border-[#262626]">
          <h2 class="text-xl font-medium">Print History</h2>
          <p class="text-sm text-zinc-500 mt-1">{data.printJobs.length} total jobs</p>
        </div>
        <div class="overflow-x-auto max-h-96 overflow-y-auto">
          <table class="w-full">
            <thead class="bg-zinc-100 dark:bg-zinc-800 sticky top-0">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Date</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Module</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Printer</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Material</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Status</th>
              </tr>
            </thead>
            <tbody>
              {#each data.printJobs as job}
                {@const printer = data.printers.find(p => p.id === job.printer_id)}
                <tr class="border-t border-zinc-200 dark:border-[#262626] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  <td class="px-4 py-3 text-sm text-zinc-500">
                    {formatDate(job.start_time)}
                  </td>
                  <td class="px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50 font-medium">
                    {job.name || 'Unknown'}
                  </td>
                  <td class="px-4 py-3 text-sm text-zinc-500">
                    {printer?.name || 'Unknown'}
                  </td>
                  <td class="px-4 py-3 text-sm text-zinc-500">
                    {job.actual_weight || job.planned_weight}g
                  </td>
                  <td class="px-4 py-3 text-sm">
                    {#if job.status === 'printing'}
                      <span class="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        In Progress
                      </span>
                    {:else if job.status === 'success'}
                      <span class="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                        Success
                      </span>
                    {:else if job.status === 'failed'}
                      <div>
                        <span class="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                          </svg>
                          Failed
                        </span>
                        {#if job.failure_reason}
                          <p class="text-xs text-zinc-500 mt-1">{job.failure_reason}</p>
                        {/if}
                      </div>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- All Spools Table (UPDATED with Edit/Delete) -->
    {#if showSpools}
      <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg mb-8 overflow-hidden animate-fade-in">
        <div class="p-6 border-b border-zinc-200 dark:border-[#262626]">
          <h2 class="text-xl font-medium">All Spools</h2>
          <p class="text-sm text-zinc-500 mt-1">{sortedSpools.length} total spools (newest first)</p>
        </div>
        <div class="overflow-x-auto max-h-96 overflow-y-auto">
          <table class="w-full">
            <thead class="bg-zinc-100 dark:bg-zinc-800 sticky top-0 z-10">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">ID</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Brand</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Material</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Color</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Initial</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Remaining</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Used</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">% Left</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Cost</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Status</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#if sortedSpools.length > 0}
                {#each sortedSpools as spool}
                  {@const percentLeft = ((spool.remaining_weight / spool.initial_weight) * 100).toFixed(1)}
                  {@const usedWeight = spool.initial_weight - spool.remaining_weight}
                  {@const isLoaded = data.printers.some(p => p.loaded_spool_id === spool.id)}
                  {@const loadedPrinter = data.printers.find(p => p.loaded_spool_id === spool.id)}
                  {@const isEditing = editingSpoolId === spool.id}

                  <tr class="border-t border-zinc-200 dark:border-[#262626] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                    <!-- ID -->
                    <td class="px-4 py-3 text-sm text-zinc-500 font-mono">
                      #{spool.id}
                    </td>

                    <!-- Brand (Editable) -->
                    <td class="px-4 py-3 text-sm">
                      {#if isEditing}
                        <input
                          type="text"
                          bind:value={editForm.brand}
                          class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-2 py-1 text-zinc-900 dark:text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                        />
                      {:else}
                        <span class="text-zinc-900 dark:text-zinc-50 font-medium">{spool.brand}</span>
                      {/if}
                    </td>

                    <!-- Material (Editable) -->
                    <td class="px-4 py-3 text-sm">
                      {#if isEditing}
                        <input
                          type="text"
                          bind:value={editForm.material}
                          class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-2 py-1 text-zinc-900 dark:text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                        />
                      {:else}
                        <span class="text-zinc-700 dark:text-zinc-300">{spool.material}</span>
                      {/if}
                    </td>

                    <!-- Color (Editable) -->
                    <td class="px-4 py-3 text-sm">
                      {#if isEditing}
                        <input
                          type="text"
                          bind:value={editForm.color}
                          placeholder="Color"
                          class="w-full bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-2 py-1 text-zinc-900 dark:text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                        />
                      {:else if spool.color}
                        <span class="inline-flex items-center gap-2">
                          <span class="w-3 h-3 rounded-full border border-zinc-300 dark:border-zinc-700" style="background-color: {spool.color.toLowerCase()}"></span>
                          {spool.color}
                        </span>
                      {:else}
                        <span class="text-zinc-500">-</span>
                      {/if}
                    </td>

                    <!-- Initial Weight (Read-only) -->
                    <td class="px-4 py-3 text-sm text-zinc-500">
                      {spool.initial_weight}g
                    </td>

                    <!-- Remaining Weight (Editable) -->
                    <td class="px-4 py-3 text-sm">
                      {#if isEditing}
                        <input
                          type="number"
                          bind:value={editForm.remaining_weight}
                          min="0"
                          max={spool.initial_weight}
                          class="w-20 bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-2 py-1 text-zinc-900 dark:text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                        />
                        <span class="text-zinc-500 text-xs ml-1">g</span>
                      {:else}
                        <span class="text-zinc-900 dark:text-zinc-50 font-medium">{spool.remaining_weight}g</span>
                      {/if}
                    </td>

                    <!-- Used Weight -->
                    <td class="px-4 py-3 text-sm text-zinc-500">
                      {usedWeight}g
                    </td>

                    <!-- Percentage Bar -->
                    <td class="px-4 py-3 text-sm">
                      <div class="flex items-center gap-2">
                        <div class="w-16 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            class="h-full transition-all duration-300 {
                              Number(percentLeft) > 50 ? 'bg-green-500' :
                              Number(percentLeft) > 20 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }"
                            style="width: {percentLeft}%"
                          ></div>
                        </div>
                        <span class="text-xs {
                          Number(percentLeft) > 50 ? 'text-green-600 dark:text-green-400' :
                          Number(percentLeft) > 20 ? 'text-amber-600 dark:text-amber-400' :
                          'text-red-600 dark:text-red-400'
                        }">
                          {percentLeft}%
                        </span>
                      </div>
                    </td>

                    <!-- Cost (Editable) -->
                    <td class="px-4 py-3 text-sm">
                      {#if isEditing}
                        <div class="flex items-center gap-1">
                          <span class="text-zinc-500">$</span>
                          <input
                            type="number"
                            bind:value={editForm.cost}
                            min="0"
                            step="0.01"
                            class="w-16 bg-white dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-md px-2 py-1 text-zinc-900 dark:text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                          />
                        </div>
                      {:else if spool.cost}
                        <span class="text-green-600 dark:text-green-400">${spool.cost.toFixed(2)}</span>
                      {:else}
                        <span class="text-zinc-500">-</span>
                      {/if}
                    </td>

                    <!-- Status -->
                    <td class="px-4 py-3 text-sm">
                      {#if isLoaded}
                        <span class="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-1 rounded-sm text-xs">
                          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                          </svg>
                          Loaded
                        </span>
                        <p class="text-xs text-zinc-500 mt-1">{loadedPrinter?.name}</p>
                      {:else if spool.remaining_weight <= 0}
                        <span class="inline-flex items-center gap-1 text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-sm text-xs">
                          Empty
                        </span>
                      {:else}
                        <span class="inline-flex items-center gap-1 text-zinc-500 text-xs">
                          Available
                        </span>
                      {/if}
                    </td>

                    <!-- Actions (Edit/Delete or Save/Cancel) -->
                    <td class="px-4 py-3 text-sm">
                      {#if isEditing}
                        <div class="flex items-center gap-2">
                          <form
                            method="POST"
                            action="?/updateSpool"
                            use:enhance={() => {
                              return async ({ result }) => {
                                if (result.type === 'success') {
                                  cancelEdit();
                                  window.location.reload();
                                }
                              };
                            }}
                          >
                            <input type="hidden" name="spoolId" value={spool.id} />
                            <input type="hidden" name="brand" value={editForm.brand} />
                            <input type="hidden" name="material" value={editForm.material} />
                            <input type="hidden" name="color" value={editForm.color} />
                            <input type="hidden" name="remaining_weight" value={editForm.remaining_weight} />
                            <input type="hidden" name="cost" value={editForm.cost} />
                            <button
                              type="submit"
                              class="text-green-600 dark:text-green-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                              title="Save changes"
                            >
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          </form>
                          <button
                            on:click|stopPropagation={cancelEdit}
                            class="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                            title="Cancel"
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      {:else}
                        <div class="flex items-center gap-2">
                          <button
                            on:click|stopPropagation={() => startEdit(spool)}
                            class="text-blue-600 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title="Edit spool"
                            disabled={isLoaded}
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <form
                            method="POST"
                            action="?/deleteSpool"
                            use:enhance={() => {
                              return async ({ result, update }) => {
                                if (result.type === 'success') {
                                  await update();
                                }
                              };
                            }}
                          >
                            <input type="hidden" name="spoolId" value={spool.id} />
                            <button
                              type="submit"
                              on:click|stopPropagation={(e) => {
                                if (!confirm(`Delete spool #${spool.id} (${spool.brand} ${spool.material})?`)) {
                                  e.preventDefault();
                                }
                              }}
                              disabled={isLoaded}
                              class="text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title={isLoaded ? 'Cannot delete loaded spool' : 'Delete spool'}
                            >
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </form>
                        </div>
                      {/if}
                    </td>
                  </tr>
                {/each}
              {:else}
                <tr>
                  <td colspan="11" class="px-4 py-8 text-center text-zinc-500">
                    No spools found
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- ── Farm Utilization + Failure Analysis ────────────────────────────── -->
    {#if currentUtil || currentFailures}
      <div class="grid grid-cols-2 gap-6 mb-8">
        <!-- Farm Utilization Score -->
        {#if currentUtil}
          <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-6 flex flex-col">
            <div class="flex items-center justify-between mb-5">
              <p class="text-xs font-medium text-zinc-400 dark:text-zinc-600 tracking-wide uppercase">Farm Utilization</p>
            </div>
            <div class="flex items-center gap-6 mb-1">
              <div>
                <div class="flex items-end gap-1">
                  <p class="text-5xl font-light tabular-nums text-zinc-900 dark:text-zinc-50 leading-none">
                    {currentUtil.farmUtilizationPct.toFixed(1)}
                  </p>
                  <span class="text-xl text-zinc-400 dark:text-zinc-600 mb-0.5">%</span>
                </div>
                <p class="text-xs text-zinc-400 dark:text-zinc-600 mt-1">of available time used for printing</p>
              </div>
              <div bind:this={utilizationPieChartEl} class="ml-auto" style="width: 120px; height: 120px;"></div>
            </div>
            <!-- Hours breakdown -->
            <div class="flex gap-6 border-t border-zinc-200 dark:border-[#262626] pt-4 mt-5">
              <div>
                <p class="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-0.5">Successful</p>
                <p class="text-lg font-light text-emerald-500 tabular-nums">{currentUtil.totalSuccessHrs}h</p>
              </div>
              <div>
                <p class="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-0.5">Failed</p>
                <p class="text-lg font-light text-red-400 tabular-nums">{currentUtil.totalFailedHrs}h</p>
              </div>
              <div>
                <p class="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-0.5">Idle</p>
                <p class="text-lg font-light text-zinc-400 tabular-nums">{currentUtil.totalIdleHrs}h</p>
              </div>
              <div class="ml-auto text-right">
                {#if currentUtil.growthPotential.additionalPrintsPerDay > 0}
                  <p class="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-0.5">Growth Potential</p>
                  <p class="text-lg font-light text-emerald-500 tabular-nums">+{currentUtil.growthPotential.additionalPrintsPerDay} <span class="text-xs text-zinc-400">prints/day</span></p>
                {:else}
                  <p class="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-0.5">Status</p>
                  <p class="text-sm font-medium text-blue-500">At {currentUtil.growthPotential.targetPct}% target</p>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        <!-- Failure Analysis Score -->
        {#if currentFailures}
          <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-6 flex flex-col">
            <p class="text-xs font-medium text-zinc-400 dark:text-zinc-600 tracking-wide uppercase mb-5">Failure Analysis</p>
            <div class="flex items-end gap-1 mb-1">
              <p class="text-5xl font-light tabular-nums leading-none {currentFailures.failureRate > 15 ? 'text-red-500' : currentFailures.failureRate > 8 ? 'text-amber-500' : 'text-emerald-500'}">
                {currentFailures.failureRate}
              </p>
              <span class="text-xl text-zinc-400 dark:text-zinc-600 mb-0.5">%</span>
            </div>
            <p class="text-xs text-zinc-400 dark:text-zinc-600 mb-5">
              {currentFailures.totalFailed} failed of {currentFailures.totalCompleted} completed prints
            </p>
            <!-- Waste breakdown -->
            <div class="flex gap-6 border-t border-zinc-200 dark:border-[#262626] pt-4 mt-auto">
              <div>
                <p class="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-0.5">Wasted Material</p>
                <p class="text-lg font-light text-red-400 tabular-nums">{currentFailures.wastedMaterial}g</p>
              </div>
              <div>
                <p class="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-0.5">Wasted Cost</p>
                <p class="text-lg font-light text-red-400 tabular-nums">${currentFailures.wastedCost.toFixed(2)}</p>
              </div>
              {#if currentFailures.byReason.length > 0}
                <div class="ml-auto text-right">
                  <p class="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-0.5">Top Reason</p>
                  <p class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{currentFailures.byReason[0].reason}</p>
                  <p class="text-xs text-zinc-400">{currentFailures.byReason[0].count} prints ({currentFailures.byReason[0].pct}%)</p>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- ── Failure Deep Dive ────────────────────────────────────────────────── -->
    {#if currentFailures && currentFailures.totalFailed > 0}
      <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg mb-8 overflow-hidden">
        <div class="p-6 border-b border-zinc-200 dark:border-[#262626]">
          <h2 class="text-xl font-medium">Failure Deep Dive</h2>
          <p class="text-sm text-zinc-500 mt-1">Patterns and correlations in print failures</p>
        </div>

        <div class="p-6">
          <div class="grid grid-cols-2 gap-8">
            <!-- Left: Failure Reasons Breakdown -->
            <div>
              <h3 class="text-xs font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-4">Failure Reasons</h3>
              <div class="space-y-2.5">
                {#each currentFailures.byReason as item}
                  <div class="flex items-center gap-3">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">{item.reason}</span>
                        <span class="text-xs text-zinc-500 ml-2 shrink-0">{item.count} ({item.pct}%)</span>
                      </div>
                      <div class="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-red-500/80 rounded-full transition-all duration-500"
                          style="width: {item.pct}%"
                        ></div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Right: Failure Rate by Printer -->
            <div>
              <h3 class="text-xs font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-4">Failure Rate by Printer</h3>
              <div class="space-y-2.5">
                {#each currentFailures.byPrinter as printer}
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{printer.name}</span>
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-zinc-500">{printer.failed}/{printer.total}</span>
                        <span class="text-xs font-medium tabular-nums {printer.failureRate > 15 ? 'text-red-500' : printer.failureRate > 8 ? 'text-amber-500' : 'text-emerald-500'}">{printer.failureRate}%</span>
                      </div>
                    </div>
                    <div class="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden flex">
                      <div
                        class="h-full bg-emerald-500/70 transition-all duration-500"
                        style="width: {printer.total > 0 ? ((printer.total - printer.failed) / printer.total) * 100 : 0}%"
                      ></div>
                      <div
                        class="h-full bg-red-500/70 transition-all duration-500"
                        style="width: {printer.total > 0 ? (printer.failed / printer.total) * 100 : 0}%"
                      ></div>
                    </div>
                    {#if printer.topReason}
                      <p class="text-[10px] text-zinc-400 mt-0.5">Top: {printer.topReason}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          </div>

          <!-- Problematic Modules (full width below) -->
          {#if currentFailures.byModule.filter((m: any) => m.failed > 0).length > 0}
            <div class="mt-8 pt-6 border-t border-zinc-200 dark:border-[#262626]">
              <h3 class="text-xs font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-4">Module Failure Rates</h3>
              <div class="overflow-hidden rounded-lg border border-zinc-200 dark:border-[#262626]">
                <table class="w-full">
                  <thead>
                    <tr class="bg-zinc-100 dark:bg-zinc-800">
                      <th class="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Module</th>
                      <th class="px-4 py-2.5 text-right text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Total</th>
                      <th class="px-4 py-2.5 text-right text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Failed</th>
                      <th class="px-4 py-2.5 text-right text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Rate</th>
                      <th class="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider w-48">Distribution</th>
                      <th class="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Top Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each currentFailures.byModule.filter((m: any) => m.failed > 0) as mod}
                      <tr class="border-t border-zinc-200 dark:border-[#262626]">
                        <td class="px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 max-w-48 truncate">{mod.name}</td>
                        <td class="px-4 py-2.5 text-sm text-zinc-500 text-right tabular-nums">{mod.total}</td>
                        <td class="px-4 py-2.5 text-sm text-red-500 text-right tabular-nums font-medium">{mod.failed}</td>
                        <td class="px-4 py-2.5 text-right">
                          <span class="text-sm font-medium tabular-nums {mod.failureRate > 20 ? 'text-red-500' : mod.failureRate > 10 ? 'text-amber-500' : 'text-zinc-500'}">{mod.failureRate}%</span>
                        </td>
                        <td class="px-4 py-2.5">
                          <div class="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden flex">
                            <div class="h-full bg-emerald-500/70" style="width: {((mod.total - mod.failed) / mod.total) * 100}%"></div>
                            <div class="h-full bg-red-500/70" style="width: {(mod.failed / mod.total) * 100}%"></div>
                          </div>
                        </td>
                        <td class="px-4 py-2.5 text-xs text-zinc-400">{mod.topReason || '—'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <ModuleBreakdown
      breakdown={currentBreakdown}
      totalPrints={totalPrintsInRange}
      totalObjects={totalObjectsInRange}
    />
    <!-- Charts Grid -->
    <div class="grid grid-cols-2 gap-6 mb-6">
      <!-- Print History Line Chart -->
      <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-6">
        <div bind:this={printHistoryChart} style="width: 100%; height: 400px;"></div>
      </div>

      <!-- Material Usage Chart -->
      <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-6">
        <div bind:this={materialUsageChart} style="width: 100%; height: 400px;"></div>
      </div>

	</div>
    <!-- Inventory & Sales Section -->
    {#if data.inventoryStats || data.shopifyStats}
      <!-- Inventory Health Overview -->
      

      <!-- Production vs Sales Chart + Shopify Orders Chart -->
      <div class="grid grid-cols-2 gap-6 mb-8">
        {#if data.inventoryStats?.dailyStockFlow}
          <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-6">
            <div bind:this={stockFlowChart} style="width: 100%; height: 400px;"></div>
          </div>
        {/if}
        {#if data.shopifyStats?.dailyOrders}
          <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg p-6">
            <div bind:this={shopifyOrdersChart} style="width: 100%; height: 400px;"></div>
          </div>
        {/if}
      </div>

      <!-- Shopify Summary -->
      {#if data.shopifyStats}
        <div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg mb-8 overflow-hidden">
          <div class="p-6 border-b border-zinc-200 dark:border-[#262626]">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-xl font-medium">Shopify Sales</h2>
                <p class="text-sm text-zinc-500 mt-1">Order history and sync status</p>
              </div>
              {#if data.shopifyStats.syncState}
                <div class="text-right text-xs text-zinc-500">
                  <p>Last sync: {data.shopifyStats.syncState.last_sync_at ? new Date(data.shopifyStats.syncState.last_sync_at).toLocaleString() : 'Never'}</p>
                  <p>{data.shopifyStats.syncState.orders_processed} orders processed / {data.shopifyStats.syncState.items_deducted} items deducted</p>
                </div>
              {/if}
            </div>
          </div>

          <div class="p-6">
            <!-- Shopify Summary Cards -->
            <div class="grid grid-cols-4 gap-4 mb-6">
              <div class="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-[#262626]">
                <p class="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Total Orders</p>
                <p class="text-3xl font-medium text-purple-400">{data.shopifyStats.totalOrders}</p>
              </div>
              <div class="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-[#262626]">
                <p class="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Total Items Sold</p>
                <p class="text-3xl font-medium text-rose-400">{data.shopifyStats.totalItems}</p>
              </div>
              <div class="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-[#262626]">
                <p class="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">First Order</p>
                <p class="text-lg font-medium text-zinc-700 dark:text-zinc-300">
                  {data.shopifyStats.firstOrder ? new Date(data.shopifyStats.firstOrder).toLocaleDateString() : '-'}
                </p>
              </div>
              <div class="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-[#262626]">
                <p class="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Latest Order</p>
                <p class="text-lg font-medium text-zinc-700 dark:text-zinc-300">
                  {data.shopifyStats.lastOrder ? new Date(data.shopifyStats.lastOrder).toLocaleDateString() : '-'}
                </p>
              </div>
            </div>

            <!-- Recent Orders Table -->
            {#if data.shopifyStats.recentOrders.length > 0}
              <div class="border border-zinc-200 dark:border-[#262626] rounded-lg overflow-hidden">
                <table class="w-full">
                  <thead class="bg-zinc-100 dark:bg-zinc-800">
                    <tr>
                      <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Order #</th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Date</th>
                      <th class="px-4 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Items</th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each data.shopifyStats.recentOrders as order}
                      <tr class="border-t border-zinc-200 dark:border-[#262626] hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td class="px-4 py-2.5 text-sm font-mono text-zinc-900 dark:text-zinc-50">#{order.shopify_order_number}</td>
                        <td class="px-4 py-2.5 text-sm text-zinc-500">{new Date(order.processed_at).toLocaleString()}</td>
                        <td class="px-4 py-2.5 text-sm text-right font-medium text-zinc-700 dark:text-zinc-300">{order.total_items}</td>
                        <td class="px-4 py-2.5 text-sm">
                          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400">{order.status}</span>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {:else}
              <p class="text-center text-zinc-500 py-8">No Shopify orders found</p>
            {/if}
          </div>
        </div>
      {/if}
    {/if}

    
  </div>
</div>

<style>
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-fade-in {
    animation: fade-in 0.3s ease-out;
  }
</style>
