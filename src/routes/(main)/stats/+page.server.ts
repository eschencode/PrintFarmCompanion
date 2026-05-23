import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { getAllObjects } from '$lib/inventory_handler';
import {
  buildModuleBreakdown,
  computeUtilization,
  buildFailureAnalysis,
  buildSpoolUsage,
} from '$lib/utils/statsCompute';
import { getAllPrintJobsForStats, type PrintJobStatsRow } from '$lib/server/jobs';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;

  if (!database) {
    return {
      printJobs: [],
      printers: [],
      modules: [],
      spools: [],
      stats: emptyStats(),
      inventoryStats: null,
      shopifyStats: null,
    };
  }

  const drizzleDb = getDb(database);
  const [printers, printJobs, modules, spools] = await Promise.all([
    db.getAllPrintersFull(database), // includes nested loaded_spools[] so the spool table can show "loaded on X"
    getAllPrintJobsForStats(database),
    db.getAllPrintModules(database),
    db.getAllSpools(database),
  ]);

  const sortedJobs = [...printJobs].sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0));

  // High-level counts
  const completedJobs = printJobs.filter((j) => j.status !== 'printing');
  const pendingJobs = printJobs.filter((j) => j.status === 'printing');
  const totalPrints = completedJobs.length;
  const successfulPrints = printJobs.filter((j) => j.status === 'successful').length;
  const failedPrints = printJobs.filter((j) => j.status === 'failed').length;
  const pendingPrints = pendingJobs.length;

  const totalMaterialUsed = Math.round(
    printJobs
      .filter((j) => j.status === 'successful')
      .reduce((sum, j) => sum + j.total_used_weight, 0),
  );

  // Derive total hours of operation from job durations (successful + failed).
  // The old `printers.total_hours` column is gone — utilization is the source of truth.
  const totalHours = Math.round(
    (printJobs
      .filter((j) => j.status === 'successful' || j.status === 'failed')
      .reduce((sum, j) => sum + (j.expected_time_minutes || 0), 0) / 60) * 10,
  ) / 10;

  // 30-day rolling window (ms)
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const dailyPrintCounts = Array.from({ length: 30 }, (_, i) => {
    const dayStart = now - (29 - i) * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return printJobs.filter(
      (j) => (j.start_time ?? 0) >= dayStart && (j.start_time ?? 0) < dayEnd && j.status !== 'printing',
    ).length;
  });

  const dailyMaterialUsage = Array.from({ length: 30 }, (_, i) => {
    const dayStart = now - (29 - i) * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return printJobs
      .filter(
        (j) => (j.start_time ?? 0) >= dayStart && (j.start_time ?? 0) < dayEnd && j.status === 'successful',
      )
      .reduce((sum, j) => sum + j.total_used_weight, 0);
  });

  // Failure reasons (failed prints only)
  const failureReasonCounts = new Map<string, number>();
  printJobs
    .filter((j) => j.status === 'failed' && j.failure_reason)
    .forEach((job) => {
      const reason = job.failure_reason || 'Unknown';
      failureReasonCounts.set(reason, (failureReasonCounts.get(reason) || 0) + 1);
    });
  const failureReasons = [...failureReasonCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Top modules (completed prints only)
  const moduleCounts = new Map<string, number>();
  printJobs
    .filter((j) => j.status !== 'printing')
    .forEach((job) => {
      const moduleName = job.module_name || 'Unknown';
      moduleCounts.set(moduleName, (moduleCounts.get(moduleName) || 0) + 1);
    });
  const topModules = [...moduleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));

  // Per-printer hours (replaces the old total_hours column)
  const printerUtilization = printers.map((p) => {
    const printerHrs = printJobs
      .filter((j) => j.printer_id === p.id && (j.status === 'successful' || j.status === 'failed'))
      .reduce((sum, j) => sum + (j.expected_time_minutes || 0), 0) / 60;
    return { name: p.name, value: printerHrs.toFixed(1) };
  });

  // Time-window boundaries (all in ms)
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
  const currentDate = new Date();
  const thisMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getTime();
  const thisMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).getTime();
  const thisWeekStart = (() => {
    const d = new Date(now);
    const dayOfWeek = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const last7DaysStart = now - 7 * 24 * 60 * 60 * 1000;

  const allCompletedJobs = printJobs.filter((j) => j.status === 'successful' || j.status === 'failed');
  const inWindow = (j: PrintJobStatsRow, start: number, end: number) =>
    (j.start_time ?? 0) >= start && (j.start_time ?? 0) <= end;

  const last30DaysJobs = allCompletedJobs.filter((j) => inWindow(j, thirtyDaysAgo, now));
  const thisMonthJobs = allCompletedJobs.filter((j) => inWindow(j, thisMonthStart, thisMonthEnd));
  const last90DaysJobs = allCompletedJobs.filter((j) => inWindow(j, ninetyDaysAgo, now));
  const thisWeekJobs = allCompletedJobs.filter((j) => inWindow(j, thisWeekStart, now));
  const last7DaysJobs = allCompletedJobs.filter((j) => inWindow(j, last7DaysStart, now));

  const moduleBreakdown = {
    last30Days: buildModuleBreakdown(last30DaysJobs),
    thisMonth:  buildModuleBreakdown(thisMonthJobs),
    last90Days: buildModuleBreakdown(last90DaysJobs),
    thisWeek:   buildModuleBreakdown(thisWeekJobs),
    last7Days:  buildModuleBreakdown(last7DaysJobs),
  };

  const setCosts = {
    last30Days: calculateSetCosts(moduleBreakdown.last30Days),
    thisMonth:  calculateSetCosts(moduleBreakdown.thisMonth),
    last90Days: calculateSetCosts(moduleBreakdown.last90Days),
    thisWeek:   calculateSetCosts(moduleBreakdown.thisWeek),
    last7Days:  calculateSetCosts(moduleBreakdown.last7Days),
  };

  const utilizationScores = {
    last30Days: computeUtilization(printers, printJobs, thirtyDaysAgo, now),
    thisMonth:  computeUtilization(printers, printJobs, thisMonthStart, now),
    last90Days: computeUtilization(printers, printJobs, ninetyDaysAgo, now),
    thisWeek:   computeUtilization(printers, printJobs, thisWeekStart, now),
    last7Days:  computeUtilization(printers, printJobs, last7DaysStart, now),
  };

  const failureAnalysis = {
    last30Days: buildFailureAnalysis(last30DaysJobs, printers),
    thisMonth:  buildFailureAnalysis(thisMonthJobs, printers),
    last90Days: buildFailureAnalysis(last90DaysJobs, printers),
    thisWeek:   buildFailureAnalysis(thisWeekJobs, printers),
    last7Days:  buildFailureAnalysis(last7DaysJobs, printers),
  };

  const spoolUsage = {
    last30Days: buildSpoolUsage(last30DaysJobs),
    thisMonth:  buildSpoolUsage(thisMonthJobs),
    last90Days: buildSpoolUsage(last90DaysJobs),
    thisWeek:   buildSpoolUsage(thisWeekJobs),
    last7Days:  buildSpoolUsage(last7DaysJobs),
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
    setCosts,
    utilizationScores,
    failureAnalysis,
    spoolUsage,
  };

  // ── Inventory stats ───────────────────────────────────────────────────────
  let inventoryStats = null;
  try {
    const inventoryItems = await getAllObjects(database);

    // inventory_log.created_at is stored as Unix seconds (D1 INTEGER, no /1000 conversion needed)
    const cutoff7d = Math.floor((now - 7 * 86400 * 1000) / 1000);
    const cutoff14d = Math.floor((now - 14 * 86400 * 1000) / 1000);
    const cutoff30d = Math.floor((now - 30 * 86400 * 1000) / 1000);

    const velocityResult = await drizzleDb.all(sql`
      SELECT
        o.id, o.name, o.in_stock, o.min_threshold,
        o.in_stock - o.min_threshold as stock_above_min,
        COALESCE(SUM(CASE WHEN il.change_type IN ('- sold b2c','- sold b2b') AND il.created_at > ${cutoff7d}  THEN il.quantity ELSE 0 END), 0) as sold_7d,
        COALESCE(SUM(CASE WHEN il.change_type IN ('- sold b2c','- sold b2b') AND il.created_at > ${cutoff14d} THEN il.quantity ELSE 0 END), 0) as sold_14d,
        COALESCE(SUM(CASE WHEN il.change_type IN ('- sold b2c','- sold b2b') AND il.created_at > ${cutoff30d} THEN il.quantity ELSE 0 END), 0) as sold_30d
      FROM objects o
      LEFT JOIN inventory_log il ON il.object_id = o.id
      GROUP BY o.id
    `);
    const velocityItems = (velocityResult || []).map((r: any) => ({
      ...r,
      stock_count: r.in_stock, // legacy alias for UI
      daily_velocity: r.sold_30d > 0 ? Math.round((r.sold_30d / 30) * 100) / 100 : 0,
      days_until_stockout: r.sold_30d > 0 ? Math.round((r.in_stock / (r.sold_30d / 30)) * 10) / 10 : 999,
    }));

    // Daily stock flow from inventory_log — created_at is already seconds
    const stockFlowResult = await drizzleDb.all(sql`
      SELECT
        DATE(created_at, 'unixepoch') as day,
        SUM(CASE WHEN change_type = '+ printed'     THEN quantity ELSE 0 END) as produced,
        SUM(CASE WHEN change_type = '- sold b2c'    THEN quantity ELSE 0 END) as sold_b2c,
        SUM(CASE WHEN change_type = '- sold b2b'    THEN quantity ELSE 0 END) as sold_b2b,
        SUM(CASE WHEN change_type = '- stock count' THEN quantity ELSE 0 END) as removed
      FROM inventory_log
      WHERE created_at > ${cutoff30d}
      GROUP BY day
      ORDER BY day ASC
    `);
    const stockFlow = (stockFlowResult || []) as {
      day: string; produced: number; sold_b2c: number; sold_b2b: number; removed: number;
    }[];

    const stockFlowByDay = new Map(stockFlow.map((r) => [r.day, r]));
    const dailyStockFlow = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now - (29 - i) * 24 * 60 * 60 * 1000);
      const dayStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const row = stockFlowByDay.get(dayStr);
      return {
        label,
        produced: row?.produced || 0,
        sold_b2c: row?.sold_b2c || 0,
        sold_b2b: row?.sold_b2b || 0,
        removed: row?.removed || 0,
      };
    });

    const totalStock = inventoryItems.reduce((s, i) => s + (i.in_stock || 0), 0);
    const lowStockItems = velocityItems.filter((i: any) => i.stock_count < i.min_threshold);
    const criticalItems = velocityItems.filter((i: any) => i.days_until_stockout < 7 && i.days_until_stockout !== 999);
    const totalSold30d = velocityItems.reduce((s: number, i: any) => s + i.sold_30d, 0);
    const totalProduced30d = dailyStockFlow.reduce((s, d) => s + d.produced, 0);

    inventoryStats = {
      items: velocityItems,
      totalStock,
      lowStockCount: lowStockItems.length,
      criticalItems,
      totalSold30d,
      totalProduced30d,
      dailyStockFlow,
    };
  } catch (e) {
    console.error('Failed to load inventory stats:', e);
  }

  // ── Shopify stats ─────────────────────────────────────────────────────────
  // shopify_orders columns: order_id, order_number, processed_at, total_items
  // (no `status` and no `shopify_sync` table — those were removed in the schema cleanup)
  let shopifyStats = null;
  try {
    const cutoff30s = Math.floor((now - 30 * 86400 * 1000) / 1000);

    const ordersResult = (await drizzleDb.get(sql`
      SELECT
        COUNT(*) as total_orders,
        SUM(total_items) as total_items,
        MIN(processed_at) as first_order,
        MAX(processed_at) as last_order
      FROM shopify_orders
    `)) as { total_orders: number; total_items: number; first_order: number; last_order: number } | undefined;

    const recentOrders = (await drizzleDb.all(sql`
      SELECT order_id, order_number, processed_at, total_items
      FROM shopify_orders
      ORDER BY processed_at DESC
      LIMIT 15
    `)) as { order_id: string; order_number: string; processed_at: number; total_items: number }[];

    const dailyOrdersResult = (await drizzleDb.all(sql`
      SELECT
        DATE(processed_at, 'unixepoch') as day,
        COUNT(*) as order_count,
        SUM(total_items) as items_count
      FROM shopify_orders
      WHERE processed_at > ${cutoff30s}
      GROUP BY day
      ORDER BY day ASC
    `)) as { day: string; order_count: number; items_count: number }[];

    const dailyOrdersMap = new Map(dailyOrdersResult.map((r) => [r.day, r]));
    const dailyOrders = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now - (29 - i) * 24 * 60 * 60 * 1000);
      const dayStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const row = dailyOrdersMap.get(dayStr);
      return { label, orders: row?.order_count || 0, items: row?.items_count || 0 };
    });

    shopifyStats = {
      totalOrders: ordersResult?.total_orders || 0,
      totalItems: ordersResult?.total_items || 0,
      firstOrder: ordersResult?.first_order ? ordersResult.first_order * 1000 : null,
      lastOrder: ordersResult?.last_order ? ordersResult.last_order * 1000 : null,
      recentOrders,
      dailyOrders,
      syncState: null, // shopify_sync table doesn't exist in the new schema
    };
  } catch (e) {
    console.error('Failed to load Shopify stats:', e);
  }

  return { printJobs: sortedJobs, printers, modules, spools, stats, inventoryStats, shopifyStats };
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_SETS = {
  'Klorolle Set': {
    emoji: '',
    components: [
      { name: 'klohalter', quantity: 1 },
      { name: 'stab', quantity: 1 },
      { name: 'stöpsel', quantity: 2 },
    ],
  },
  'Haken Set': {
    emoji: '',
    components: [
      { name: 'haken', quantity: 5, mustInclude: ['kleben', 'schrauben'] },
      { name: 'halter', quantity: 2, mustInclude: ['halter'] },
    ],
  },
} as const;

function calculateSetCosts(breakdown: any) {
  const sets: any = {};
  Object.entries(PRODUCT_SETS).forEach(([setName, setConfig]: [string, any]) => {
    sets[setName] = {
      emoji: setConfig.emoji,
      components: {},
      totalCost: 0,
      costPerSet: 0,
      possibleSets: Infinity,
    };

    setConfig.components.forEach((component: any) => {
      const matchingModules: any[] = [];
      Object.entries(breakdown).forEach(([_, categoryData]: [string, any]) => {
        if (categoryData.subcategories) {
          Object.values(categoryData.subcategories).forEach((subcatData: any) => {
            Object.entries(subcatData.modules).forEach(([moduleName, moduleData]: [string, any]) => {
              const lowerName = moduleName.toLowerCase();
              const matchesName = lowerName.includes(component.name.toLowerCase());
              const matchesIncludes =
                !component.mustInclude ||
                component.mustInclude.some((term: string) => lowerName.includes(term.toLowerCase()));
              if (matchesName && matchesIncludes) matchingModules.push({ moduleName, ...moduleData });
            });
          });
        }
        Object.entries(categoryData.modules || {}).forEach(([moduleName, moduleData]: [string, any]) => {
          const lowerName = moduleName.toLowerCase();
          const matchesName = lowerName.includes(component.name.toLowerCase());
          const matchesIncludes =
            !component.mustInclude ||
            component.mustInclude.some((term: string) => lowerName.includes(term.toLowerCase()));
          if (matchesName && matchesIncludes) matchingModules.push({ moduleName, ...moduleData });
        });
      });

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
        possibleSets: objectsProduced,
      };
      sets[setName].totalCost += componentCost;
      sets[setName].possibleSets = Math.min(sets[setName].possibleSets, objectsProduced);
    });

    if (sets[setName].possibleSets > 0) {
      sets[setName].costPerSet = sets[setName].totalCost / sets[setName].possibleSets;
    }
  });
  return sets;
}

function emptyStats() {
  return {
    totalPrints: 0, successfulPrints: 0, failedPrints: 0, pendingPrints: 0,
    totalMaterialUsed: 0, totalHours: 0,
    last30Days: [], dailyPrintCounts: [], dailyMaterialUsage: [],
    failureReasons: [], topModules: [], printerUtilization: [],
    moduleBreakdown: { last30Days: {}, thisMonth: {}, last90Days: {}, thisWeek: {}, last7Days: {} },
    setCosts: { last30Days: {}, thisMonth: {}, last90Days: {}, thisWeek: {}, last7Days: {} },
    utilizationScores: null as any,
    failureAnalysis: null as any,
    spoolUsage: { last30Days: [], thisMonth: [], last90Days: [], thisWeek: [], last7Days: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions — spool edit/delete from the spools tab
// ─────────────────────────────────────────────────────────────────────────────

export const actions: Actions = {
  updateSpool: async ({ platform, request }) => {
    // Spool brand/material/color/cost live on the preset now — those fields are
    // immutable on the physical spool. Only remaining_weight is editable here.
    const database = platform?.env?.DB;
    if (!database) return { error: 'Database not available' };
    const drizzleDb = getDb(database);
    const formData = await request.formData();
    const spoolId = Number(formData.get('spoolId'));
    const remaining_weight = Number(formData.get('remaining_weight'));
    try {
      await drizzleDb.run(sql`
        UPDATE spools
        SET remaining_weight = ${remaining_weight},
            updated_at = ${Math.floor(Date.now() / 1000)}
        WHERE id = ${spoolId}
      `);
      return { success: true, message: 'Spool updated' };
    } catch (error) {
      console.error('Error updating spool:', error);
      return { error: 'Failed to update spool' };
    }
  },

  deleteSpool: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { error: 'Database not available' };
    const drizzleDb = getDb(database);
    const formData = await request.formData();
    const spoolId = Number(formData.get('spoolId'));
    try {
      // Check the new per-slot loaded table, not the removed printer.loaded_spool_id column.
      const loadedPrinter = await drizzleDb.get<{ id: number; name: string }>(sql`
        SELECT p.id, p.name
        FROM printer_loaded_spools pls
        JOIN printers p ON pls.printer_id = p.id
        WHERE pls.spool_id = ${spoolId}
        LIMIT 1
      `);
      if (loadedPrinter) {
        return { error: `Cannot delete spool - it's currently loaded on ${loadedPrinter.name}` };
      }
      await drizzleDb.run(sql`DELETE FROM spools WHERE id = ${spoolId}`);
      return { success: true, message: 'Spool deleted' };
    } catch (error) {
      console.error('Error deleting spool:', error);
      return { error: 'Failed to delete spool' };
    }
  },
};
