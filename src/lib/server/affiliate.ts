import { sql } from 'drizzle-orm';
import type { SpoolPreset } from '../types';
import type { TenantContext } from './context';

// Affiliate buy-links, Phase 1. See docs/affiliate-monetization.md.

export interface CatalogItem {
  id: number;
  vendor: string;
  /** 'filament' (matches spool presets), 'part' (spare parts, keyed by
   *  part_category), or 'consumable' (plates, IPA, glue — shop section). */
  kind: string;
  part_category: string | null;
  /** Display label for parts; NULL on filament rows. */
  name: string | null;
  brand: string;
  material: string;
  color: string | null;
  color_hex: string | null;
  weight: number | null;
  sku: string | null;
  url_us: string | null;
  url_eu: string | null;
  url_uk: string | null;
  image: string | null;
  active: number;
}

/** Tags/IDs from Worker env. Empty → links fall back to plain (non-affiliate) URLs. */
export interface AffiliateConfig {
  amazonTagUs: string;
  amazonTagDe: string;
  bambuAwinAffid: string;
}

export function affiliateConfig(platform: App.Platform | undefined): AffiliateConfig {
  const env = platform?.env as Record<string, string | undefined> | undefined;
  return {
    amazonTagUs: env?.AMAZON_TAG_US ?? '',
    amazonTagDe: env?.AMAZON_TAG_DE ?? '',
    bambuAwinAffid: env?.BAMBU_AWIN_AFFID ?? '',
  };
}

export type Region = 'us' | 'eu' | 'uk';

function normalizeRegion(r: string | null | undefined): Region {
  return r === 'eu' || r === 'uk' ? r : 'us';
}

export interface BuyLink {
  url: string;
  catalogItemId: number | null;
  vendor: string; // 'bambu' | 'amazon'
}

/** Best catalog match for a preset: same brand+material, color improves rank. */
async function matchCatalogItem(
  ctx: TenantContext,
  preset: Pick<SpoolPreset, 'brand' | 'material' | 'color'>,
): Promise<CatalogItem | null> {
  // Brand names drift across sources ("Bambu" vs "Bambu Lab"), so match on a
  // substring either way; rank exact brand, then exact color, first.
  const brand = preset.brand.toLowerCase();
  const row = await ctx.db.get<CatalogItem>(sql`
    SELECT * FROM catalog_items
    WHERE active = 1 AND kind = 'filament'
      AND LOWER(material) = LOWER(${preset.material})
      AND (LOWER(brand) LIKE '%' || ${brand} || '%' OR ${brand} LIKE '%' || LOWER(brand) || '%')
    ORDER BY (LOWER(brand) = ${brand}) DESC,
             (LOWER(COALESCE(color, '')) = LOWER(${preset.color ?? ''})) DESC
    LIMIT 1
  `);
  return row ?? null;
}

function catalogUrlForRegion(item: CatalogItem, region: Region): string | null {
  if (region === 'eu') return item.url_eu ?? item.url_us ?? item.url_uk;
  if (region === 'uk') return item.url_uk ?? item.url_eu ?? item.url_us;
  return item.url_us ?? item.url_eu ?? item.url_uk;
}

const AMAZON_TLD: Record<Region, string> = { us: 'com', eu: 'de', uk: 'co.uk' };

function amazonSearchUrl(
  preset: Pick<SpoolPreset, 'brand' | 'material' | 'color'>,
  region: Region,
  config: AffiliateConfig,
): string {
  const q = [preset.brand, preset.material, preset.color, 'filament']
    .filter(Boolean)
    .join(' ');
  const tag = region === 'us' ? config.amazonTagUs : config.amazonTagDe;
  const url = new URL(`https://www.amazon.${AMAZON_TLD[region]}/s`);
  url.searchParams.set('k', q);
  if (tag) url.searchParams.set('tag', tag);
  return url.toString();
}

/** Wrap a vendor URL with an affiliate deep link/tag when configured; else no-op. */
function withAffiliate(url: string, vendor: string, region: Region, config: AffiliateConfig): string {
  if (vendor === 'bambu' && config.bambuAwinAffid) {
    // Awin deep link: awinmid 46345 = Bambu Lab.
    return `https://www.awin1.com/cread.php?awinmid=46345&awinaffid=${config.bambuAwinAffid}&ued=${encodeURIComponent(url)}`;
  }
  if (vendor === 'amazon') {
    const tag = region === 'us' ? config.amazonTagUs : config.amazonTagDe;
    if (tag) {
      const u = new URL(url);
      u.searchParams.set('tag', tag);
      return u.toString();
    }
  }
  return url;
}

/**
 * Resolve the outbound buy link for a preset:
 *   1. explicit catalog_item_id (Phase 2) → that item's regional URL
 *   2. fuzzy brand+material match → catalog item's regional URL
 *   3. miss → Amazon search for the region
 * Affiliate wrapping is applied last (no-op when env tags are unset).
 */
export async function resolveBuyLink(
  ctx: TenantContext,
  preset: Pick<SpoolPreset, 'brand' | 'material' | 'color'> & { catalog_item_id?: number | null },
  regionRaw: string | null | undefined,
  config: AffiliateConfig,
): Promise<BuyLink> {
  const region = normalizeRegion(regionRaw);

  let item: CatalogItem | null = null;
  if (preset.catalog_item_id) {
    item = (await ctx.db.get<CatalogItem>(
      sql`SELECT * FROM catalog_items WHERE id = ${preset.catalog_item_id} AND active = 1`,
    )) ?? null;
  }
  if (!item) item = await matchCatalogItem(ctx, preset);

  if (item) {
    const url = catalogUrlForRegion(item, region);
    if (url) {
      return { url: withAffiliate(url, item.vendor, region, config), catalogItemId: item.id, vendor: item.vendor };
    }
  }

  return {
    url: amazonSearchUrl(preset, region, config),
    catalogItemId: null,
    vendor: 'amazon',
  };
}

/** Active filament catalog for the preset picker (global catalog, unscoped). */
export async function getCatalogItems(ctx: TenantContext): Promise<CatalogItem[]> {
  const rows = await ctx.db.all<CatalogItem>(
    sql`SELECT * FROM catalog_items WHERE active = 1 AND kind = 'filament' ORDER BY brand, material, color`,
  );
  return rows ?? [];
}

/** Everything shoppable that isn't filament — spare parts + consumables (plates, IPA…). */
export async function getShopCatalog(ctx: TenantContext): Promise<CatalogItem[]> {
  const rows = await ctx.db.all<CatalogItem>(
    sql`SELECT * FROM catalog_items WHERE active = 1 AND kind != 'filament' ORDER BY kind, name`,
  );
  return rows ?? [];
}

/** Full spare-part catalog. Client filters by partCategoriesForHms(broken_hms_code). */
export async function getSparePartCatalog(ctx: TenantContext): Promise<CatalogItem[]> {
  const rows = await ctx.db.all<CatalogItem>(
    sql`SELECT * FROM catalog_items WHERE active = 1 AND kind = 'part' ORDER BY part_category, name`,
  );
  return rows ?? [];
}

export async function getCatalogItemById(ctx: TenantContext, id: number): Promise<CatalogItem | null> {
  const row = await ctx.db.get<CatalogItem>(
    sql`SELECT * FROM catalog_items WHERE id = ${id} AND active = 1`,
  );
  return row ?? null;
}

/** Direct link for a known catalog item (spare parts, Phase 3). Null if no URL. */
export function resolveCatalogItemLink(
  item: CatalogItem,
  regionRaw: string | null | undefined,
  config: AffiliateConfig,
): BuyLink | null {
  const region = normalizeRegion(regionRaw);
  const url = catalogUrlForRegion(item, region);
  if (!url) return null;
  return { url: withAffiliate(url, item.vendor, region, config), catalogItemId: item.id, vendor: item.vendor };
}

export async function getStoreRegion(ctx: TenantContext): Promise<string> {
  const row = await ctx.db.get<{ store_region: string }>(
    sql`SELECT store_region FROM workspaces WHERE id = ${ctx.workspaceId}`,
  );
  return row?.store_region ?? 'us';
}

export async function logAffiliateClick(
  ctx: TenantContext,
  click: {
    catalogItemId: number | null;
    presetId: number | null;
    placement: string;
    region: string;
    targetUrl: string;
  },
): Promise<void> {
  await ctx.db.run(sql`
    INSERT INTO affiliate_clicks (workspace_id, catalog_item_id, preset_id, placement, region, target_url, created_at)
    VALUES (${ctx.workspaceId}, ${click.catalogItemId}, ${click.presetId}, ${click.placement}, ${click.region}, ${click.targetUrl}, ${Math.floor(Date.now() / 1000)})
  `);
}
