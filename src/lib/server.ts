import type { D1Database } from '@cloudflare/workers-types';

// Printers
export async function getAllPrinters(db: D1Database) {
  const result = await db.prepare('SELECT * FROM printers').all();
  return result.results || [];
}

export async function getPrinterById(db: D1Database, id: number) {
  const result = await db.prepare('SELECT * FROM printers WHERE id = ?').bind(id).first();
  return result;
}

export async function updatePrinterStatus(db: D1Database, id: number, status: string) {
  await db.prepare('UPDATE printers SET status = ? WHERE id = ?').bind(status, id).run();
}

// Spools
export async function getAllSpools(db: D1Database) {
  const result = await db.prepare('SELECT * FROM spools').all();
  return result.results || [];
}

export async function getSpoolById(db: D1Database, id: number) {
  const result = await db.prepare('SELECT * FROM spools WHERE id = ?').bind(id).first();
  return result;
}

export async function updateSpoolWeight(db: D1Database, id: number, remainingWeight: number) {
  await db.prepare('UPDATE spools SET remaining_weight = ? WHERE id = ?').bind(remainingWeight, id).run();
}

export async function createSpool(db: D1Database, spool: {
  presetId?: number | null;
  brand: string;
  material: string;
  color?: string | null;
  initialWeight: number;
  remainingWeight: number;
  cost?: number | null;
}) {
  const result = await db.prepare(`
    INSERT INTO spools (preset_id, brand, material, color, initial_weight, remaining_weight, cost)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    spool.presetId ?? null,
    spool.brand,
    spool.material,
    spool.color ?? null,
    spool.initialWeight,
    spool.remainingWeight,
    spool.cost ?? null
  ).run();
  
  return result;
}



// Print Modules
export async function getAllPrintModules(db: D1Database) {
  const result = await db.prepare('SELECT * FROM print_modules').all();
  return result.results || [];
}

// Print Jobs
export async function createPrintJob(db: D1Database, job: {
  name: string;
  moduleId: number;
  printerId: number;
  spoolId: number;
  plannedWeight: number;
}) {
  const result = await db.prepare(`
    INSERT INTO print_jobs (name, module_id, printer_id, spool_id, planned_weight)
    VALUES (?, ?, ?, ?, ?)
  `).bind(job.name, job.moduleId, job.printerId, job.spoolId, job.plannedWeight).run();
  
  return result;
}

export async function getRecentPrintJobs(db: D1Database, limit = 10) {
  const result = await db.prepare(`
    SELECT * FROM print_jobs 
    ORDER BY start_time DESC 
    LIMIT ?
  `).bind(limit).all();
  
  return result.results || [];
}