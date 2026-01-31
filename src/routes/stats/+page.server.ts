import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  
  if (!database) {
    return { 
      printJobs: [], 
      printers: [],
      modules: [],
      spools: [],
      stats: {
        totalPrints: 0,
        successfulPrints: 0,
        failedPrints: 0,
        pendingPrints: 0,  
        totalMaterialUsed: 0,
        totalHours: 0,
        last30Days: [],
        dailyPrintCounts: [],
        dailyMaterialUsage: [],
        failureReasons: [],
        topModules: [],
        printerUtilization: [],
        moduleBreakdown: { last30Days: {}, thisMonth: {}, last90Days: {} }
      }
    };
  }

  const printers = await db.getAllPrinters(database);
  const printJobs = await db.getAllPrintJobs(database);
  const modules = await db.getAllPrintModules(database);
  const spools = await db.getAllSpools(database);
  
  // Sort print jobs by start_time descending (newest first)
  const sortedJobs = [...printJobs].sort((a, b) => b.start_time - a.start_time);
  
  // Calculate statistics - ✅ FIXED: Only count completed prints
  const completedJobs = printJobs.filter(j => j.status !== 'printing');
  const pendingJobs = printJobs.filter(j => j.status === 'printing');
  
  const totalPrints = completedJobs.length;
  const successfulPrints = printJobs.filter(j => j.status === 'success').length;
  const failedPrints = printJobs.filter(j => j.status === 'failed').length;
  const pendingPrints = pendingJobs.length;  // ✅ Track pending prints
  
  const totalMaterialUsed = printJobs
    .filter(j => j.status === 'success' && j.actual_weight)  // ✅ Only count successful prints
    .reduce((sum, j) => sum + (j.actual_weight || 0), 0);
  
  const totalHours = printers.reduce((sum, p) => sum + (p.total_hours || 0), 0);
  
  // ✅ FIXED: Use milliseconds for date comparison
  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000); // milliseconds!
  
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  // ✅ Only count completed prints in daily stats
  const dailyPrintCounts = Array.from({ length: 30 }, (_, i) => {
    const dayStart = now - ((29 - i) * 24 * 60 * 60 * 1000);
    const dayEnd = dayStart + (24 * 60 * 60 * 1000);
    return printJobs.filter(j => 
      j.start_time >= dayStart && 
      j.start_time < dayEnd && 
      j.status !== 'printing'
    ).length;
  });
  
  const dailyMaterialUsage = Array.from({ length: 30 }, (_, i) => {
    const dayStart = now - ((29 - i) * 24 * 60 * 60 * 1000);
    const dayEnd = dayStart + (24 * 60 * 60 * 1000);
    return printJobs
      .filter(j => 
        j.start_time >= dayStart && 
        j.start_time < dayEnd && 
        j.status === 'success'
      )
      .reduce((sum, j) => sum + (j.actual_weight || 0), 0);
  });
  
  // Failure reasons breakdown (only failed prints)
  const failureReasonCounts = new Map();
  printJobs.filter(j => j.status === 'failed' && j.failure_reason).forEach(job => {
    const reason = job.failure_reason || 'Unknown';
    failureReasonCounts.set(reason, (failureReasonCounts.get(reason) || 0) + 1);
  });
  
  const failureReasons = Array.from(failureReasonCounts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  
  // Top modules (only completed prints)
  const moduleCounts = new Map();
  printJobs.filter(j => j.status !== 'printing').forEach(job => {
    const moduleName = job.module_name || 'Unknown';
    moduleCounts.set(moduleName, (moduleCounts.get(moduleName) || 0) + 1);
  });
  
  const topModules = Array.from(moduleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));
  
  // Printer utilization
  const printerUtilization = printers.map(p => ({
    name: p.name,
    value: Number(p.total_hours || 0).toFixed(1)
  }));
  
  // ✅ NEW: Module breakdown by time periods
  const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
  
  // Get current month boundaries
  const currentDate = new Date();
  const thisMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getTime();
  const thisMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).getTime();

  // ✅ ADD THIS: Filter jobs by time periods (only successful prints)
 // ✅ UPDATED: Include BOTH successful AND failed prints for cost tracking
const allCompletedJobs = printJobs.filter(j => j.status === 'success' || j.status === 'failed');

const last30DaysJobs = allCompletedJobs.filter(j => j.start_time >= thirtyDaysAgo);
const thisMonthJobs = allCompletedJobs.filter(j => j.start_time >= thisMonthStart && j.start_time <= thisMonthEnd);
const last90DaysJobs = allCompletedJobs.filter(j => j.start_time >= ninetyDaysAgo);
  // ✅ UPDATED: Helper to determine module category and subcategory
  function getModuleCategory(moduleName: string, imagePath: string | null): { category: string, subcategory: string | null } {
    const lowerName = moduleName.toLowerCase();
    
    // Klorolle products
    if (imagePath?.includes('klohalter') || imagePath?.includes('stab') || imagePath?.includes('stöpsel')) {
      return { category: 'Klorolle', subcategory: null };
    }
    
    // Vase products
    if (imagePath?.includes('vase')) {
      return { category: 'Vase', subcategory: null };
    }
    
    // Haken products with subcategories
    if (imagePath?.includes('haken') || imagePath?.includes('hakenhalter')) {
      if (lowerName.includes('halter')) {
        return { category: 'Haken', subcategory: 'Halter' };
      } else if (lowerName.includes('kleben')) {
        return { category: 'Haken', subcategory: 'Kleben' };
      } else if (lowerName.includes('schrauben')) {
        return { category: 'Haken', subcategory: 'Schrauben' };
      }
      return { category: 'Haken', subcategory: 'Other' };
    }
    
    // Fallback
    return { category: moduleName, subcategory: null };
  }

  // ✅ UPDATED: Helper functio

  // ✅ NEW: Define product sets
  const PRODUCT_SETS = {
    'Klorolle Set': {
      emoji: '',
      components: [
        { name: 'klohalter', quantity: 1 },
        { name: 'stab', quantity: 1 },
        { name: 'stöpsel', quantity: 2 }
      ]
    },
    'Haken Set': {
      emoji: '',
      components: [
        { name: 'haken', quantity: 5, mustInclude: ['kleben', 'schrauben'] }, // Any haken module that includes these words
        { name: 'halter', quantity: 2, mustInclude: ['halter'] }
      ]
    }
  };

 // ✅ UPDATED: Helper function to build module breakdown with cost tracking (INCLUDING FAILED PRINTS)
function buildModuleBreakdown(jobs: any[]) {
  const breakdown: any = {};
  
  jobs.forEach(job => {
    if (!job.module_name) return;
    
    const module = modules.find(m => m.id === job.module_id);
    const spool = spools.find(s => s.id === job.spool_id);
    const color = spool?.color || 'Unknown';
    const objectsPerPrint = module?.objects_per_print || 1;
    
    // ✅ UPDATED: Calculate cost INCLUDING waste from failed prints
    // For failed prints: use actual_weight (material consumed before failure)
    // For successful prints: use actual_weight or planned_weight
    const materialWeight = job.actual_weight || job.planned_weight || 0;
    const spoolCost = spool?.cost || 0;
    const spoolWeight = spool?.initial_weight || 1000;
    const costPerGram = spoolCost / spoolWeight;
    const printCost = materialWeight * costPerGram;
    
    // ✅ NEW: Track if this was a failed print for statistics
    const isFailed = job.status === 'failed';
    const objectsProduced = isFailed ? 0 : objectsPerPrint; // Failed prints produce 0 objects
    
    // ✅ Get the category and subcategory
    const { category, subcategory } = getModuleCategory(job.module_name, module?.image_path || null);
    
    // Initialize category entry
    if (!breakdown[category]) {
      breakdown[category] = {
        total: 0,
        totalObjects: 0,
        totalWeight: 0,  // ✅ NEW
        totalCost: 0,
        wastedCost: 0,
        wastedWeight: 0,  // ✅ NEW
        successfulPrints: 0,
        failedPrints: 0,
        subcategories: {},
        modules: {},
        colors: {}
      };
    }
    
    // Increment category totals
    breakdown[category].total += 1;
    breakdown[category].totalObjects += objectsProduced;
    breakdown[category].totalWeight += materialWeight;  // ✅ NEW
    breakdown[category].totalCost += printCost;
    
    if (isFailed) {
      breakdown[category].wastedCost += printCost;
      breakdown[category].wastedWeight += materialWeight;  // ✅ NEW
      breakdown[category].failedPrints += 1;
    } else {
      breakdown[category].successfulPrints += 1;
    }
  
    // ✅ Track by subcategory
    if (subcategory) {
      if (!breakdown[category].subcategories[subcategory]) {
        breakdown[category].subcategories[subcategory] = {
          total: 0,
          totalObjects: 0,
          totalWeight: 0,  // ✅ NEW
          totalCost: 0,
          wastedCost: 0,
          wastedWeight: 0,  // ✅ NEW
          successfulPrints: 0,
          failedPrints: 0,
          modules: {}
        };
      }
      breakdown[category].subcategories[subcategory].total += 1;
      breakdown[category].subcategories[subcategory].totalObjects += objectsProduced;
      breakdown[category].subcategories[subcategory].totalWeight += materialWeight;  // ✅ NEW
      breakdown[category].subcategories[subcategory].totalCost += printCost;
      
      if (isFailed) {
        breakdown[category].subcategories[subcategory].wastedCost += printCost;
        breakdown[category].subcategories[subcategory].wastedWeight += materialWeight;  // ✅ NEW
        breakdown[category].subcategories[subcategory].failedPrints += 1;
      } else {
        breakdown[category].subcategories[subcategory].successfulPrints += 1;
      }
      
      // Track module under subcategory
      if (!breakdown[category].subcategories[subcategory].modules[job.module_name]) {
        breakdown[category].subcategories[subcategory].modules[job.module_name] = {
          total: 0,
          totalObjects: 0,
          totalWeight: 0,  // ✅ NEW
          totalCost: 0,
          wastedCost: 0,
          wastedWeight: 0,  // ✅ NEW
          successfulPrints: 0,
          failedPrints: 0,
          avgCostPerPrint: 0,
          avgWeightPerPrint: 0,  // ✅ NEW
          costPerObject: 0,
          colors: {}
        };
      }
      breakdown[category].subcategories[subcategory].modules[job.module_name].total += 1;
      breakdown[category].subcategories[subcategory].modules[job.module_name].totalObjects += objectsProduced;
      breakdown[category].subcategories[subcategory].modules[job.module_name].totalWeight += materialWeight;  // ✅ NEW
      breakdown[category].subcategories[subcategory].modules[job.module_name].totalCost += printCost;
      
      if (isFailed) {
        breakdown[category].subcategories[subcategory].modules[job.module_name].wastedCost += printCost;
        breakdown[category].subcategories[subcategory].modules[job.module_name].wastedWeight += materialWeight;  // ✅ NEW
        breakdown[category].subcategories[subcategory].modules[job.module_name].failedPrints += 1;
      } else {
        breakdown[category].subcategories[subcategory].modules[job.module_name].successfulPrints += 1;
      }
      
      // Calculate averages (only for successful prints when calculating per-object cost)
      const moduleData = breakdown[category].subcategories[subcategory].modules[job.module_name];
      moduleData.avgCostPerPrint = moduleData.totalCost / moduleData.total;  // Total cost / all prints
      moduleData.avgWeightPerPrint = moduleData.totalWeight / moduleData.total;  // ✅ NEW
      moduleData.costPerObject = moduleData.totalObjects > 0 
        ? moduleData.totalCost / moduleData.totalObjects  // Total cost / successful objects
        : 0;
      
      // Track colors under module
      if (!breakdown[category].subcategories[subcategory].modules[job.module_name].colors[color]) {
        breakdown[category].subcategories[subcategory].modules[job.module_name].colors[color] = {
          count: 0,
          objects: 0,
          weight: 0,  // ✅ NEW
          cost: 0,
          wastedCost: 0,
          wastedWeight: 0  // ✅ NEW
        };
      }
      breakdown[category].subcategories[subcategory].modules[job.module_name].colors[color].count += 1;
      breakdown[category].subcategories[subcategory].modules[job.module_name].colors[color].objects += objectsProduced;
      breakdown[category].subcategories[subcategory].modules[job.module_name].colors[color].weight += materialWeight;  // ✅ NEW
      breakdown[category].subcategories[subcategory].modules[job.module_name].colors[color].cost += printCost;
      
      if (isFailed) {
        breakdown[category].subcategories[subcategory].modules[job.module_name].colors[color].wastedCost += printCost;
        breakdown[category].subcategories[subcategory].modules[job.module_name].colors[color].wastedWeight += materialWeight;  // ✅ NEW
      }
    } else {
      // No subcategory - track directly under category
      if (!breakdown[category].modules[job.module_name]) {
        breakdown[category].modules[job.module_name] = {
          total: 0,
          totalObjects: 0,
          totalWeight: 0,  // ✅ NEW
          totalCost: 0,
          wastedCost: 0,
          wastedWeight: 0,  // ✅ NEW
          successfulPrints: 0,
          failedPrints: 0,
          avgCostPerPrint: 0,
          costPerObject: 0,
          colors: {}
        };
      }
      breakdown[category].modules[job.module_name].total += 1;
      breakdown[category].modules[job.module_name].totalObjects += objectsProduced;
      breakdown[category].modules[job.module_name].totalWeight += materialWeight;  // ✅ NEW
      breakdown[category].modules[job.module_name].totalCost += printCost;
      
      if (isFailed) {
        breakdown[category].modules[job.module_name].wastedCost += printCost;
        breakdown[category].modules[job.module_name].wastedWeight += materialWeight;  // ✅ NEW
        breakdown[category].modules[job.module_name].failedPrints += 1;
      } else {
        breakdown[category].modules[job.module_name].successfulPrints += 1;
      }
      
      // Calculate averages
      const moduleData = breakdown[category].modules[job.module_name];
      moduleData.avgCostPerPrint = moduleData.totalCost / moduleData.total;
      moduleData.costPerObject = moduleData.totalObjects > 0 
        ? moduleData.totalCost / moduleData.totalObjects 
        : 0;
      
      // Track by color under module
      if (!breakdown[category].modules[job.module_name].colors[color]) {
        breakdown[category].modules[job.module_name].colors[color] = {
          count: 0,
          objects: 0,
          weight: 0,  // ✅ NEW
          cost: 0,
          wastedCost: 0,
          wastedWeight: 0  // ✅ NEW
        };
      }
      breakdown[category].modules[job.module_name].colors[color].count += 1;
      breakdown[category].modules[job.module_name].colors[color].objects += objectsProduced;
      breakdown[category].modules[job.module_name].colors[color].weight += materialWeight;  // ✅ NEW
      breakdown[category].modules[job.module_name].colors[color].cost += printCost;
      
      if (isFailed) {
        breakdown[category].modules[job.module_name].colors[color].wastedCost += printCost;
        breakdown[category].modules[job.module_name].colors[color].wastedWeight += materialWeight;  // ✅ NEW
      }
    }
  
    // ✅ Track colors at category level
    if (!breakdown[category].colors[color]) {
      breakdown[category].colors[color] = {
        count: 0,
        objects: 0,
        cost: 0,
        wastedCost: 0  // ✅ NEW
      };
    }
    breakdown[category].colors[color].count += 1;
    breakdown[category].colors[color].objects += objectsProduced;
    breakdown[category].colors[color].cost += printCost;
    
    if (isFailed) {
      breakdown[category].colors[color].wastedCost += printCost;
    }
  });
  
  return breakdown;
}

  // ✅ NEW: Calculate set costs
  function calculateSetCosts(jobs: any[], breakdown: any) {
    const sets: any = {};
    
    Object.entries(PRODUCT_SETS).forEach(([setName, setConfig]: [string, any]) => {
      sets[setName] = {
        emoji: setConfig.emoji,
        components: {},
        totalCost: 0,
        costPerSet: 0,
        possibleSets: Infinity
      };
      
      // Calculate cost for each component
      setConfig.components.forEach((component: any) => {
        const matchingModules: any[] = [];
        
        // Find matching modules in breakdown
        Object.entries(breakdown).forEach(([category, categoryData]: [string, any]) => {
          // Search in subcategories
          if (categoryData.subcategories) {
            Object.entries(categoryData.subcategories).forEach(([subcat, subcatData]: [string, any]) => {
              Object.entries(subcatData.modules).forEach(([moduleName, moduleData]: [string, any]) => {
                const lowerName = moduleName.toLowerCase();
                const matchesName = lowerName.includes(component.name.toLowerCase());
                const matchesIncludes = !component.mustInclude || 
                  component.mustInclude.some((term: string) => lowerName.includes(term.toLowerCase()));
                
                if (matchesName && matchesIncludes) {
                  matchingModules.push({ moduleName, ...moduleData });
                }
              });
            });
          }
          
          // Search in modules (no subcategory)
          Object.entries(categoryData.modules || {}).forEach(([moduleName, moduleData]: [string, any]) => {
            const lowerName = moduleName.toLowerCase();
            const matchesName = lowerName.includes(component.name.toLowerCase());
            const matchesIncludes = !component.mustInclude || 
              component.mustInclude.some((term: string) => lowerName.includes(term.toLowerCase()));
            
            if (matchesName && matchesIncludes) {
              matchingModules.push({ moduleName, ...moduleData });
            }
          });
        });
        
        // Calculate average cost per object across all matching modules
        const totalObjects = matchingModules.reduce((sum, m) => sum + m.totalObjects, 0);
        const totalCost = matchingModules.reduce((sum, m) => sum + m.totalCost, 0);
        const avgCostPerObject = totalObjects > 0 ? totalCost / totalObjects : 0;
        
        const componentCost = avgCostPerObject * component.quantity;
        const objectsProduced = Math.floor(totalObjects / component.quantity);
        
        sets[setName].components[component.name] = {
          quantity: component.quantity,
          costPerObject: avgCostPerObject,
          totalCost: componentCost,
          objectsProduced: totalObjects,
          possibleSets: objectsProduced
        };
        
        sets[setName].totalCost += componentCost;
        sets[setName].possibleSets = Math.min(sets[setName].possibleSets, objectsProduced);
      });
      
      // Calculate cost per complete set
      if (sets[setName].possibleSets > 0) {
        sets[setName].costPerSet = sets[setName].totalCost / sets[setName].possibleSets;
      }
    });
    
    return sets;
  }

  // In the load function, after buildModuleBreakdown:
  const moduleBreakdown = {
    last30Days: buildModuleBreakdown(last30DaysJobs),
    thisMonth: buildModuleBreakdown(thisMonthJobs),
    last90Days: buildModuleBreakdown(last90DaysJobs)
  };

  // ✅ NEW: Calculate set costs for each time period
  const setCosts = {
    last30Days: calculateSetCosts(last30DaysJobs, moduleBreakdown.last30Days),
    thisMonth: calculateSetCosts(thisMonthJobs, moduleBreakdown.thisMonth),
    last90Days: calculateSetCosts(last90DaysJobs, moduleBreakdown.last90Days)
  };

  const stats = {
    totalPrints,
    successfulPrints,
    failedPrints,
    pendingPrints,
    totalMaterialUsed,
    totalHours,
    last30Days,
    dailyPrintCounts,
    dailyMaterialUsage,
    failureReasons,
    topModules,
    printerUtilization,
    moduleBreakdown,
    setCosts  // ✅ NEW
  };
  
  return { printJobs: sortedJobs, printers, modules, spools, stats };
};

export const actions: Actions = {
  updateSpool: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) {
      return { error: 'Database not available' };
    }

    const formData = await request.formData();
    const spoolId = Number(formData.get('spoolId'));
    const brand = formData.get('brand') as string;
    const material = formData.get('material') as string;
    const color = formData.get('color') as string || null;
    const remaining_weight = Number(formData.get('remaining_weight'));
    const cost = Number(formData.get('cost')) || null;

    try {
      await database.prepare(`
        UPDATE spools 
        SET brand = ?, 
            material = ?, 
            color = ?, 
            remaining_weight = ?, 
            cost = ?
        WHERE id = ?
      `).bind(brand, material, color, remaining_weight, cost, spoolId).run();

      return { success: true, message: 'Spool updated successfully' };
    } catch (error) {
      console.error('Error updating spool:', error);
      return { error: 'Failed to update spool' };
    }
  },

  deleteSpool: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) {
      return { error: 'Database not available' };
    }

    const formData = await request.formData();
    const spoolId = Number(formData.get('spoolId'));

    try {
      // Check if spool is loaded on any printer
      const loadedPrinter = await database.prepare(`
        SELECT id, name FROM printers WHERE loaded_spool_id = ?
      `).bind(spoolId).first();

      if (loadedPrinter) {
        return { 
          error: `Cannot delete spool - it's currently loaded on ${loadedPrinter.name}` 
        };
      }

      // Delete the spool
      await database.prepare('DELETE FROM spools WHERE id = ?').bind(spoolId).run();

      return { success: true, message: 'Spool deleted successfully' };
    } catch (error) {
      console.error('Error deleting spool:', error);
      return { error: 'Failed to delete spool' };
    }
  }
};