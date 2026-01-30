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
        printerUtilization: []
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
  
  const stats = {
    totalPrints,
    successfulPrints,
    failedPrints,
    pendingPrints,  // ✅ Add this
    totalMaterialUsed,
    totalHours,
    last30Days,
    dailyPrintCounts,
    dailyMaterialUsage,
    failureReasons,
    topModules,
    printerUtilization
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