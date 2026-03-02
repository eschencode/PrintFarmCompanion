import { ShopifyClient, ShopifySyncService } from '$lib/shopify';
import { error, json } from '@sveltejs/kit';

export const GET = async ({ request, platform }) => {
  // 1. Check platform and env
  if (!platform?.env) {
    throw error(500, 'Platform environment not available');
  }

  // 2. Security Check: Only allow requests with a specific Secret Header
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${platform.env.CRON_SECRET}`) {
    throw error(401, 'Unauthorized');
  }

  // 3. Check required env vars
  const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, DB } = platform.env;
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN || !DB) {
    throw error(500, 'Missing required environment variables');
  }

  try {
    const client = new ShopifyClient(
      SHOPIFY_STORE_DOMAIN,
      SHOPIFY_ACCESS_TOKEN
    );
    const syncService = new ShopifySyncService(DB, client);

    const result = await syncService.sync(false);
    return json({ success: true, result });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
};