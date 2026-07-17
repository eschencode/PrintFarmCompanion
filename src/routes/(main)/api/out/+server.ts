import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireCtx } from '$lib/server/context';
import { getSpoolPresetById } from '$lib/server/spools';
import {
  affiliateConfig,
  getStoreRegion,
  resolveBuyLink,
  logAffiliateClick,
} from '$lib/server/affiliate';

/**
 * GET /api/out?presetId=<id>&placement=<where>
 *
 * Outbound affiliate buy-link. Resolves the link for a spool preset, logs the
 * click, and 302s to the vendor. All buy buttons point here so we get click
 * analytics and can swap networks/tags without touching the UI.
 * See docs/affiliate-monetization.md.
 */
export const GET: RequestHandler = async ({ url, locals, platform }) => {
  const ctx = requireCtx(locals);

  const presetId = Number(url.searchParams.get('presetId'));
  const placement = url.searchParams.get('placement') ?? 'unknown';
  if (!presetId) throw error(400, 'presetId is required');

  const preset = await getSpoolPresetById(ctx, presetId);
  if (!preset) throw error(404, 'Preset not found');

  const region = await getStoreRegion(ctx);
  const link = await resolveBuyLink(
    ctx,
    { brand: preset.brand, material: preset.material, color: preset.color, catalog_item_id: preset.catalog_item_id },
    region,
    affiliateConfig(platform),
  );

  await logAffiliateClick(ctx, {
    catalogItemId: link.catalogItemId,
    presetId,
    placement,
    region,
    targetUrl: link.url,
  });

  throw redirect(302, link.url);
};
