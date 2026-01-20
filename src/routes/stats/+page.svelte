<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  import * as echarts from 'echarts';
  
  export let data: PageData;
  
  let printHistoryChart: HTMLDivElement;
  let materialUsageChart: HTMLDivElement;
  let successRateChart: HTMLDivElement;
  let topModulesChart: HTMLDivElement;
  let failureReasonsChart: HTMLDivElement;
  let printerUtilizationChart: HTMLDivElement;
  
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
  
  function formatDate(timestamp: number) {
    return new Date(timestamp * 1000).toLocaleString();
  }
  
  function formatDuration(minutes: number | null) {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
</script>

<div class="min-h-screen bg-black text-white p-6">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-light">Statistics & Analytics</h1>
      <a href="/" class="text-slate-400 hover:text-white transition-colors">← Back to Dashboard</a>
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
    
    <!-- Print History Table -->
    <div class="bg-slate-900 border border-slate-800 rounded-xl mb-8 overflow-hidden">
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
              <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Duration</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Material</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-slate-300">Status</th>
            </tr>
          </thead>
          <tbody>
            {#each data.printJobs as job, i}
              {@const printer = data.printers.find(p => p.id === job.printer_id)}
              {@const duration = job.end_time ? Math.floor((job.end_time - job.start_time) / 60) : null}
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
                  {duration ? formatDuration(duration) : 'In Progress'}
                </td>
                <td class="px-4 py-3 text-sm text-slate-400">
                  {job.actual_weight || job.planned_weight}g
                </td>
                <td class="px-4 py-3 text-sm">
                  {#if job.success}
                    <span class="inline-flex items-center gap-1 text-green-400">
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                      </svg>
                      Success
                    </span>
                  {:else}
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