import type { GridCell, SetupStep, ServerResponse } from '../types';
import type { TenantContext } from './context';
import { getDefaultGridPreset, updateGridPreset } from './grid';
import { getAllPrinters } from './printers';

/**
 * Guided onboarding: a new workspace's default grid starts as `setup` cells
 * (see createStarterGrid in workspaces.ts). Finishing a setup step transforms
 * the grid — the setup cell becomes the real thing. Idempotent: if the setup
 * cell is already gone, this is a no-op.
 *
 * Transformations:
 *   printers  → setup cell + empty cells become this workspace's printers
 *   spools    → setup cell becomes the spools card
 *   modules   → setup cell becomes the modules card
 *   inventory → setup cell becomes the inventory card
 *   stats     → setup cell becomes the stats card
 */
export async function completeSetupStep(
  ctx: TenantContext,
  step: SetupStep,
): Promise<ServerResponse> {
  const preset = await getDefaultGridPreset(ctx);
  if (!preset) return { success: true, message: 'No default grid — nothing to transform' };

  let cells: GridCell[];
  try {
    cells = JSON.parse(preset.grid_config) as GridCell[];
  } catch {
    return { success: false, error: 'Default grid config is corrupt' };
  }

  const setupIdx = cells.findIndex((c) => c.type === 'setup' && c.step === step);
  if (setupIdx === -1) return { success: true, message: 'Setup step already completed' };

  if (step === 'printers') {
    const printers = await getAllPrinters(ctx);
    // Setup cell first, then empty cells (in order) get one printer each.
    // Printers beyond the available cells stay unplaced — editable later in
    // Settings → Dashboard.
    const slots = [
      setupIdx,
      ...cells.flatMap((c, i) => (c.type === 'empty' ? [i] : [])),
    ];
    slots.forEach((cellIdx, i) => {
      cells[cellIdx] =
        i < printers.length
          ? { type: 'printer', printerId: Number(printers[i].id) }
          : cells[cellIdx];
    });
    // Skipped with zero printers: clear the setup cell so the card goes away.
    if (printers.length === 0) cells[setupIdx] = { type: 'empty' };
  } else {
    // 1:1 — each setup cell becomes the card it was teaching.
    const target = { spools: 'spools', modules: 'modules', inventory: 'inventory', stats: 'stats' } as const;
    cells[setupIdx] = { type: target[step] };
  }

  return updateGridPreset(ctx, preset.id, { grid_config: cells });
}

/** True while the default grid still contains any guided-setup cells. */
export async function hasPendingSetup(ctx: TenantContext): Promise<boolean> {
  const preset = await getDefaultGridPreset(ctx);
  if (!preset) return false;
  try {
    return (JSON.parse(preset.grid_config) as GridCell[]).some((c) => c.type === 'setup');
  } catch {
    return false;
  }
}
