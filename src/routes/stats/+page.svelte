<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import * as echarts from 'echarts';
  
  export let data: PageData;
  
  let printHistoryChart: HTMLDivElement;
  let materialUsageChart: HTMLDivElement;
  let successRateChart: HTMLDivElement;
  let topModulesChart: HTMLDivElement;
  let failureReasonsChart: HTMLDivElement;
  let printerUtilizationChart: HTMLDivElement;
  
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
  
  // Sort spools by ID descending (newest first)
  $: sortedSpools = [...(data.spools || [])].sort((a, b) => b.id - a.id);
  
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
    if (data.stats.failureReasons.length > 0) {
      const failureChart = echarts.init(failureReasonsChart, 'dark');
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
      if (data.stats.failureReasons.length > 0) {
        failureChart?.resize();
      }
      utilizationChart.resize();
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup when leaving the page
    return () => {
      window.removeEventListener('resize', handleResize);
      historyChart.dispose();
      materialChart.dispose();
      successChart.dispose();
      modulesChart.dispose();
      if (data.stats.failureReasons.length > 0) {
        const failureChart = echarts.init(failureReasonsChart, 'dark');
        failureChart?.dispose();
      }
      utilizationChart.dispose();
    };
  });
  
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
</script>

<div class="min-h-screen bg-black text-white p-6">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-light">Statistics & Analytics</h1>
      <button 
        onclick={() => goto('/')}
        class="text-slate-400 hover:text-white transition-colors cursor-pointer"
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
        onclick={() => showPrintHistory = !showPrintHistory}
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
        onclick={() => showSpools = !showSpools}
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
                            onclick={cancelEdit}
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
                            onclick={() => startEdit(spool)}
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
                              onclick={(e) => {
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