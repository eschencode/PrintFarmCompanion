import { sql } from "drizzle-orm";
import type { TenantContext } from "./context";
import type { PrinterEvent } from "$lib/types";

export type PrinterEventType =
  | "spool_loaded"
  | "spool_unloaded"
  | "print_started"
  | "print_finished"
  | "marked_successful"
  | "marked_failed"
  | "outcome_changed"
  | "print_deleted";

/**
 * Append a row to the printer_events audit trail. Best-effort: history must
 * never fail the domain mutation that emitted it, so errors are swallowed
 * (logged) instead of thrown.
 */
export async function logPrinterEvent(
  ctx: TenantContext,
  printerId: number,
  eventType: PrinterEventType,
  detail: Record<string, unknown> | null = null,
  printJobId: number | null = null,
): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    await ctx.db.run(sql`
      INSERT INTO printer_events (workspace_id, printer_id, print_job_id, event_type, detail, created_at)
      VALUES (${ctx.workspaceId}, ${printerId}, ${printJobId}, ${eventType}, ${detail ? JSON.stringify(detail) : null}, ${now})
    `);
  } catch (error) {
    console.error("Error logging printer event:", eventType, error);
  }
}

/**
 * Newest-first events for one printer. `before` (unix seconds) enables keyset
 * pagination / scoping to the job window the history modal has loaded.
 */
export async function getPrinterEvents(
  ctx: TenantContext,
  printerId: number,
  limit = 100,
  before?: number,
): Promise<PrinterEvent[]> {
  const rows = await ctx.db.all<PrinterEvent>(sql`
    SELECT id, printer_id, print_job_id, event_type, detail, created_at
    FROM printer_events
    WHERE workspace_id = ${ctx.workspaceId} AND printer_id = ${printerId}
      ${before !== undefined ? sql`AND created_at < ${before}` : sql``}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `);
  return rows ?? [];
}
