<script lang="ts">
  import { selectedTimeRange } from '$lib/stores/timeRange';

  /**
   * 4-level expandable tree: Category → Subcategory → Module → Color.
   * Reads the global selectedTimeRange store — changing the range here updates all stats.
   * Expansion state is fully internal.
   */
  export let breakdown: Record<string, any>;
  export let totalPrints: number;
  export let totalObjects: number;

  // Internal expansion state — reset when component is destroyed
  let expandedCategories: Record<string, boolean> = {};
  let expandedSubcategories: Record<string, boolean> = {};
  let expandedModules: Record<string, boolean> = {};

  function getTimeRangeLabel(range: string): string {
    switch (range) {
      case 'last30Days': return 'Last 30 Days';
      case 'thisMonth':  return 'This Month';
      case 'last90Days': return 'Last 90 Days';
      default: return range;
    }
  }

  function toggleCategory(categoryName: string) {
    if (expandedCategories[categoryName]) {
      const newExpanded = { ...expandedCategories };
      delete newExpanded[categoryName];
      expandedCategories = newExpanded;
      const newSubs = { ...expandedSubcategories };
      const newMods = { ...expandedModules };
      Object.keys(newSubs).forEach(k => { if (k.startsWith(`${categoryName}:`)) delete newSubs[k]; });
      Object.keys(newMods).forEach(k => { if (k.startsWith(`${categoryName}:`)) delete newMods[k]; });
      expandedSubcategories = newSubs;
      expandedModules = newMods;
    } else {
      expandedCategories = { ...expandedCategories, [categoryName]: true };
    }
  }

  function toggleSubcategory(categoryName: string, subcategoryName: string) {
    const key = `${categoryName}:${subcategoryName}`;
    if (expandedSubcategories[key]) {
      const newSubs = { ...expandedSubcategories };
      delete newSubs[key];
      expandedSubcategories = newSubs;
      const newMods = { ...expandedModules };
      Object.keys(newMods).forEach(k => { if (k.startsWith(`${key}:`)) delete newMods[k]; });
      expandedModules = newMods;
    } else {
      expandedSubcategories = { ...expandedSubcategories, [key]: true };
    }
  }

  function toggleModule(parentKey: string, moduleName: string) {
    const key = `${parentKey}:${moduleName}`;
    if (expandedModules[key]) {
      const newMods = { ...expandedModules };
      delete newMods[key];
      expandedModules = newMods;
    } else {
      expandedModules = { ...expandedModules, [key]: true };
    }
  }
</script>

<div class="bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#262626] rounded-lg mb-8 overflow-hidden">
  <div class="p-6 border-b border-zinc-200 dark:border-[#262626]">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-medium">Module Production Breakdown</h2>
        <p class="text-sm text-zinc-500 mt-1">Detailed cost and production analysis by category</p>
      </div>

    </div>
  </div>

  <div class="p-6">
    <!-- Total Count Header -->
    <div class="mb-6 grid grid-cols-4 gap-4">
      <div class="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-[#262626]">
        <p class="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Total Prints</p>
        <p class="text-3xl font-medium text-zinc-900 dark:text-zinc-50">{totalPrints}</p>
      </div>
      <div class="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-[#262626]">
        <p class="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Total Objects</p>
        <p class="text-3xl font-medium text-purple-400">{totalObjects}</p>
      </div>
      <div class="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-[#262626]">
        <p class="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Total Weight</p>
        <p class="text-3xl font-medium text-blue-600 dark:text-blue-400">
          {(Object.values(breakdown).reduce((sum: number, cat: any) => sum + (cat.totalWeight || 0), 0) / 1000).toFixed(2)}kg
        </p>
      </div>
      <div class="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-[#262626]">
        <p class="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Total Cost</p>
        <p class="text-3xl font-medium text-green-600 dark:text-green-400">
          ${Object.values(breakdown).reduce((sum: number, cat: any) => sum + (cat.totalCost || 0), 0).toFixed(2)}
        </p>
      </div>
    </div>

    <!-- Category Drill-Down List -->
    {#if Object.keys(breakdown).length > 0}
      <div class="space-y-3">
        {#each Object.entries(breakdown).sort(([,a], [,b]) => (b as any).total - (a as any).total) as [categoryName, categoryData]}
          {@const cat = categoryData as any}
          {@const isCategoryExpanded = !!expandedCategories[categoryName]}
          {@const categoryPercentage = ((cat.total / totalPrints) * 100).toFixed(1)}
          {@const hasSubcategories = Object.keys(cat.subcategories || {}).length > 0}

          <!-- Level 1: Category -->
          <div class="border border-zinc-200 dark:border-[#262626] rounded-lg overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
            <button
              on:click|stopPropagation={() => toggleCategory(categoryName)}
              class="w-full px-5 py-4 flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                  <svg
                    class="w-5 h-5 text-blue-600 dark:text-blue-400 transition-transform duration-200 {isCategoryExpanded ? 'rotate-90' : ''}"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div class="text-left">
                  <h3 class="text-lg font-medium text-zinc-900 dark:text-zinc-50">{categoryName}</h3>
                  <p class="text-xs text-zinc-500 mt-0.5">{cat.total} prints • {cat.totalObjects} objects</p>
                </div>
              </div>

              <div class="flex items-center gap-6">
                <div class="flex items-center gap-3">
                  <div class="w-24 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-500 transition-all duration-500" style="width: {categoryPercentage}%"></div>
                  </div>
                  <span class="text-sm font-medium text-zinc-500 w-12 text-right">{categoryPercentage}%</span>
                </div>
                <div class="text-right min-w-40">
                  <p class="text-2xl font-medium text-blue-600 dark:text-blue-400">
                    {(cat.totalWeight / 1000).toFixed(2)}kg
                  </p>
                  <p class="text-sm text-green-600 dark:text-green-400 mt-0.5">
                    ${cat.totalCost.toFixed(2)}
                  </p>
                  {#if cat.wastedCost > 0}
                    <p class="text-xs text-red-600 dark:text-red-400 mt-0.5">
                      -{(cat.wastedWeight / 1000).toFixed(2)}kg waste
                    </p>
                  {/if}
                </div>
              </div>
            </button>

            {#if isCategoryExpanded}
              <div class="bg-white dark:bg-[#111111] border-t border-zinc-200 dark:border-[#262626]">

                <!-- Level 2: Subcategories -->
                {#if hasSubcategories}
                  <div class="p-4 space-y-2">
                    {#each Object.entries(cat.subcategories).sort(([,a], [,b]) => (b as any).total - (a as any).total) as [subcategoryName, subcategoryData]}
                      {@const sub = subcategoryData as any}
                      {@const subcategoryKey = `${categoryName}:${subcategoryName}`}
                      {@const isSubcategoryExpanded = !!expandedSubcategories[subcategoryKey]}
                      {@const subcategoryPercentage = ((sub.total / cat.total) * 100).toFixed(1)}

                      <div class="border border-zinc-200 dark:border-[#262626] rounded-lg overflow-hidden">
                        <button
                          on:click|stopPropagation={() => toggleSubcategory(categoryName, subcategoryName)}
                          class="w-full px-4 py-3 flex items-center justify-between bg-zinc-50 dark:bg-[#111111] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-md bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
                              <svg
                                class="w-4 h-4 text-indigo-400 transition-transform duration-200 {isSubcategoryExpanded ? 'rotate-90' : ''}"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                            <div class="text-left">
                              <h4 class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{subcategoryName}</h4>
                              <p class="text-xs text-zinc-500">{sub.total} prints • {sub.totalObjects} objects</p>
                            </div>
                          </div>
                          <div class="flex items-center gap-4">
                            <div class="w-16 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                              <div class="h-full bg-indigo-400 transition-all duration-500" style="width: {subcategoryPercentage}%"></div>
                            </div>
                            <span class="text-xs font-medium text-zinc-500 w-10 text-right">{subcategoryPercentage}%</span>
                            <div class="text-right min-w-25">
                              <span class="text-base font-medium text-blue-600 dark:text-blue-400">{(sub.totalWeight / 1000).toFixed(2)}kg</span>
                              <p class="text-xs text-green-600 dark:text-green-400">${sub.totalCost.toFixed(2)}</p>
                            </div>
                          </div>
                        </button>

                        <!-- Level 3: Modules under Subcategory -->
                        {#if isSubcategoryExpanded}
                          <div class="bg-white dark:bg-[#111111] border-t border-zinc-200 dark:border-[#262626] p-3 space-y-1.5">
                            {#each Object.entries(sub.modules).sort(([,a], [,b]) => (b as any).total - (a as any).total) as [moduleName, moduleData]}
                              {@const mod = moduleData as any}
                              {@const moduleKey = `${subcategoryKey}:${moduleName}`}
                              {@const isModuleExpanded = !!expandedModules[moduleKey]}
                              {@const modulePercentage = ((mod.total / sub.total) * 100).toFixed(1)}

                              <div class="border border-zinc-200 dark:border-[#262626] rounded-md overflow-hidden">
                                <button
                                  on:click|stopPropagation={() => toggleModule(subcategoryKey, moduleName)}
                                  class="w-full px-3 py-2.5 flex items-center justify-between bg-zinc-50 dark:bg-[#111111] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                  <div class="flex items-center gap-2">
                                    <svg class="w-3 h-3 text-zinc-500 transition-transform duration-200 {isModuleExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                    </svg>
                                    <div class="text-left">
                                      <p class="text-xs font-medium text-zinc-700 dark:text-zinc-300">{moduleName}</p>
                                      <div class="flex items-center gap-2 mt-0.5">
                                        <span class="text-xs text-zinc-500">{mod.total} prints</span>
                                        <span class="text-xs text-zinc-500">•</span>
                                        <span class="text-xs text-zinc-500">{mod.totalObjects} obj</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div class="flex items-center gap-3">
                                    <div class="text-right">
                                      <p class="text-xs font-medium text-blue-600 dark:text-blue-400">{(mod.totalWeight / 1000).toFixed(3)}kg</p>
                                      <p class="text-xs text-zinc-500">{mod.avgWeightPerPrint.toFixed(0)}g/print</p>
                                      <p class="text-xs text-green-600 dark:text-green-400 mt-0.5">${mod.avgCostPerPrint.toFixed(3)}/print</p>
                                      <p class="text-xs text-green-600 dark:text-green-400">${mod.costPerObject.toFixed(4)}/obj</p>
                                    </div>
                                    <div class="w-12 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                      <div class="h-full bg-purple-400 transition-all duration-500" style="width: {modulePercentage}%"></div>
                                    </div>
                                  </div>
                                </button>

                                <!-- Level 4: Colors -->
                                {#if isModuleExpanded}
                                  <div class="bg-white dark:bg-[#111111] border-t border-zinc-200 dark:border-[#262626] p-2 space-y-1">
                                    {#each Object.entries(mod.colors).sort(([,a], [,b]) => (b as any).count - (a as any).count) as [color, colorData]}
                                      {@const col = colorData as any}
                                      {@const colorPercentage = ((col.count / mod.total) * 100).toFixed(1)}
                                      <div class="px-3 py-2 bg-zinc-50 dark:bg-[#111111] rounded-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                        <div class="flex items-center justify-between">
                                          <div class="flex items-center gap-2">
                                            <div class="w-3 h-3 rounded-full border-2 border-zinc-300 dark:border-zinc-700" style="background-color: {color.toLowerCase()}"></div>
                                            <span class="text-xs font-medium text-zinc-500">{color}</span>
                                          </div>
                                          <div class="flex items-center gap-3">
                                            <span class="text-xs font-medium text-blue-600 dark:text-blue-400">{(col.weight / 1000).toFixed(3)}kg</span>
                                            <span class="text-xs text-zinc-500">{col.objects} obj</span>
                                            <div class="w-12 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                              <div class="h-full bg-green-500 transition-all duration-500" style="width: {colorPercentage}%"></div>
                                            </div>
                                            <span class="text-xs font-medium text-green-600 dark:text-green-400 min-w-10 text-right">{col.count}</span>
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
                  <!-- No subcategories — show modules directly -->
                  <div class="p-4 space-y-2">
                    {#each Object.entries(cat.modules).sort(([,a], [,b]) => (b as any).total - (a as any).total) as [moduleName, moduleData]}
                      {@const mod = moduleData as any}
                      {@const moduleKey = `${categoryName}:${moduleName}`}
                      {@const isModuleExpanded = !!expandedModules[moduleKey]}
                      {@const modulePercentage = ((mod.total / cat.total) * 100).toFixed(1)}

                      <div class="border border-zinc-200 dark:border-[#262626] rounded-lg overflow-hidden">
                        <button
                          on:click|stopPropagation={() => toggleModule(categoryName, moduleName)}
                          class="w-full px-4 py-3 flex items-center justify-between bg-zinc-50 dark:bg-[#111111] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-md bg-purple-50 dark:bg-purple-950 flex items-center justify-center">
                              <svg class="w-4 h-4 text-purple-400 transition-transform duration-200 {isModuleExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                            <div class="text-left">
                              <h4 class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{moduleName}</h4>
                              <p class="text-xs text-zinc-500">{mod.total} prints • {mod.totalObjects} objects</p>
                            </div>
                          </div>
                          <div class="flex items-center gap-4">
                            <div class="text-right">
                              <p class="text-sm font-medium text-blue-600 dark:text-blue-400">{(mod.totalWeight / 1000).toFixed(3)}kg</p>
                              <p class="text-xs text-zinc-500">{(mod.avgWeightPerPrint || 0).toFixed(0)}g/print</p>
                              <p class="text-xs text-green-600 dark:text-green-400 mt-0.5">${mod.avgCostPerPrint.toFixed(3)}/print</p>
                              <p class="text-xs text-green-600 dark:text-green-400">${mod.costPerObject.toFixed(4)}/obj</p>
                            </div>
                            <div class="w-16 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                              <div class="h-full bg-purple-400 transition-all duration-500" style="width: {modulePercentage}%"></div>
                            </div>
                            <span class="text-xs font-medium text-zinc-500 w-10 text-right">{modulePercentage}%</span>
                          </div>
                        </button>

                        <!-- Level 3: Colors -->
                        {#if isModuleExpanded}
                          <div class="bg-white dark:bg-[#111111] border-t border-zinc-200 dark:border-[#262626] p-3 space-y-1.5">
                            {#each Object.entries(mod.colors).sort(([,a], [,b]) => (b as any).count - (a as any).count) as [color, colorData]}
                              {@const col = colorData as any}
                              {@const colorPercentage = ((col.count / mod.total) * 100).toFixed(1)}
                              <div class="px-3 py-2 bg-zinc-50 dark:bg-[#111111] rounded-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                <div class="flex items-center justify-between">
                                  <div class="flex items-center gap-2">
                                    <div class="w-3 h-3 rounded-full border-2 border-zinc-300 dark:border-zinc-700" style="background-color: {color.toLowerCase()}"></div>
                                    <span class="text-xs font-medium text-zinc-500">{color}</span>
                                  </div>
                                  <div class="flex items-center gap-3">
                                    <span class="text-xs font-medium text-blue-600 dark:text-blue-400">{(col.weight / 1000).toFixed(3)}kg</span>
                                    <span class="text-xs text-zinc-500">{col.objects} obj</span>
                                    <div class="w-12 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                      <div class="h-full bg-green-500 transition-all duration-500" style="width: {colorPercentage}%"></div>
                                    </div>
                                    <span class="text-xs font-medium text-green-600 dark:text-green-400 min-w-10 text-right">{col.count}</span>
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
        <svg class="w-16 h-16 mx-auto text-zinc-200 dark:text-zinc-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p class="text-zinc-500 text-lg font-medium">No prints found</p>
        <p class="text-zinc-500 text-sm mt-1">{getTimeRangeLabel($selectedTimeRange)}</p>
      </div>
    {/if}
  </div>
</div>
