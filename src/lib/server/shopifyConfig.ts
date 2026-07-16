import type { D1Database } from '@cloudflare/workers-types';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';
import { decryptSecret } from '$lib/server/crypto';

export type ShopifyConfig = {
  storeDomain: string;
  accessToken: string;
  source: 'db';
};

export type ShopifyConfigSummary = {
  storeDomain: string | null;
  hasToken: boolean;
  source: 'db' | null;
};

// Only the decryption key is read from env now. Shopify creds are strictly
// per-workspace (DB) — see the note in getShopifyConfig.
type ShopifyEnv = {
  ENCRYPTION_KEY?: string;
};

export async function getShopifyConfig(
  database?: D1Database,
  env?: ShopifyEnv,
  workspaceId?: number
): Promise<ShopifyConfig | null> {
  // Strictly per-workspace: config comes from the workspace's own row and
  // nowhere else. There is intentionally NO env fallback — a shared env token
  // would resolve every unconfigured workspace to one store, leaking that
  // store's data across tenants. Unconfigured → null.
  if (database && workspaceId) {
    const drizzleDb = getDb(database);
    const row = await drizzleDb.get<{ store_domain: string; access_token: string }>(
      sql`SELECT store_domain, access_token FROM shopify_settings WHERE workspace_id = ${workspaceId} LIMIT 1`
    );
    if (row?.store_domain && row?.access_token) {
      const accessToken = await decryptSecret(row.access_token, env?.ENCRYPTION_KEY ?? '');
      return { storeDomain: row.store_domain, accessToken, source: 'db' };
    }
  }

  return null;
}

export async function getShopifyConfigSummary(
  database?: D1Database,
  env?: ShopifyEnv,
  workspaceId?: number
): Promise<ShopifyConfigSummary> {
  // Per-workspace (see getShopifyConfig). Never returns the token itself, and —
  // like getShopifyConfig — no env fallback, so an unconfigured workspace reads
  // as unconfigured rather than surfacing another store's domain.
  if (database && workspaceId) {
    const drizzleDb = getDb(database);
    const row = await drizzleDb.get<{ store_domain: string; access_token: string }>(
      sql`SELECT store_domain, access_token FROM shopify_settings WHERE workspace_id = ${workspaceId} LIMIT 1`
    );
    if (row?.store_domain || row?.access_token) {
      return {
        storeDomain: row?.store_domain ?? null,
        hasToken: !!row?.access_token,
        source: 'db',
      };
    }
  }

  return { storeDomain: null, hasToken: false, source: null };
}
