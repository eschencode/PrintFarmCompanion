// Per-workspace Pi HTTP bridge config. Replaces the old global PI_TUNNEL_URL /
// PI_SECRET env vars (single-tenant leftover) — each workspace addresses its
// own Pi. There is intentionally NO env fallback: a shared tunnel would resolve
// every unconfigured workspace to one operator's printers. Unconfigured → null.
//
// pi_secret is encrypted-at-rest (AES-256-GCM, "v1:" prefix) via crypto.ts.
// getPiConfig is the single decrypt seam every api/pi/* endpoint reads through.

import { sql } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "./crypto";
import type { TenantContext } from "./context";

export type PiConfig = { tunnelUrl: string; piSecret: string };
export type PiConfigSummary = { tunnelUrl: string; hasSecret: boolean } | null;

/** Full config (secret decrypted) for outbound Pi calls. Null if unconfigured. */
export async function getPiConfig(ctx: TenantContext): Promise<PiConfig | null> {
  const row = await ctx.db.get<{ tunnel_url: string; pi_secret: string }>(
    sql`SELECT tunnel_url, pi_secret FROM pi_settings WHERE workspace_id = ${ctx.workspaceId} LIMIT 1`,
  );
  if (!row?.tunnel_url || !row?.pi_secret) return null;
  const piSecret = await decryptSecret(row.pi_secret, ctx.encryptionKey);
  return { tunnelUrl: row.tunnel_url, piSecret };
}

/** For the settings load — URL + whether a secret is set. Never returns the secret. */
export async function getPiConfigSummary(ctx: TenantContext): Promise<PiConfigSummary> {
  const row = await ctx.db.get<{ tunnel_url: string; pi_secret: string }>(
    sql`SELECT tunnel_url, pi_secret FROM pi_settings WHERE workspace_id = ${ctx.workspaceId} LIMIT 1`,
  );
  if (!row) return null;
  return { tunnelUrl: row.tunnel_url, hasSecret: !!row.pi_secret };
}

/** Reject anything that isn't a plain https URL — the secret is sent to this host. */
function normalizeTunnelUrl(raw: string): string {
  const url = new URL(raw); // throws on garbage
  if (url.protocol !== "https:") throw new Error("Tunnel URL must be https");
  // Store without a trailing slash so `${tunnelUrl}/print` is well-formed.
  return url.origin + url.pathname.replace(/\/$/, "");
}

export type SavePiResult = { success: boolean; error?: string };

export async function savePiConfig(
  ctx: TenantContext,
  input: { tunnelUrl: string; piSecret: string },
): Promise<SavePiResult> {
  if (!ctx.encryptionKey) {
    return { success: false, error: "ENCRYPTION_KEY not configured on the server" };
  }
  let tunnelUrl: string;
  try {
    tunnelUrl = normalizeTunnelUrl(input.tunnelUrl.trim());
  } catch {
    return { success: false, error: "Tunnel URL must be a valid https:// URL" };
  }

  // Freshly-entered secret → encrypt. Blank → reuse the stored ciphertext.
  const existing = await ctx.db.get<{ pi_secret: string }>(
    sql`SELECT pi_secret FROM pi_settings WHERE workspace_id = ${ctx.workspaceId} LIMIT 1`,
  );
  const secretToSave = input.piSecret.trim()
    ? await encryptSecret(input.piSecret.trim(), ctx.encryptionKey)
    : existing?.pi_secret;
  if (!secretToSave) return { success: false, error: "Pi secret is required" };

  const now = Math.floor(Date.now() / 1000);
  await ctx.db.run(sql`
    INSERT INTO pi_settings (workspace_id, tunnel_url, pi_secret, updated_at)
    VALUES (${ctx.workspaceId}, ${tunnelUrl}, ${secretToSave}, ${now})
    ON CONFLICT (workspace_id) DO UPDATE SET
      tunnel_url = excluded.tunnel_url,
      pi_secret  = excluded.pi_secret,
      updated_at = excluded.updated_at
  `);
  return { success: true };
}

/** Hit the Pi's secret-gated /health endpoint and report a readable result. */
export async function testPiConnection(ctx: TenantContext): Promise<SavePiResult> {
  const config = await getPiConfig(ctx);
  if (!config) return { success: false, error: "Pi not configured for this workspace" };
  try {
    const resp = await fetch(`${config.tunnelUrl}/health`, {
      headers: { "x-pi-secret": config.piSecret },
      signal: AbortSignal.timeout(8000),
    });
    if (resp.status === 401 || resp.status === 403) {
      return { success: false, error: "Pi rejected the secret (check the shared secret)" };
    }
    if (!resp.ok) return { success: false, error: `Pi returned HTTP ${resp.status}` };
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "timed out" : `${e}`;
    return { success: false, error: `Pi unreachable: ${msg}` };
  }
}
