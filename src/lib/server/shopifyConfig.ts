import type { D1Database } from '@cloudflare/workers-types';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';
import { decryptSecret } from '$lib/server/crypto';

export type ShopifyConfig = {
  storeDomain: string;
  accessToken: string;
  source: 'db' | 'env';
};

export type ShopifyConfigSummary = {
  storeDomain: string | null;
  hasToken: boolean;
  source: 'db' | 'env' | null;
};

type ShopifyEnv = {
  SHOPIFY_STORE_DOMAIN?: string;
  SHOPIFY_ACCESS_TOKEN?: string;
  ENCRYPTION_KEY?: string;
};

export async function getShopifyConfig(
  database?: D1Database,
  env?: ShopifyEnv
): Promise<ShopifyConfig | null> {
  // MULTI-USER (Phase 3): scope to the current workspace —
  // `WHERE workspace_id = ?` and drop the ORDER BY/LIMIT singleton assumption.
  if (database) {
    const drizzleDb = getDb(database);
    const row = await drizzleDb.get<{ store_domain: string; access_token: string }>(
      sql`SELECT store_domain, access_token FROM shopify_settings ORDER BY updated_at DESC LIMIT 1`
    );
    if (row?.store_domain && row?.access_token) {
      const accessToken = await decryptSecret(row.access_token, env?.ENCRYPTION_KEY ?? '');
      return { storeDomain: row.store_domain, accessToken, source: 'db' };
    }
  }

  if (env?.SHOPIFY_STORE_DOMAIN && env?.SHOPIFY_ACCESS_TOKEN) {
    return {
      storeDomain: env.SHOPIFY_STORE_DOMAIN,
      accessToken: env.SHOPIFY_ACCESS_TOKEN,
      source: 'env',
    };
  }

  return null;
}

export async function getShopifyConfigSummary(
  database?: D1Database,
  env?: ShopifyEnv
): Promise<ShopifyConfigSummary> {
  // MULTI-USER (Phase 3): scope to the current workspace (see getShopifyConfig).
  // Never returns the token itself — only whether one exists.
  if (database) {
    const drizzleDb = getDb(database);
    const row = await drizzleDb.get<{ store_domain: string; access_token: string }>(
      sql`SELECT store_domain, access_token FROM shopify_settings ORDER BY updated_at DESC LIMIT 1`
    );
    if (row?.store_domain || row?.access_token) {
      return {
        storeDomain: row?.store_domain ?? null,
        hasToken: !!row?.access_token,
        source: 'db',
      };
    }
  }

  if (env?.SHOPIFY_STORE_DOMAIN || env?.SHOPIFY_ACCESS_TOKEN) {
    return {
      storeDomain: env?.SHOPIFY_STORE_DOMAIN ?? null,
      hasToken: !!env?.SHOPIFY_ACCESS_TOKEN,
      source: 'env',
    };
  }

  return { storeDomain: null, hasToken: false, source: null };
}
