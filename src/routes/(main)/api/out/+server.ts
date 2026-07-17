import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireCtx } from '$lib/server/context';
import { getSpoolPresetById } from '$lib/server/spools';
import {
  affiliateConfig,
  getStoreRegion,
  resolveBuyLink,
  resolveCatalogItemLink,
  getCatalogItemById,
  logAffiliateClick,
} from '$lib/server/affiliate';

/**
 * GET /api/out?presetId=<id>&placement=<where>   — spool-preset buy link
 * GET /api/out?itemId=<id>&placement=<where>     — direct catalog item (spare parts)
 *
 * Outbound affiliate buy-link. Resolves the link, logs the click, and 302s to
 * the vendor. All buy buttons point here so we get click analytics and can
 * swap networks/tags without touching the UI. See docs/affiliate-monetization.md.
 */
export const GET: RequestHandler = async ({ url, locals, platform }) => {
  const ctx = requireCtx(locals);

  const presetId = Number(url.searchParams.get('presetId'));
  const itemId = Number(url.searchParams.get('itemId'));
  const placement = url.searchParams.get('placement') ?? 'unknown';
  if (!presetId && !itemId) throw error(400, 'presetId or itemId is required');

  const region = await getStoreRegion(ctx);
  const config = affiliateConfig(platform);

  let link;
  if (itemId) {
    const item = await getCatalogItemById(ctx, itemId);
    if (!item) throw error(404, 'Catalog item not found');
    link = resolveCatalogItemLink(item, region, config);
    if (!link) throw error(404, 'No store URL for this item');
  } else {
    const preset = await getSpoolPresetById(ctx, presetId);
    if (!preset) throw error(404, 'Preset not found');
    link = await resolveBuyLink(
      ctx,
      { brand: preset.brand, material: preset.material, color: preset.color, catalog_item_id: preset.catalog_item_id },
      region,
      config,
    );
  }

  await logAffiliateClick(ctx, {
    catalogItemId: link.catalogItemId,
    presetId: presetId || null,
    placement,
    region,
    targetUrl: link.url,
  });

  throw redirect(302, link.url);
};
