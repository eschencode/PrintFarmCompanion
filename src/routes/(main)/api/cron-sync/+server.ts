import { ShopifyClient, ShopifySyncService } from '$lib/shopify';
import { getShopifyConfig } from '$lib/server/shopifyConfig';
import { getDb } from '$lib/db';
import { sql } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Constant-time string comparison to avoid leaking the secret via timing.
function safeEqual(a: string | null, b: string): boolean {
  if (a === null || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export const GET: RequestHandler = async ({ request, platform }) => {
  // 1. Check platform and env
  if (!platform?.env) {
    throw error(500, 'Platform environment not available');
  }

  // 2. Security Check: Only allow requests with a specific Secret Header
  const env = platform.env;
  if (!env.CRON_SECRET) {
    throw error(500, 'CRON_SECRET not configured');
  }
  const authHeader = request.headers.get('Authorization');
  if (!safeEqual(authHeader, `Bearer ${env.CRON_SECRET}`)) {
    throw error(401, 'Unauthorized');
  }

  // 3. Check required env vars
  const { DB } = platform.env;
  if (!DB) {
    throw error(500, 'Missing database binding');
  }

  const config = await getShopifyConfig(DB, platform.env);
  if (!config) {
    throw error(500, 'Shopify not configured');
  }

  // TODO(Phase 3, group 7): shopify_settings is still a single shared row, so
  // there's one config to sync. Once it's per-workspace, loop over every
  // workspace's config and sync each with its own workspaceId. For now resolve
  // the (single) workspace that owns inventory writes.
  const ws = await getDb(DB).get<{ id: number }>(sql`SELECT id FROM workspaces ORDER BY id LIMIT 1`);
  if (!ws) {
    throw error(500, 'No workspace to sync into');
  }

  try {
    const client = new ShopifyClient(config.storeDomain, config.accessToken);
    const syncService = new ShopifySyncService(DB, ws.id, client);

    const result = await syncService.sync(false);
    return json({ success: true, result });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
};