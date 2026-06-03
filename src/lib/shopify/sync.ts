/**
 * Shopify Order Sync Logic
 * 
 * Fetches new orders from Shopify, maps SKUs to inventory items,
 * and deducts stock accordingly.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { ShopifyClient, type ShopifyOrder, type ShopifyVariantRow } from './client';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';

export interface SkuMapping {
    shopify_sku: string;
    object_id: number;
    quantity: number;
}

export interface SyncState {
    last_order_id: string | null;
    last_sync_at: number | null;
    orders_processed: number;
    items_deducted: number;
}

export interface SyncResult {
    success: boolean;
    ordersProcessed: number;
    itemsDeducted: number;
    skippedOrders: number;
    errors: string[];
    lastOrderId: number | null;
    // TEMP DEBUG — breakdown of where fetched orders went. Remove once diagnosed.
    debug?: {
        ordersInTable: number;
        fetched: number;
        cancelled: number;
        emptyLineItems: number;
        noSkuItems: number;
        unmappedItems: number;
        mappableItems: number;
        alreadyProcessed: number;
        sample: { id: number; cancelled_at: string | null; lineItems: number; firstSku: string | null } | null;
    };
}

export class ShopifySyncService {
    private db: D1Database;
    private client: ShopifyClient;

    constructor(db: D1Database, client: ShopifyClient) {
        this.db = db;
        this.client = client;
    }

    /**
     * Get current sync state.
     *
     * The shopify_sync table was removed in the schema cleanup. We now derive
     * last_order_id from the most recently processed shopify_orders row, and
     * leave the counter fields as zero (analytics live in shopify_orders /
     * inventory_log now). Sync is still idempotent because processOrder
     * checks isOrderProcessed before deducting anything.
     */
    async getSyncState(): Promise<SyncState> {
        const drizzleDb = getDb(this.db);
        const lastOrder = await drizzleDb.get<{ order_id: string; processed_at: number }>(
            sql`SELECT order_id, processed_at FROM shopify_orders ORDER BY processed_at DESC LIMIT 1`
        );
        return {
            last_order_id: lastOrder?.order_id ?? null,
            last_sync_at: lastOrder?.processed_at ?? null,
            orders_processed: 0,
            items_deducted: 0,
        };
    }

    /**
     * Refresh the SKU catalog cache (wipe + reinsert) from Shopify products.
     * SKUs aren't guaranteed unique per variant in Shopify, so we dedupe by sku
     * (first occurrence wins). The catalog is disposable — re-runnable any time.
     */
    async syncSkus(): Promise<{ success: boolean; count: number; error?: string }> {
        try {
            const variants = await this.client.getAllVariants();
            const bySku = new Map<string, ShopifyVariantRow>();
            for (const v of variants) if (!bySku.has(v.sku)) bySku.set(v.sku, v);

            const drizzleDb = getDb(this.db);
            const now = Math.floor(Date.now() / 1000);
            await drizzleDb.run(sql`DELETE FROM shopify_skus`);
            for (const v of bySku.values()) {
                await drizzleDb.run(sql`
                    INSERT INTO shopify_skus (sku, product_title, variant_title, product_id, variant_id, synced_at)
                    VALUES (${v.sku}, ${v.product_title}, ${v.variant_title}, ${v.product_id}, ${v.variant_id}, ${now})
                `);
            }
            return { success: true, count: bySku.size };
        } catch (err) {
            return { success: false, count: 0, error: String(err) };
        }
    }

    /**
     * Get all SKU mappings from database
     */
    async getSkuMappings(): Promise<Map<string, SkuMapping[]>> {
        const drizzleDb = getDb(this.db);
        const rows = await drizzleDb.all<SkuMapping>(
            sql`SELECT shopify_sku, object_id, quantity FROM shopify_sku_mapping`
        );

        const mappings = new Map<string, SkuMapping[]>();
        
        for (const row of rows ?? []) {
            const existing = mappings.get(row.shopify_sku) || [];
            existing.push(row);
            mappings.set(row.shopify_sku, existing);
        }

        return mappings;
    }

    /**
     * Check if an order has already been processed
     */
    async isOrderProcessed(orderId: number): Promise<boolean> {
        const drizzleDb = getDb(this.db);
        const result = await drizzleDb.get<{ found: number }>(
            sql`SELECT 1 AS found FROM shopify_orders WHERE order_id = ${String(orderId)} LIMIT 1`
        );

        // drizzle .get() returns `undefined` (not null) for no match — the old
        // `!== null` was true for a missing row, flagging every order processed.
        // Check the selected value explicitly so the result can't be ambiguous.
        return !!result?.found;
    }

    /**
     * Process a single order - deduct inventory and record
     */
    async processOrder(
        order: ShopifyOrder,
        skuMappings: Map<string, SkuMapping[]>
    ): Promise<{ itemsDeducted: number; errors: string[] }> {
        const errors: string[] = [];
        let itemsDeducted = 0;

        // Skip cancelled orders only
        if (order.cancelled_at) {
            return { itemsDeducted: 0, errors: [] };
        }

        // Process each line item
        for (const item of order.line_items) {
            if (!item.sku) {
                errors.push(`Order ${order.name}: Line item "${item.name}" has no SKU`);
                continue;
            }

            const mappings = skuMappings.get(item.sku);
            if (!mappings) {
                errors.push(`Order ${order.name}: Unknown SKU "${item.sku}"`);
                continue;
            }

            // Deduct inventory for each mapping
            for (const mapping of mappings) {
                const deductAmount = mapping.quantity * item.quantity;
                const drizzleDb = getDb(this.db);

                try {
                    const now = Math.floor(Date.now() / 1000);
                    await drizzleDb.run(sql`
                        UPDATE objects
                        SET in_stock = MAX(0, in_stock - ${deductAmount}), updated_at = ${now}
                        WHERE id = ${mapping.object_id}
                    `);
                    await drizzleDb.run(sql`
                        INSERT INTO inventory_log (object_id, change_type, quantity, created_at)
                        VALUES (${mapping.object_id}, '- sold b2c', ${deductAmount}, ${now})
                    `);
                    itemsDeducted += deductAmount;
                } catch (err) {
                    errors.push(`Order ${order.name}: Failed to deduct object #${mapping.object_id}: ${err}`);
                }
            }
        }

        // Record the processed order
        const drizzleDb = getDb(this.db);
        const now = Math.floor(Date.now() / 1000);
        await drizzleDb.run(sql`
            INSERT OR IGNORE INTO shopify_orders (order_id, order_number, processed_at, total_items, created_at, updated_at)
            VALUES (${String(order.id)}, ${String(order.order_number)}, ${now}, ${itemsDeducted}, ${now}, ${now})
        `);

        return { itemsDeducted, errors };
    }

    /**
     * Run a full sync - fetch new orders and process them
     * @param fetchAll - If true, fetches ALL historical orders (use for initial sync)
     */
    async sync(fetchAll = false): Promise<SyncResult> {
        const result: SyncResult = {
            success: true,
            ordersProcessed: 0,
            itemsDeducted: 0,
            skippedOrders: 0,
            errors: [],
            lastOrderId: null,
            debug: {
                ordersInTable: 0, fetched: 0, cancelled: 0, emptyLineItems: 0, noSkuItems: 0,
                unmappedItems: 0, mappableItems: 0, alreadyProcessed: 0, sample: null,
            },
        };
        const debug = result.debug!;

        try {
            const countRow = await getDb(this.db).get<{ n: number }>(
                sql`SELECT COUNT(*) AS n FROM shopify_orders`
            );
            debug.ordersInTable = countRow?.n ?? -1;

            // Get current state
            const syncState = await this.getSyncState();
            const skuMappings = await this.getSkuMappings();

            // Fetch orders from Shopify
            // If fetchAll is true, get ALL orders since last sync using pagination
            const orders = await this.client.getOrdersSince(
                syncState.last_order_id,
                fetchAll ? 250 : 50,
                fetchAll
            );

            debug.fetched = orders.length;
            if (orders[0]) {
                const o = orders[0];
                debug.sample = {
                    id: o.id,
                    cancelled_at: o.cancelled_at ?? null,
                    lineItems: o.line_items?.length ?? -1,
                    firstSku: o.line_items?.[0]?.sku ?? null,
                };
            }

            if (orders.length === 0) {
                // Update sync timestamp even if no new orders
                await this.updateSyncState(syncState.last_order_id, 0, 0);
                return result;
            }

            // Process each order
            for (const order of orders) {
                // Double-check we haven't processed this order
                if (await this.isOrderProcessed(order.id)) {
                    debug.alreadyProcessed++;
                    result.skippedOrders++;
                    continue;
                }

                // TEMP DEBUG — categorize where this order lands
                if (order.cancelled_at) debug.cancelled++;
                else if (!order.line_items || order.line_items.length === 0) debug.emptyLineItems++;
                else for (const it of order.line_items) {
                    if (!it.sku) debug.noSkuItems++;
                    else if (!skuMappings.has(it.sku)) debug.unmappedItems++;
                    else debug.mappableItems++;
                }

                const orderResult = await this.processOrder(order, skuMappings);
                
                if (orderResult.itemsDeducted > 0) {
                    result.ordersProcessed++;
                    result.itemsDeducted += orderResult.itemsDeducted;
                } else if (orderResult.errors.length === 0) {
                    // Order processed but no items (maybe all cancelled)
                    result.skippedOrders++;
                }

                result.errors.push(...orderResult.errors);
                result.lastOrderId = order.id;
            }

            // Update sync state
            if (result.lastOrderId) {
                await this.updateSyncState(
                    result.lastOrderId,
                    result.ordersProcessed,
                    result.itemsDeducted
                );
            }

        } catch (err) {
            result.success = false;
            result.errors.push(`Sync failed: ${err}`);
        }

        return result;
    }

    /**
     * Baseline: record every currently-fetchable order as processed WITHOUT
     * deducting any inventory. Use once when adopting the integration on a store
     * that already has order history + stock that already reflects those sales.
     * After this, only orders created afterwards will deduct.
     */
    async baseline(): Promise<{ recorded: number; alreadyPresent: number }> {
        const orders = await this.client.getOrdersSince(null, 250, true);
        const drizzleDb = getDb(this.db);
        const now = Math.floor(Date.now() / 1000);
        let recorded = 0;
        let alreadyPresent = 0;
        for (const order of orders) {
            const res = await drizzleDb.run(sql`
                INSERT OR IGNORE INTO shopify_orders
                    (order_id, order_number, processed_at, total_items, created_at, updated_at)
                VALUES (${String(order.id)}, ${String(order.order_number)}, ${now}, 0, ${now}, ${now})
            `);
            // D1 reports rows_written: 1 on insert, 0 when OR IGNORE skipped a dup.
            if (res.meta?.changes && res.meta.changes > 0) recorded++;
            else alreadyPresent++;
        }
        return { recorded, alreadyPresent };
    }

    /**
     * No-op: the shopify_sync table was removed; sync state is now derived
     * from shopify_orders (see getSyncState). Kept as a method so the call
     * site in sync() doesn't need to change.
     */
    private async updateSyncState(
        _lastOrderId: string | number | null,
        _ordersProcessed: number,
        _itemsDeducted: number,
    ): Promise<void> {
        // intentional no-op
    }

    /**
     * Get list of recently processed orders
     */
    async getRecentOrders(limit = 20): Promise<{
        order_id: string;
        order_number: string;
        processed_at: number;
        total_items: number;
    }[]> {
        const drizzleDb = getDb(this.db);
        const rows = await drizzleDb.all<{
            order_id: string;
            order_number: string;
            processed_at: number;
            total_items: number;
        }>(sql`
            SELECT order_id, order_number, processed_at, total_items
            FROM shopify_orders
            ORDER BY processed_at DESC
            LIMIT ${limit}
        `);

        return rows ?? [];
    }
}
