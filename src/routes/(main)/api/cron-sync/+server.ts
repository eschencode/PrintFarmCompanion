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

  // Every workspace that has Shopify configured gets synced with its own config.
  const workspaces = await getDb(DB).all<{ workspace_id: number }>(
    sql`SELECT workspace_id FROM shopify_settings`
  );
  if (!workspaces || workspaces.length === 0) {
    return json({ success: true, synced: 0, results: [] });
  }

  const results: { workspaceId: number; success: boolean; result?: unknown; error?: string }[] = [];
  for (const { workspace_id } of workspaces) {
    try {
      const config = await getShopifyConfig(DB, platform.env, workspace_id);
      if (!config) {
        results.push({ workspaceId: workspace_id, success: false, error: 'Config not resolvable' });
        continue;
      }
      const client = new ShopifyClient(config.storeDomain, config.accessToken);
      const syncService = new ShopifySyncService(DB, workspace_id, client);
      const result = await syncService.sync(false);
      results.push({ workspaceId: workspace_id, success: true, result });
    } catch (err) {
      results.push({ workspaceId: workspace_id, success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return json({ success: true, synced: results.filter((r) => r.success).length, results });
};