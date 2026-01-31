<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import * as echarts from 'echarts';
  
  export let data: PageData;
  
  // Type definitions for breakdown data structures
  type TimeRange = 'last30Days' | 'thisMonth' | 'last90Days';
  
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
  let successRateChart: HTMLDivElement;
  let topModulesChart: HTMLDivElement;
  let failureReasonsChart: HTMLDivElement;
  let printerUtilizationChart: HTMLDivElement;
  
  // Toggle states
  let showSpools = false;
  let showPrintHistory = false;
  let selectedTimeRange: TimeRange = 'last30Days';
  
  // Expansion state - simple objects with direct updates (no async/debounce)
  let expandedCategories: Record<string, boolean> = {};
  let expandedSubcategories: Record<string, boolean> = {};
  let expandedModules: Record<string, boolean> = {};
  
  // Edit spool state
  let editingSpoolId: number | null = null;
  let editForm = {
    brand: '',
    material: '',
    color: '',
    remaining_weight: 0,
    cost: 0
  };
  
  // Reactive statements with proper typing
  $: sortedSpools = [...(data.spools || [])].sort((a, b) => b.id - a.id);
  $: currentBreakdown = (data.stats.moduleBreakdown?.[selectedTimeRange] || {}) as Record<string, CategoryData>;
  $: currentSets = data.stats.setCosts?.[selectedTimeRange] || {};
  $: totalPrintsInRange = Object.values(currentBreakdown).reduce((sum, cat) => sum + (cat?.total || 0), 0);
  $: totalObjectsInRange = Object.values(currentBreakdown).reduce((sum, cat) => sum + (cat?.totalObjects || 0), 0);
  
  function getTimeRangeLabel(range: TimeRange): string {
    switch(range) {
      case 'last30Days': return 'Last 30 Days';
      case 'thisMonth': return 'This Month';
      case 'last90Days': return 'Last 90 Days';
    }
  }
  
  // ✅ SIMPLIFIED: Direct synchronous toggle - no async, no flags, no race conditions
  function toggleCategory(categoryName: string) {
    if (expandedCategories[categoryName]) {
      // Collapse: remove this category and all its children
      const newExpanded = { ...expandedCategories };
      delete newExpanded[categoryName];
      expandedCategories = newExpanded;
      
      // Clean up children (subcategories and modules under this category)
      const newSubcategories = { ...expandedSubcategories };
      const newModules = { ...expandedModules };
      
      Object.keys(newSubcategories).forEach(key => {
        if (key.startsWith(`${categoryName}:`)) {
          delete newSubcategories[key];
        }
      });
      Object.keys(newModules).forEach(key => {
        if (key.startsWith(`${categoryName}:`)) {
          delete newModules[key];
        }
      });
      
      expandedSubcategories = newSubcategories;
      expandedModules = newModules;
    } else {
      // Expand this category
      expandedCategories = { ...expandedCategories, [categoryName]: true };
    }
  }
  
  function toggleSubcategory(categoryName: string, subcategoryName: string) {
    const key = `${categoryName}:${subcategoryName}`;
    
    if (expandedSubcategories[key]) {
      // Collapse: remove this subcategory and its module children
      const newSubcategories = { ...expandedSubcategories };
      delete newSubcategories[key];
      expandedSubcategories = newSubcategories;
      
      // Clean up modules under this subcategory
      const newModules = { ...expandedModules };
      Object.keys(newModules).forEach(moduleKey => {
        if (moduleKey.startsWith(`${key}:`)) {
          delete newModules[moduleKey];
        }
      });
      expandedModules = newModules;
    } else {
      // Expand this subcategory
      expandedSubcategories = { ...expandedSubcategories, [key]: true };
    }
  }
  
  function toggleModule(parentKey: string, moduleName: string) {
    const key = `${parentKey}:${moduleName}`;
    
    if (expandedModules[key]) {
      const newModules = { ...expandedModules };
      delete newModules[key];
      expandedModules = newModules;
    } else {
      expandedModules = { ...expandedModules, [key]: true };
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
    // Print History Line Chart
    const historyChart = echarts.init(printHistoryChart, 'dark');
    historyChart.setOption({
      title: {
        text: 'Print History (Last 30 Days)',
        textStyle: { color: '#fff' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderColor: '#334155'
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
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8' }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: '#334155' } }
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
    const materialChart = echarts.init(materialUsageChart, 'dark');
    materialChart.setOption({
      title: {
        text: 'Material Usage (Last 30 Days)',
        textStyle: { color: '#fff' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderColor: '#334155',
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
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8' }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8', formatter: '{value}g' },
        splitLine: { lineStyle: { color: '#334155' } }
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
    
    // Success Rate Pie Chart
    const successChart = echarts.init(successRateChart, 'dark');
    successChart.setOption({
      title: {
        text: 'Print Success Rate',
        textStyle: { color: '#fff' }
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderColor: '#334155',
        formatter: '{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        right: '10%',
        top: 'center',
        textStyle: { color: '#94a3b8' }
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        data: [
          { value: data.stats.successfulPrints, name: 'Successful', itemStyle: { color: '#22c55e' } },
          { value: data.stats.failedPrints, name: 'Failed', itemStyle: { color: '#ef4444' } }
        ],
        label: {
          show: true,
          formatter: '{b}: {d}%',
          color: '#fff'
        }
      }]
    });
    
    // Top Modules Bar Chart
    const modulesChart = echarts.init(topModulesChart, 'dark');
    modulesChart.setOption({
      title: {
        text: 'Top 10 Printed Modules',
        textStyle: { color: '#fff' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderColor: '#334155',
        axisPointer: { type: 'shadow' }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: '#334155' } }
      },
      yAxis: {
        type: 'category',
        data: data.stats.topModules.map(m => m.name).reverse(),
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8' }
      },
      series: [{
        type: 'bar',
        data: data.stats.topModules.map(m => m.value).reverse(),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#f59e0b' },
            { offset: 1, color: '#fb923c' }
          ])
        }
      }]
    });
    
    // Failure Reasons Pie Chart
    let failureChart: echarts.ECharts | undefined;
    if (data.stats.failureReasons.length > 0) {
      failureChart = echarts.init(failureReasonsChart, 'dark');
      failureChart.setOption({
        title: {
          text: 'Failure Reasons',
          textStyle: { color: '#fff' }
        },
        tooltip: {
          trigger: 'item',
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderColor: '#334155',
          formatter: '{b}: {c} ({d}%)'
        },
        series: [{
          type: 'pie',
          radius: '60%',
          data: data.stats.failureReasons,
          label: {
            show: true,
            formatter: '{b}: {d}%',
            color: '#fff'
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }]
      });
    }
    
    // Printer Utilization Chart
    const utilizationChart = echarts.init(printerUtilizationChart, 'dark');
    utilizationChart.setOption({
      title: {
        text: 'Printer Utilization (Total Hours)',
        textStyle: { color: '#fff' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderColor: '#334155',
        formatter: '{b}: {c}h'
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: data.stats.printerUtilization.map(p => p.name),
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8', rotate: 45 }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8', formatter: '{value}h' },
        splitLine: { lineStyle: { color: '#334155' } }
      },
      series: [{
        type: 'bar',
        data: data.stats.printerUtilization.map(p => p.value),
        itemStyle: { color: '#06b6d4' }
      }]
    });
    
    // Resize charts on window resize
    const handleResize = () => {
      historyChart.resize();
      materialChart.resize();
      successChart.resize();
      modulesChart.resize();
      failureChart?.resize();
      utilizationChart.resize();
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup when component unmounts
    return () => {
      window.removeEventListener('resize', handleResize);
      historyChart.dispose();
      materialChart.dispose();
      successChart.dispose();
      modulesChart.dispose();
      failureChart?.dispose();
      utilizationChart.dispose();
    };
  });
</script>

<div class="min-h-screen bg-black text-white p-6">
  <div class="max-w-7xl mx-auto">
    <!-- Header - Use dedicated function and higher z-index -->
    <div class="flex justify-between items-center mb-8 relative z-50">
      <h1 class="text-3xl font-light">Statistics & Analytics</h1>
      <button 
        on:click={navigateToDashboard}
        class="text-slate-400 hover:text-white transition-colors cursor-pointer pointer-events-auto"
      >
        ← Back to Dashboard
      </button>
    </div>
    
    <!-- Key Metrics Cards -->
    <div class="grid grid-cols-5 gap-4 mb-8">
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <p class="text-slate-400 text-sm mb-1">Total Prints</p>
        <p class="text-3xl font-bold text-white">{data.stats.totalPrints}</p>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <p class="text-slate-400 text-sm mb-1">Success Rate</p>
        <p class="text-3xl font-bold text-green-400">
          {data.stats.totalPrints > 0 ? ((data.stats.successfulPrints / data.stats.totalPrints) * 100).toFixed(1) : 0}%
        </p>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <p class="text-slate-400 text-sm mb-1">Material Used</p>
        <p class="text-3xl font-bold text-blue-400">{data.stats.totalMaterialUsed}g</p>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <p class="text-slate-400 text-sm mb-1">Total Runtime</p>
        <p class="text-3xl font-bold text-purple-400">{data.stats.totalHours.toFixed(1)}h</p>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <p class="text-slate-400 text-sm mb-1">Active Printers</p>
        <p class="text-3xl font-bold text-cyan-400">{data.printers.length}</p>
      </div>
    </div>
    
    <!-- Toggle Buttons Row -->
    <div class="flex gap-3 mb-6">
      <button
        on:click|stopPropagation={() => showPrintHistory = !showPrintHistory}
        class="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg px-4 py-2.5 transition-colors"
      >
        <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span class="text-white font-medium">
          {showPrintHistory ? 'Hide' : 'Show'} Print History
        </span>
        <span class="text-slate-400 text-sm">({data.printJobs.length})</span>
        <svg 
          class="w-4 h-4 text-slate-400 transition-transform duration-200 {showPrintHistory ? 'rotate-180' : ''}" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      <button
        on:click|stopPropagation={() => showSpools = !showSpools}
        class="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg px-4 py-2.5 transition-colors"
      >
        <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <span class="text-white font-medium">
          {showSpools ? 'Hide' : 'Show'} All Spools
        </span>
        <span class="text-slate-400 text-sm">({data.spools?.length || 0})</span>
        <svg 
          class="w-4 h-4 text-slate-400 transition-transform duration-200 {showSpools ? 'rotate-180' : ''}" 
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
      <div class="bg-slate-900 border border-slate-800 rounded-xl mb-8 overflow-hidden animate-fade-in">
        <div class="p-6 border-b border-slate-800">
          <h2 class="text-xl font-medium">Print History</h2>
          <p class="text-sm text-slate-400 mt-1">{data.printJobs.length} total jobs</p>
        </div>
        <div class="overflow-x-auto max-h-96 overflow-y-auto">
          <table class="w-full">
            <thead class="bg-slate-800 sticky top-0">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Date</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Module</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Printer</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Material</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Status</th>
              </tr>
            </thead>
            <tbody>
              {#each data.printJobs as job}
                {@const printer = data.printers.find(p => p.id === job.printer_id)}
                <tr class="border-t border-slate-800 hover:bg-slate-800/50 transition-colors">
                  <td class="px-4 py-3 text-sm text-slate-400">
                    {formatDate(job.start_time)}
                  </td>
                  <td class="px-4 py-3 text-sm text-white font-medium">
                    {job.name || 'Unknown'}
                  </td>
                  <td class="px-4 py-3 text-sm text-slate-400">
                    {printer?.name || 'Unknown'}
                  </td>
                  <td class="px-4 py-3 text-sm text-slate-400">
                    {job.actual_weight || job.planned_weight}g
                  </td>
                  <td class="px-4 py-3 text-sm">
                    {#if job.status === 'printing'}
                      <span class="inline-flex items-center gap-1 text-blue-400">
                        <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        In Progress
                      </span>
                    {:else if job.status === 'success'}
                      <span class="inline-flex items-center gap-1 text-green-400">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                        Success
                      </span>
                    {:else if job.status === 'failed'}
                      <div>
                        <span class="inline-flex items-center gap-1 text-red-400">
                          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                          </svg>
                          Failed
                        </span>
                        {#if job.failure_reason}
                          <p class="text-xs text-slate-500 mt-1">{job.failure_reason}</p>
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
      <div class="bg-slate-900 border border-slate-800 rounded-xl mb-8 overflow-hidden animate-fade-in">
        <div class="p-6 border-b border-slate-800">
          <h2 class="text-xl font-medium">All Spools</h2>
          <p class="text-sm text-slate-400 mt-1">{sortedSpools.length} total spools (newest first)</p>
        </div>
        <div class="overflow-x-auto max-h-96 overflow-y-auto">
          <table class="w-full">
            <thead class="bg-slate-800 sticky top-0 z-10">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">ID</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Brand</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Material</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Color</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Initial</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Remaining</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Used</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">% Left</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Cost</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Status</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Actions</th>
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
                  
                  <tr class="border-t border-slate-800 hover:bg-slate-800/50 transition-colors">
                    <!-- ID -->
                    <td class="px-4 py-3 text-sm text-slate-400 font-mono">
                      #{spool.id}
                    </td>
                    
                    <!-- Brand (Editable) -->
                    <td class="px-4 py-3 text-sm">
                      {#if isEditing}
                        <input
                          type="text"
                          bind:value={editForm.brand}
                          class="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                        />
                      {:else}
                        <span class="text-white font-medium">{spool.brand}</span>
                      {/if}
                    </td>
                    
                    <!-- Material (Editable) -->
                    <td class="px-4 py-3 text-sm">
                      {#if isEditing}
                        <input
                          type="text"
                          bind:value={editForm.material}
                          class="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                        />
                      {:else}
                        <span class="text-slate-300">{spool.material}</span>
                      {/if}
                    </td>
                    
                    <!-- Color (Editable) -->
                    <td class="px-4 py-3 text-sm">
                      {#if isEditing}
                        <input
                          type="text"
                          bind:value={editForm.color}
                          placeholder="Color"
                          class="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                        />
                      {:else if spool.color}
                        <span class="inline-flex items-center gap-2">
                          <span class="w-3 h-3 rounded-full border border-slate-600" style="background-color: {spool.color.toLowerCase()}"></span>
                          {spool.color}
                        </span>
                      {:else}
                        <span class="text-slate-500">-</span>
                      {/if}
                    </td>
                    
                    <!-- Initial Weight (Read-only) -->
                    <td class="px-4 py-3 text-sm text-slate-400">
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
                          class="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                        />
                        <span class="text-slate-500 text-xs ml-1">g</span>
                      {:else}
                        <span class="text-white font-medium">{spool.remaining_weight}g</span>
                      {/if}
                    </td>
                    
                    <!-- Used Weight -->
                    <td class="px-4 py-3 text-sm text-slate-400">
                      {usedWeight}g
                    </td>
                    
                    <!-- Percentage Bar -->
                    <td class="px-4 py-3 text-sm">
                      <div class="flex items-center gap-2">
                        <div class="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
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
                          Number(percentLeft) > 50 ? 'text-green-400' : 
                          Number(percentLeft) > 20 ? 'text-yellow-400' : 
                          'text-red-400'
                        }">
                          {percentLeft}%
                        </span>
                      </div>
                    </td>
                    
                    <!-- Cost (Editable) -->
                    <td class="px-4 py-3 text-sm">
                      {#if isEditing}
                        <div class="flex items-center gap-1">
                          <span class="text-slate-500">$</span>
                          <input
                            type="number"
                            bind:value={editForm.cost}
                            min="0"
                            step="0.01"
                            class="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                          />
                        </div>
                      {:else if spool.cost}
                        <span class="text-green-400">${spool.cost.toFixed(2)}</span>
                      {:else}
                        <span class="text-slate-500">-</span>
                      {/if}
                    </td>
                    
                    <!-- Status -->
                    <td class="px-4 py-3 text-sm">
                      {#if isLoaded}
                        <span class="inline-flex items-center gap-1 text-blue-400 bg-blue-500/10 px-2 py-1 rounded text-xs">
                          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                          </svg>
                          Loaded
                        </span>
                        <p class="text-xs text-slate-500 mt-1">{loadedPrinter?.name}</p>
                      {:else if spool.remaining_weight <= 0}
                        <span class="inline-flex items-center gap-1 text-slate-500 bg-slate-800 px-2 py-1 rounded text-xs">
                          Empty
                        </span>
                      {:else}
                        <span class="inline-flex items-center gap-1 text-slate-400 text-xs">
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
                              class="text-green-400 hover:text-green-300 transition-colors"
                              title="Save changes"
                            >
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          </form>
                          <button
                            on:click|stopPropagation={cancelEdit}
                            class="text-slate-400 hover:text-white transition-colors"
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
                            class="text-blue-400 hover:text-blue-300 transition-colors"
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
                              class="text-red-400 hover:text-red-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                  <td colspan="11" class="px-4 py-8 text-center text-slate-500">
                    No spools found
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
    
    <!-- ✅ UPDATED: Module Production Breakdown Section -->
    <div class="bg-slate-900 border border-slate-800 rounded-xl mb-8 overflow-hidden">
      <div class="p-6 border-b border-slate-800">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-medium">Module Production Breakdown</h2>
            <p class="text-sm text-slate-400 mt-1">Detailed cost and production analysis by category</p>
          </div>
          
          <!-- Time Range Selector -->
          <div class="flex gap-2 bg-slate-800 rounded-lg p-1">
            {#each ['last30Days', 'thisMonth', 'last90Days'] as range}
              <button
                on:click|stopPropagation={() => selectedTimeRange = range as TimeRange}
                class="px-4 py-2 rounded-md text-sm font-medium transition-all
                       {selectedTimeRange === range 
                         ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' 
                         : 'text-slate-400 hover:text-white'}"
              >
                {getTimeRangeLabel(range as TimeRange)}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <div class="p-6">
        <!-- Total Count Header -->
        <div class="mb-6 grid grid-cols-4 gap-4">
          <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <p class="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Total Prints</p>
            <p class="text-3xl font-bold text-white">{totalPrintsInRange}</p>
          </div>
          <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <p class="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Total Objects</p>
            <p class="text-3xl font-bold text-purple-400">{totalObjectsInRange}</p>
          </div>
          <!-- ✅ NEW: Total Weight -->
          <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <p class="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Total Weight</p>
            <p class="text-3xl font-bold text-blue-400">
              {(Object.values(currentBreakdown).reduce((sum: number, cat: any) => sum + (cat.totalWeight || 0), 0) / 1000).toFixed(2)}kg
            </p>
          </div>
          <!-- ✅ NEW: Total Cost -->
          <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <p class="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Total Cost</p>
            <p class="text-3xl font-bold text-green-400">
              ${Object.values(currentBreakdown).reduce((sum: number, cat: any) => sum + (cat.totalCost || 0), 0).toFixed(2)}
            </p>
          </div>
        </div>

        <!-- Category Drill-Down List -->
        {#if Object.keys(currentBreakdown).length > 0}
          <div class="space-y-3">
            {#each Object.entries(currentBreakdown).sort(([,a], [,b]) => b.total - a.total) as [categoryName, categoryData]}
              {@const isCategoryExpanded = !!expandedCategories[categoryName]}
              {@const categoryPercentage = ((categoryData.total / totalPrintsInRange) * 100).toFixed(1)}
              {@const hasSubcategories = Object.keys(categoryData.subcategories || {}).length > 0}
              
              <!-- Level 1: Category -->
              <div class="border border-slate-700 rounded-lg overflow-hidden hover:border-slate-600 transition-colors">
                <button
                  on:click|stopPropagation={() => toggleCategory(categoryName)}
                  class="w-full px-5 py-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
                >
                  <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <svg 
                        class="w-5 h-5 text-blue-400 transition-transform duration-200 {isCategoryExpanded ? 'rotate-90' : ''}" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <div class="text-left">
                      <h3 class="text-lg font-semibold text-white">{categoryName}</h3>
                      <p class="text-xs text-slate-500 mt-0.5">{categoryData.total} prints • {categoryData.totalObjects} objects</p>
                    </div>
                  </div>
                  
                  <div class="flex items-center gap-6">
                    <!-- Progress Bar -->
                    <div class="flex items-center gap-3">
                      <div class="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          class="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                          style="width: {categoryPercentage}%"
                        ></div>
                      </div>
                      <span class="text-sm font-medium text-slate-400 w-12 text-right">{categoryPercentage}%</span>
                    </div>
                    
                    <!-- ✅ UPDATED: Weight + Cost Info (Weight more dominant) -->
                    <div class="text-right min-w-[160px]">
                      <p class="text-2xl font-bold text-blue-400">
                        {(categoryData.totalWeight / 1000).toFixed(2)}kg
                      </p>
                      <p class="text-sm text-green-400 mt-0.5">
                        ${categoryData.totalCost.toFixed(2)}
                      </p>
                      {#if categoryData.wastedCost > 0}
                        <p class="text-xs text-red-400 mt-0.5">
                          -{(categoryData.wastedWeight / 1000).toFixed(2)}kg waste
                        </p>
                      {/if}
                    </div>
                  </div>
                </button>

                {#if isCategoryExpanded}
                  <div class="bg-slate-900/50 border-t border-slate-700">
                    
                    <!-- ✅ Level 2: Subcategories -->
                    {#if hasSubcategories}
                      <div class="p-4 space-y-2">
                        {#each Object.entries(categoryData.subcategories).sort(([,a], [,b]) => b.total - a.total) as [subcategoryName, subcategoryData]}
                          {@const subcategoryKey = `${categoryName}:${subcategoryName}`}
                          {@const isSubcategoryExpanded = !!expandedSubcategories[subcategoryKey]}
                          {@const subcategoryPercentage = ((subcategoryData.total / categoryData.total) * 100).toFixed(1)}
                          
                          <div class="border border-slate-700/50 rounded-lg overflow-hidden">
                            <button
                              on:click|stopPropagation={() => toggleSubcategory(categoryName, subcategoryName)}
                              class="w-full px-4 py-3 flex items-center justify-between bg-slate-800/20 hover:bg-slate-800/40 transition-colors"
                            >
                              <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-md bg-indigo-500/10 flex items-center justify-center">
                                  <svg 
                                    class="w-4 h-4 text-indigo-400 transition-transform duration-200 {isSubcategoryExpanded ? 'rotate-90' : ''}" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                  >
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                                <div class="text-left">
                                  <h4 class="text-sm font-semibold text-slate-200">{subcategoryName}</h4>
                                  <p class="text-xs text-slate-500">{subcategoryData.total} prints • {subcategoryData.totalObjects} objects</p>
                                </div>
                              </div>
                              
                              <!-- ✅ UPDATED: Weight + Cost for subcategory -->
                              <div class="flex items-center gap-4">
                                <div class="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                  <div 
                                    class="h-full bg-indigo-400 transition-all duration-500"
                                    style="width: {subcategoryPercentage}%"
                                  ></div>
                                </div>
                                <span class="text-xs font-medium text-slate-500 w-10 text-right">{subcategoryPercentage}%</span>
                                <div class="text-right min-w-[100px]">
                                  <span class="text-base font-bold text-blue-400">{(subcategoryData.totalWeight / 1000).toFixed(2)}kg</span>
                                  <p class="text-xs text-green-400">${subcategoryData.totalCost.toFixed(2)}</p>
                                </div>
                              </div>
                            </button>

                            <!-- Level 3: Modules under Subcategory -->
                            {#if isSubcategoryExpanded}
                              <div class="bg-slate-900/30 border-t border-slate-700/50 p-3 space-y-1.5">
                                {#each Object.entries(subcategoryData.modules).sort(([,a], [,b]) => b.total - a.total) as [moduleName, moduleData]}
                                  {@const moduleKey = `${subcategoryKey}:${moduleName}`}
                                  {@const isModuleExpanded = !!expandedModules[moduleKey]}
                                  {@const modulePercentage = ((moduleData.total / subcategoryData.total) * 100).toFixed(1)}
                                  
                                  <div class="border border-slate-700/30 rounded-md overflow-hidden">
                                    <button
                                      on:click|stopPropagation={() => toggleModule(subcategoryKey, moduleName)}
                                      class="w-full px-3 py-2.5 flex items-center justify-between bg-slate-800/10 hover:bg-slate-800/30 transition-colors"
                                    >
                                      <div class="flex items-center gap-2">
                                        <svg 
                                          class="w-3 h-3 text-slate-600 transition-transform duration-200 {isModuleExpanded ? 'rotate-90' : ''}" 
                                          fill="none" 
                                          stroke="currentColor" 
                                          viewBox="0 0 24 24"
                                        >
                                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                        </svg>
                                        <div class="text-left">
                                          <p class="text-xs font-medium text-slate-300">{moduleName}</p>
                                          <div class="flex items-center gap-2 mt-0.5">
                                            <span class="text-xs text-slate-600">{moduleData.total} prints</span>
                                            <span class="text-xs text-slate-700">•</span>
                                            <span class="text-xs text-slate-600">{moduleData.totalObjects} obj</span>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      <!-- ✅ UPDATED: Weight + Cost for module -->
                                      <div class="flex items-center gap-3">
                                        <div class="text-right">
                                          <p class="text-xs font-bold text-blue-400">{(moduleData.totalWeight / 1000).toFixed(3)}kg</p>
                                          <p class="text-xs text-slate-500">{moduleData.avgWeightPerPrint.toFixed(0)}g/print</p>
                                          <p class="text-xs text-green-400 mt-0.5">${moduleData.avgCostPerPrint.toFixed(3)}/print</p>
                                          <p class="text-xs text-green-500">${moduleData.costPerObject.toFixed(4)}/obj</p>
                                        </div>
                                        <div class="w-12 h-1 bg-slate-700 rounded-full overflow-hidden">
                                          <div 
                                            class="h-full bg-purple-400 transition-all duration-500"
                                            style="width: {modulePercentage}%"
                                          ></div>
                                        </div>
                                      </div>
                                    </button>

                                    <!-- Level 4: Colors -->
                                    {#if isModuleExpanded}
                                      <div class="bg-slate-900/50 border-t border-slate-700/30 p-2 space-y-1">
                                        {#each Object.entries(moduleData.colors).sort(([,a], [,b]) => b.count - a.count) as [color, colorData]}
                                          {@const colorPercentage = ((colorData.count / moduleData.total) * 100).toFixed(1)}
                                          
                                          <div class="px-3 py-2 bg-slate-800/20 rounded hover:bg-slate-800/40 transition-colors">
                                            <div class="flex items-center justify-between">
                                              <div class="flex items-center gap-2">
                                                <div 
                                                  class="w-3 h-3 rounded-full border-2 border-slate-600 shadow-sm"
                                                  style="background-color: {color.toLowerCase()}"
                                                ></div>
                                                <span class="text-xs font-medium text-slate-400">{color}</span>
                                              </div>
                                              <!-- ✅ UPDATED: Weight + objects + cost for color -->
                                              <div class="flex items-center gap-3">
                                                <span class="text-xs font-bold text-blue-400">{(colorData.weight / 1000).toFixed(3)}kg</span>
                                                <span class="text-xs text-slate-600">{colorData.objects} obj</span>
                                                <div class="w-12 h-1 bg-slate-700 rounded-full overflow-hidden">
                                                  <div 
                                                    class="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                                                    style="width: {colorPercentage}%"
                                                  ></div>
                                                </div>
                                                <span class="text-xs font-bold text-green-400 min-w-[40px] text-right">{colorData.count}</span>
                                              </div>
                                            </div>
                                          </div>
                                        {/each}
                                      </div>
                                    {/if}
                                  </div>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                      
                    {:else}
                      <!-- No subcategories - show modules directly -->
                      <div class="p-4 space-y-2">
                        {#each Object.entries(categoryData.modules).sort(([,a], [,b]) => b.total - a.total) as [moduleName, moduleData]}
                          {@const moduleKey = `${categoryName}:${moduleName}`}
                          {@const isModuleExpanded = !!expandedModules[moduleKey]}
                          {@const modulePercentage = ((moduleData.total / categoryData.total) * 100).toFixed(1)}
                          
                          <div class="border border-slate-700/50 rounded-lg overflow-hidden">
                            <button
                              on:click|stopPropagation={() => toggleModule(categoryName, moduleName)}
                              class="w-full px-4 py-3 flex items-center justify-between bg-slate-800/20 hover:bg-slate-800/40 transition-colors"
                            >
                              <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-md bg-purple-500/10 flex items-center justify-center">
                                  <svg 
                                    class="w-4 h-4 text-purple-400 transition-transform duration-200 {isModuleExpanded ? 'rotate-90' : ''}" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                  >
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                                <div class="text-left">
                                  <h4 class="text-sm font-semibold text-slate-200">{moduleName}</h4>
                                  <p class="text-xs text-slate-500">{moduleData.total} prints • {moduleData.totalObjects} objects</p>
                                </div>
                              </div>
                              
                              <!-- ✅ UPDATED: Weight + Cost for module (no subcategory) -->
                              <div class="flex items-center gap-4">
                                <div class="text-right">
                                  <p class="text-sm font-bold text-blue-400">{(moduleData.totalWeight / 1000).toFixed(3)}kg</p>
                                  <p class="text-xs text-slate-500">{(moduleData.avgWeightPerPrint || 0).toFixed(0)}g/print</p>
                                  <p class="text-xs text-green-400 mt-0.5">${moduleData.avgCostPerPrint.toFixed(3)}/print</p>
                                  <p class="text-xs text-green-500">${moduleData.costPerObject.toFixed(4)}/obj</p>
                                </div>
                                <div class="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                  <div 
                                    class="h-full bg-purple-400 transition-all duration-500"
                                    style="width: {modulePercentage}%"
                                  ></div>
                                </div>
                                <span class="text-xs font-medium text-slate-500 w-10 text-right">{modulePercentage}%</span>
                              </div>
                            </button>

                            <!-- Level 3: Colors -->
                            {#if isModuleExpanded}
                              <div class="bg-slate-900/30 border-t border-slate-700/50 p-3 space-y-1.5">
                                {#each Object.entries(moduleData.colors).sort(([,a], [,b]) => b.count - a.count) as [color, colorData]}
                                  {@const colorPercentage = ((colorData.count / moduleData.total) * 100).toFixed(1)}
                                  
                                  <div class="px-3 py-2 bg-slate-800/20 rounded hover:bg-slate-800/40 transition-colors">
                                    <div class="flex items-center justify-between">
                                      <div class="flex items-center gap-2">
                                        <div 
                                          class="w-3 h-3 rounded-full border-2 border-slate-600 shadow-sm"
                                          style="background-color: {color.toLowerCase()}"
                                        ></div>
                                        <span class="text-xs font-medium text-slate-400">{color}</span>
                                      </div>
                                      <!-- ✅ UPDATED: Weight + objects + cost for color -->
                                      <div class="flex items-center gap-3">
                                        <span class="text-xs font-bold text-blue-400">{(colorData.weight / 1000).toFixed(3)}kg</span>
                                        <span class="text-xs text-slate-600">{colorData.objects} obj</span>
                                        <div class="w-12 h-1 bg-slate-700 rounded-full overflow-hidden">
                                          <div 
                                            class="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                                            style="width: {colorPercentage}%"
                                          ></div>
                                        </div>
                                        <span class="text-xs font-bold text-green-400 min-w-[40px] text-right">{colorData.count}</span>
                                      </div>
                                    </div>
                                  </div>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-12">
            <svg class="w-16 h-16 mx-auto text-slate-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p class="text-slate-500 text-lg font-medium">No prints found</p>
            <p class="text-slate-600 text-sm mt-1">{getTimeRangeLabel(selectedTimeRange)}</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Charts Grid -->
    <div class="grid grid-cols-2 gap-6 mb-6">
      <!-- Print History Line Chart -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div bind:this={printHistoryChart} style="width: 100%; height: 400px;"></div>
      </div>
      
      <!-- Material Usage Chart -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div bind:this={materialUsageChart} style="width: 100%; height: 400px;"></div>
      </div>
      
      <!-- Success Rate Pie Chart -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div bind:this={successRateChart} style="width: 100%; height: 400px;"></div>
      </div>
      
      <!-- Top Modules Bar Chart -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div bind:this={topModulesChart} style="width: 100%; height: 400px;"></div>
      </div>
      
      <!-- Failure Reasons (if any failures exist) -->
      {#if data.stats.failureReasons.length > 0}
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div bind:this={failureReasonsChart} style="width: 100%; height: 400px;"></div>
        </div>
      {/if}
      
      <!-- Printer Utilization -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div bind:this={printerUtilizationChart} style="width: 100%; height: 400px;"></div>
      </div>
    </div>

    <!-- ✅ NEW: Product Sets Cost Analysis -->
    <div class="bg-slate-900 border border-slate-800 rounded-xl mb-8 overflow-hidden">
      <div class="p-6 border-b border-slate-800">
        <h2 class="text-xl font-medium">Product Sets Cost Analysis</h2>
        <p class="text-sm text-slate-400 mt-1">Cost breakdown for complete product sets</p>
      </div>

      <div class="p-6">
        {#if data.stats.setCosts && data.stats.setCosts[selectedTimeRange]}
          {@const currentSets = data.stats.setCosts[selectedTimeRange]}
          
          <div class="grid grid-cols-2 gap-6">
            {#each Object.entries(currentSets) as [setName, setData]}
              <div class="bg-slate-800/50 rounded-xl p-6">
                <!-- Set Header -->
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center gap-3">
                    <span class="text-3xl">{setData.emoji}</span>
                    <div>
                      <h3 class="text-lg font-medium text-white">{setName}</h3>
                      <p class="text-xs text-slate-400">
                        {setData.possibleSets === Infinity ? 0 : setData.possibleSets} complete sets produced
                      </p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="text-sm text-slate-400">Cost per Set</p>
                    <p class="text-2xl font-bold text-green-400">
                      ${setData.possibleSets > 0 ? setData.costPerSet.toFixed(2) : '0.00'}
                    </p>
                  </div>
                </div>

                <!-- Components Breakdown -->
                <div class="space-y-3 border-t border-slate-700 pt-4">
                  {#each Object.entries(setData.components) as [componentName, componentData]}
                    <div class="bg-slate-700/30 rounded-lg p-3">
                      <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-medium text-slate-200 capitalize">
                          {componentData.quantity}x {componentName}
                        </span>
                        <span class="text-sm text-green-400">
                          ${(componentData.costPerObject * componentData.quantity).toFixed(2)}
                        </span>
                      </div>
                      <div class="flex items-center justify-between text-xs text-slate-500">
                        <span>${componentData.costPerObject.toFixed(3)}/object</span>
                        <span>{componentData.objectsProduced} objects produced</span>
                      </div>
                    </div>
                  {/each}
                </div>

                <!-- Total Cost -->
                <div class="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between">
                  <span class="text-sm text-slate-400">Total Material Cost</span>
                  <span class="text-lg font-bold text-white">${setData.totalCost.toFixed(2)}</span>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-center text-slate-500">No set data available</p>
        {/if}
      </div>
    </div>
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